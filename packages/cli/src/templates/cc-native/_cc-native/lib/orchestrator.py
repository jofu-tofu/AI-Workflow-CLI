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

# Import shared subprocess utilities
_shared_lib = Path(__file__).resolve().parent.parent.parent / "_shared" / "lib" / "base"
sys.path.insert(0, str(_shared_lib))
from subprocess_utils import get_internal_subprocess_env


# ---------------------------
# Constants
# ---------------------------

DEFAULT_AGENT_SELECTION: Dict[str, Any] = {
    "simple": {"min": 3, "max": 3},
    "medium": {"min": 8, "max": 8},
    "high": {"min": 12, "max": 12},
    "fallbackCount": 3,
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


def build_orchestrator_schema(
    valid_agent_names: List[str],
    categories: List[str],
) -> Dict[str, Any]:
    """Build orchestrator JSON schema with enum-constrained agent names.

    When valid_agent_names is non-empty, selectedAgents items are constrained
    to only those names via JSON schema enum. This prevents the LLM from
    hallucinating or misspelling agent names.

    Args:
        valid_agent_names: List of valid agent names for enum constraint.
        categories: List of valid complexity categories.

    Returns:
        JSON schema dict for orchestrator structured output.
    """
    items_schema: Dict[str, Any] = {"type": "string"}
    if valid_agent_names:
        items_schema["enum"] = valid_agent_names

    return {
        "type": "object",
        "properties": {
            "complexity": {"type": "string", "enum": ["simple", "medium", "high"]},
            "category": {"type": "string", "enum": categories},
            "selectedAgents": {
                "type": "array",
                "items": items_schema,
            },
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
    mandatory_names: Optional[set] = None,
) -> OrchestratorResult:
    """Run the orchestrator agent to analyze plan complexity and select reviewers.

    Args:
        plan: The plan content to analyze
        agent_library: List of available agents
        config: Orchestrator configuration (model, timeout)
        settings: Agent review settings (agentSelection, complexityCategories)
        mandatory_names: Set of agent names that always run (excluded from selection)

    Returns:
        OrchestratorResult with complexity, category, and selected agents
    """
    eprint("[orchestrator] Starting plan analysis...")

    if mandatory_names is None:
        mandatory_names = set()

    selection = settings.get("agentSelection", DEFAULT_AGENT_SELECTION)
    categories = settings.get("complexityCategories", DEFAULT_COMPLEXITY_CATEGORIES)
    fallback_count = selection.get("fallbackCount", 2)

    # Filter out mandatory agents — they always run, no need for orchestrator to select them
    non_mandatory = [a for a in agent_library if a.enabled and a.name not in mandatory_names]
    valid_names = [a.name for a in non_mandatory]

    eprint(f"[orchestrator] Mandatory agents (always run): {sorted(mandatory_names)}")
    eprint(f"[orchestrator] Non-mandatory agents for selection: {valid_names}")

    claude_path = shutil.which("claude")
    if claude_path is None:
        eprint("[orchestrator] Claude CLI not found on PATH, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in non_mandatory][:fallback_count],
            reasoning="Orchestrator skipped - Claude CLI not found",
            error="claude CLI not found on PATH",
        )

    eprint(f"[orchestrator] Found Claude CLI at: {claude_path}")

    # Build agent list from non-mandatory agents only
    agent_list = "\n".join([
        f"- {a.name} [{', '.join(a.categories)}]\n"
        f"  Focus: {a.focus}\n"
        f"  Expertise: {a.description}"
        for a in non_mandatory
    ])
    category_list = "/".join(categories)

    # Compute additional agent counts (total minus mandatory count)
    mandatory_count = len([a for a in agent_library if a.name in mandatory_names])
    simple_additional = max(0, selection.get("simple", {}).get("max", 3) - mandatory_count)
    medium_additional = max(0, selection.get("medium", {}).get("max", 8) - mandatory_count)
    high_additional = max(0, selection.get("high", {}).get("max", 12) - mandatory_count)

    # System prompt with orchestrator instructions
    system_prompt = """You are a plan orchestrator for code review. Your job is to analyze plans and select appropriate reviewer agents.

You MUST call StructuredOutput immediately with your analysis. Do NOT ask questions or use any other tools.

When selecting agents:
- Match agent expertise to plan requirements
- Consider what each agent specializes in
- Only select agents whose categories match the plan category
- Fewer agents for simple plans, more for complex plans"""

    # User prompt with plan and agent list
    prompt = f"""Analyze this plan and select appropriate reviewer agents.

Available agents (select ONLY from this list):
{agent_list}

Selection rules (number of ADDITIONAL agents to select from the list above):
- simple complexity = {simple_additional} agents
- medium complexity = {medium_additional} agents
- high complexity = {high_additional} agents
- Only select agents whose categories match the plan category ({category_list})
- Non-technical plans (life, business) typically need 0 code-focused agents
- Note: mandatory agents run separately and are NOT listed above

PLAN:
<<<
{plan}
>>>

Call StructuredOutput now with: complexity, category, selectedAgents, reasoning"""

    # Use dynamic schema with enum constraint when we have valid agent names
    schema = build_orchestrator_schema(valid_names, categories) if valid_names else ORCHESTRATOR_SCHEMA
    schema_json = json.dumps(schema, ensure_ascii=False)

    cmd_args = [
        claude_path,
        "-p",  # Enable print mode to read prompt from stdin
        "--model", config.model,
        "--output-format", "json",
        "--json-schema", schema_json,
        "--max-turns", "3",  # Single-turn with buffer for tool call + result
        "--setting-sources", "",  # Disable PAI context interference
        "--system-prompt", system_prompt,
    ]

    eprint(f"[orchestrator] Running with model: {config.model}, timeout: {config.timeout}s")

    # Get environment for internal subprocess (bypasses hooks)
    env = get_internal_subprocess_env()

    try:
        p = subprocess.run(
            cmd_args,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=config.timeout,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
    except subprocess.TimeoutExpired:
        eprint(f"[orchestrator] TIMEOUT after {config.timeout}s, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in non_mandatory][:fallback_count],
            reasoning="Orchestrator timed out - defaulting to medium complexity",
            error=f"Orchestrator timed out after {config.timeout}s",
        )
    except Exception as ex:
        eprint(f"[orchestrator] EXCEPTION: {ex}, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in non_mandatory][:fallback_count],
            reasoning=f"Orchestrator failed: {ex}",
            error=str(ex),
        )

    eprint(f"[orchestrator] Exit code: {p.returncode}")

    raw = (p.stdout or "").strip()
    if p.stderr:
        eprint(f"[orchestrator] stderr: {p.stderr[:300]}")

    obj = _parse_claude_output(raw)

    # Debug logging to diagnose empty selectedAgents issue
    eprint(f"[orchestrator:debug] Raw output length: {len(raw)} chars")
    if raw:
        eprint(f"[orchestrator:debug] Raw output (first 500 chars): {raw[:500]}")
    eprint(f"[orchestrator:debug] Parsed obj: {obj}")
    if obj:
        eprint(f"[orchestrator:debug] obj keys: {list(obj.keys())}")
        eprint(f"[orchestrator:debug] selectedAgents value: {obj.get('selectedAgents', 'MISSING')}")
        eprint(f"[orchestrator:debug] reasoning value: {obj.get('reasoning', 'MISSING')}")

    if not obj:
        eprint("[orchestrator] Failed to parse output, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium",
            category="code",
            selected_agents=[a.name for a in non_mandatory][:fallback_count],
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
