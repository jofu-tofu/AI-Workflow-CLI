"""
CC-Native Plan Orchestrator Module.

Analyzes plan complexity and selects appropriate reviewers.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Import from parent lib
_lib_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_lib_dir))

from utils import OrchestratorResult, eprint, parse_json_maybe
from reviewers.base import AgentConfig, OrchestratorConfig


# ---------------------------
# Constants
# ---------------------------

DEFAULT_AGENT_SELECTION: Dict[str, Any] = {
    "simple": {"min": 0, "max": 0},
    "medium": {"min": 1, "max": 2},
    "high": {"min": 2, "max": 4},
    "fallbackCount": 2,
}

DEFAULT_COMPLEXITY_CATEGORIES: List[str] = [
    "code",
    "infrastructure",
    "documentation",
    "life",
    "business",
    "design",
    "research",
]

ORCHESTRATOR_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "complexity": {"type": "string", "enum": ["simple", "medium", "high"]},
        "category": {"type": "string", "enum": DEFAULT_COMPLEXITY_CATEGORIES},
        "selectedAgents": {"type": "array", "items": {"type": "string"}},
        "reasoning": {"type": "string"},
        "skipReason": {"type": "string"},
    },
    "required": ["complexity", "category", "selectedAgents", "reasoning"],
    "additionalProperties": False,
}


# ---------------------------
# Output Parsing
# ---------------------------

def _parse_claude_output(raw: str) -> Optional[Dict[str, Any]]:
    """Parse Claude CLI JSON output, handling various formats.

    Claude CLI can output in several formats:
    - Direct structured_output dict
    - Assistant message with StructuredOutput tool use
    - List of events with assistant messages

    Args:
        raw: Raw stdout from Claude CLI

    Returns:
        Parsed JSON dict or None if parsing failed
    """
    try:
        result = json.loads(raw)
        if isinstance(result, dict):
            if "structured_output" in result:
                eprint("[orchestrator:parse] Found structured_output in root dict")
                return result["structured_output"]
            if result.get("type") == "assistant":
                message = result.get("message", {})
                content = message.get("content", [])
                for item in content:
                    if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                        eprint("[orchestrator:parse] Found StructuredOutput in assistant message content")
                        return item.get("input", {})
                eprint("[orchestrator:parse] Assistant message found but no StructuredOutput tool use in content")
        elif isinstance(result, list):
            eprint(f"[orchestrator:parse] Received list of {len(result)} events, searching for assistant message")
            for i, event in enumerate(result):
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "assistant":
                    message = event.get("message", {})
                    content = message.get("content", [])
                    for item in content:
                        if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                            eprint(f"[orchestrator:parse] Found StructuredOutput in event[{i}] assistant message")
                            return item.get("input", {})
            eprint("[orchestrator:parse] No StructuredOutput found in any assistant message in event list")
    except json.JSONDecodeError as e:
        eprint(f"[orchestrator:parse] JSON decode error: {e}")
    except Exception as e:
        eprint(f"[orchestrator:parse] Unexpected error during structured parsing: {e}")

    # Fallback to heuristic extraction
    eprint("[orchestrator:parse] No structured output found, falling back to heuristic JSON extraction")
    return parse_json_maybe(raw)


# ---------------------------
# Orchestrator
# ---------------------------

def run_orchestrator(
    plan: str,
    agent_library: List[AgentConfig],
    config: OrchestratorConfig,
    settings: Dict[str, Any],
) -> OrchestratorResult:
    """Run the orchestrator agent to analyze plan complexity and select reviewers.

    Args:
        plan: The plan content to analyze
        agent_library: List of available agents
        config: Orchestrator configuration (model, timeout, max_turns)
        settings: Agent review settings (agentSelection, complexityCategories)

    Returns:
        OrchestratorResult with complexity, category, and selected agents
    """
    eprint("[orchestrator] Starting plan analysis...")

    selection = settings.get("agentSelection", DEFAULT_AGENT_SELECTION)
    categories = settings.get("complexityCategories", DEFAULT_COMPLEXITY_CATEGORIES)
    fallback_count = selection.get("fallbackCount", 2)

    claude_path = shutil.which("claude")
    if claude_path is None:
        eprint("[orchestrator] Claude CLI not found on PATH, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count],
            reasoning="Orchestrator skipped - Claude CLI not found",
            error="claude CLI not found on PATH",
        )

    eprint(f"[orchestrator] Found Claude CLI at: {claude_path}")

    # Build agent list for prompt
    agent_list = "\n".join([
        f"- {a.name}: {a.focus} (categories: {', '.join(a.categories)})"
        for a in agent_library if a.enabled
    ])
    category_list = "/".join(categories)
    simple_range = f"{selection.get('simple', {}).get('min', 0)}-{selection.get('simple', {}).get('max', 0)}"
    medium_range = f"{selection.get('medium', {}).get('min', 1)}-{selection.get('medium', {}).get('max', 2)}"
    high_range = f"{selection.get('high', {}).get('min', 2)}-{selection.get('high', {}).get('max', 4)}"

    prompt = f"""IMPORTANT: Analyze this plan and output your decision immediately using StructuredOutput. Do NOT ask questions.

You are a plan orchestrator. Analyze the plan below and determine:
1. Complexity level (simple/medium/high)
2. Category ({category_list})
3. Which agents (if any) should review this plan

Available agents:
{agent_list}

Rules:
- simple complexity = {simple_range} agents (CLI review sufficient)
- medium complexity = {medium_range} agents
- high complexity = {high_range} agents
- Only select agents whose categories match the plan category
- Non-technical plans (life, business) typically need 0 code-focused agents

Analyze and call StructuredOutput with your decision now.

PLAN:
<<<
{plan}
>>>
"""

    schema_json = json.dumps(ORCHESTRATOR_SCHEMA, ensure_ascii=False)

    cmd_args = [
        claude_path,
        "--agent", "plan-orchestrator",
        "--model", config.model,
        "--permission-mode", "bypassPermissions",
        "--output-format", "json",
        "--max-turns", str(config.max_turns),
        "--json-schema", schema_json,
        "--settings", "{}",
    ]

    eprint(f"[orchestrator] Running with model: {config.model}, timeout: {config.timeout}s")

    try:
        p = subprocess.run(
            cmd_args,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=config.timeout,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        eprint(f"[orchestrator] TIMEOUT after {config.timeout}s, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count],
            reasoning="Orchestrator timed out - defaulting to medium complexity",
            error=f"Orchestrator timed out after {config.timeout}s",
        )
    except Exception as ex:
        eprint(f"[orchestrator] EXCEPTION: {ex}, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count],
            reasoning=f"Orchestrator failed: {ex}",
            error=str(ex),
        )

    eprint(f"[orchestrator] Exit code: {p.returncode}")

    raw = (p.stdout or "").strip()
    if p.stderr:
        eprint(f"[orchestrator] stderr: {p.stderr[:300]}")

    obj = _parse_claude_output(raw)
    if not obj:
        eprint("[orchestrator] Failed to parse output, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count],
            reasoning="Orchestrator output could not be parsed",
            error="Failed to parse orchestrator output",
        )

    # Extract and validate fields
    complexity = obj.get("complexity", "medium")
    if complexity not in ("simple", "medium", "high"):
        complexity = "medium"

    category = obj.get("category", "code")
    if category not in categories:
        category = "code"

    selected_agents = obj.get("selectedAgents", [])
    if not isinstance(selected_agents, list):
        selected_agents = []

    reasoning = str(obj.get("reasoning", "")).strip() or "No reasoning provided"
    skip_reason = obj.get("skipReason")

    eprint(f"[orchestrator] Result: complexity={complexity}, category={category}, agents={selected_agents}")
    eprint(f"[orchestrator] Reasoning: {reasoning}")

    return OrchestratorResult(
        complexity=complexity,
        category=category,
        selected_agents=selected_agents,
        reasoning=reasoning,
        skip_reason=skip_reason if skip_reason else None,
    )
