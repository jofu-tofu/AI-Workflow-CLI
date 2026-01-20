#!/usr/bin/env python3
"""
CC-Native Agent Review Hook

Claude Code PostToolUse hook that intercepts ExitPlanMode and
automatically reviews plans using multiple Claude Code agents in parallel.

Trigger: ExitPlanMode tool use

Features:
- Detects approved plans via ExitPlanMode PostToolUse
- Spawns headless Claude Code instances with --agent flag for each reviewer
- Runs all agents in parallel for faster review
- Aggregates results, writes artifacts under _output/cc-native/plans/agent-reviews/
- Returns feedback to Claude via hook additionalContext
- Optional blocking on FAIL verdict

Configuration: _cc-native/config.json -> agentReview

Agent definitions: .claude/agents/<agent-name>.md
"""

import json
import os
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add scripts directory to path for aggregate_agents import
_scripts_dir = Path(__file__).parent.parent / "scripts"
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

from aggregate_agents import aggregate_agents


# ---------------------------
# Agent Configuration
# ---------------------------

@dataclass
class AgentConfig:
    """Configuration for a Claude Code review agent."""
    name: str                      # Agent name - must match .claude/agents/<name>.md
    model: str = "sonnet"          # Model: "sonnet", "opus", "haiku"
    focus: str = ""                # Brief description for logging
    enabled: bool = True
    categories: List[str] = field(default_factory=lambda: ["code"])
    description: str = ""          # Full description for Task tool
    tools: str = ""                # Available tools (comma-separated)


@dataclass
class OrchestratorConfig:
    """Configuration for the plan orchestrator."""
    enabled: bool = True
    model: str = "haiku"
    timeout: int = 30


@dataclass
class OrchestratorResult:
    """Result from the plan orchestrator."""
    complexity: str  # simple | medium | high
    category: str    # code | infrastructure | documentation | life | business | design | research
    selected_agents: List[str]
    reasoning: str
    skip_reason: Optional[str] = None
    error: Optional[str] = None  # Set if orchestrator failed


# Default agents - can be overridden via config.json
DEFAULT_AGENTS: List[Dict[str, Any]] = [
    {
        "name": "architect-reviewer",
        "model": "sonnet",
        "focus": "architectural concerns and scalability",
        "enabled": True,
        "categories": ["code", "infrastructure", "design"],
    },
    {
        "name": "penetration-tester",
        "model": "sonnet",
        "focus": "security vulnerabilities and attack vectors",
        "enabled": True,
        "categories": ["code", "infrastructure"],
    },
    {
        "name": "performance-engineer",
        "model": "sonnet",
        "focus": "performance bottlenecks and optimization",
        "enabled": True,
        "categories": ["code", "infrastructure"],
    },
    {
        "name": "accessibility-tester",
        "model": "sonnet",
        "focus": "accessibility compliance and UX concerns",
        "enabled": True,
        "categories": ["code", "design"],
    },
]

# Default orchestrator config
DEFAULT_ORCHESTRATOR: Dict[str, Any] = {
    "enabled": True,
    "model": "haiku",
    "timeout": 30,
}

# Default agent selection rules by complexity
DEFAULT_AGENT_SELECTION: Dict[str, Any] = {
    "simple": {"min": 0, "max": 0},
    "medium": {"min": 1, "max": 2},
    "high": {"min": 2, "max": 4},
    "fallbackCount": 2,
}

# Default display limits
DEFAULT_DISPLAY: Dict[str, int] = {
    "maxIssues": 12,
    "maxMissingSections": 12,
    "maxQuestions": 12,
}

# Default sanitization limits
DEFAULT_SANITIZATION: Dict[str, int] = {
    "maxSessionIdLength": 32,
    "maxTitleLength": 50,
}

# Default complexity categories
DEFAULT_COMPLEXITY_CATEGORIES: List[str] = [
    "code", "infrastructure", "documentation",
    "life", "business", "design", "research"
]

# Default agent model
DEFAULT_AGENT_MODEL: str = "sonnet"


def load_agent_library(project_dir: Path, settings: Optional[Dict[str, Any]] = None) -> List[AgentConfig]:
    """Load agent library by auto-detecting from frontmatter.

    Reads .claude/agents/*.md files and extracts frontmatter to build
    the agent configuration list. Falls back to DEFAULT_AGENTS if no
    agents are found.

    Args:
        project_dir: Project root directory
        settings: Optional settings dict containing agentDefaults

    Returns:
        List of AgentConfig objects for enabled and disabled agents
    """
    agents_dir = project_dir / ".claude" / "agents" / "cc-native"
    agents_data = aggregate_agents(agents_dir)

    # Get default model from settings or use global default
    default_model = DEFAULT_AGENT_MODEL
    if settings:
        default_model = settings.get("agentDefaults", {}).get("model", DEFAULT_AGENT_MODEL)

    if not agents_data:
        eprint("[cc-native-agent-review] No agents found in frontmatter, using defaults")
        return [
            AgentConfig(
                name=a["name"],
                model=a.get("model", default_model),
                focus=a.get("focus", "general review"),
                enabled=a.get("enabled", True),
                categories=a.get("categories", ["code"]),
            )
            for a in DEFAULT_AGENTS
        ]

    agents = []
    for a in agents_data:
        # Skip orchestrator - it's not a review agent
        if a.get("name") == "plan-orchestrator":
            continue

        agents.append(AgentConfig(
            name=a["name"],
            model=a.get("model", default_model),
            focus=a.get("focus", "general review"),
            enabled=a.get("enabled", True),
            categories=a.get("categories", ["code"]),
            description=a.get("description", ""),
            tools=a.get("tools", ""),
        ))

    return agents


# ---------------------------
# Load settings from _cc-native/config.json
# ---------------------------

def load_settings(project_dir: Path) -> Dict[str, Any]:
    """Load CC-Native agent review settings from _cc-native/config.json

    Note: Agent library is now auto-detected from frontmatter in .claude/agents/*.md
    This function loads orchestrator, general settings, and new config sections.
    """
    settings_path = project_dir / "_cc-native" / "config.json"
    defaults = {
        "enabled": True,
        "orchestrator": DEFAULT_ORCHESTRATOR,
        "timeout": 120,
        "blockOnFail": True,
        "legacyMode": False,
        "maxTurns": 3,
        "display": DEFAULT_DISPLAY.copy(),
        "agentSelection": DEFAULT_AGENT_SELECTION.copy(),
        "agentDefaults": {"model": DEFAULT_AGENT_MODEL},
        "complexityCategories": DEFAULT_COMPLEXITY_CATEGORIES.copy(),
        "sanitization": DEFAULT_SANITIZATION.copy(),
    }

    if not settings_path.exists():
        return defaults

    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            all_settings = json.load(f)
        agent_review = all_settings.get("agentReview", {})

        # Merge with defaults
        merged = defaults.copy()
        merged.update(agent_review)

        # Ensure orchestrator config exists and merge maxTurns
        if "orchestrator" not in merged or not isinstance(merged["orchestrator"], dict):
            merged["orchestrator"] = DEFAULT_ORCHESTRATOR.copy()
        else:
            # Merge with defaults to fill missing keys
            orch = DEFAULT_ORCHESTRATOR.copy()
            orch.update(merged["orchestrator"])
            # Ensure orchestrator maxTurns exists
            orch["maxTurns"] = orch.get("maxTurns", 3)
            merged["orchestrator"] = orch

        # Load new sections with defaults (merge from all_settings root level)
        merged["maxTurns"] = agent_review.get("maxTurns", 3)
        merged["display"] = {**DEFAULT_DISPLAY, **agent_review.get("display", {})}

        # Load global sections from root of config
        merged["agentSelection"] = {**DEFAULT_AGENT_SELECTION, **all_settings.get("agentSelection", {})}
        merged["agentDefaults"] = {**{"model": DEFAULT_AGENT_MODEL}, **all_settings.get("agentDefaults", {})}
        merged["complexityCategories"] = all_settings.get("complexityCategories", DEFAULT_COMPLEXITY_CATEGORIES.copy())
        merged["sanitization"] = {**DEFAULT_SANITIZATION, **all_settings.get("sanitization", {})}

        return merged
    except Exception as e:
        eprint(f"[cc-native-agent-review] Failed to load settings: {e}")
        return defaults


# ---------------------------
# Review Schema (structured output)
# ---------------------------

REVIEW_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["pass", "warn", "fail"]},
        "summary": {"type": "string"},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                    "category": {"type": "string"},
                    "issue": {"type": "string"},
                    "suggested_fix": {"type": "string"},
                },
                "required": ["severity", "category", "issue", "suggested_fix"],
                "additionalProperties": False,
            },
        },
        "missing_sections": {"type": "array", "items": {"type": "string"}},
        "questions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["verdict", "summary", "issues", "missing_sections", "questions"],
    "additionalProperties": False,
}

# ---------------------------
# Orchestrator Schema (structured output)
# ---------------------------

ORCHESTRATOR_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "complexity": {"type": "string", "enum": ["simple", "medium", "high"]},
        "category": {"type": "string", "enum": ["code", "infrastructure", "documentation", "life", "business", "design", "research"]},
        "selectedAgents": {"type": "array", "items": {"type": "string"}},
        "reasoning": {"type": "string"},
        "skipReason": {"type": "string"},
    },
    "required": ["complexity", "category", "selectedAgents", "reasoning"],
    "additionalProperties": False,
}


@dataclass
class ReviewerResult:
    name: str
    ok: bool
    verdict: str  # pass|warn|fail|error|skip
    data: Dict[str, Any]
    raw: str
    err: str


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr)


def now_local() -> datetime:
    return datetime.now()


def project_dir(payload: Dict[str, Any]) -> Path:
    p = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    return Path(p)


def sanitize_filename(s: str, max_len: int = 32) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    return s.strip("._-")[:max_len] or "unknown"


def parse_json_maybe(text: str) -> Optional[Dict[str, Any]]:
    """Try strict JSON parse. If that fails, attempt to extract the first {...} block."""
    text = text.strip()
    if not text:
        return None
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
        return None
    except Exception:
        pass

    # Heuristic: try to extract a JSON object substring
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                return obj
        except Exception:
            return None
    return None


def coerce_to_review(obj: Optional[Dict[str, Any]]) -> Tuple[bool, str, Dict[str, Any]]:
    """Validate/normalize to our expected structure."""
    if not obj:
        return False, "error", {
            "verdict": "fail",
            "summary": "No structured output returned.",
            "issues": [{"severity": "high", "category": "tooling", "issue": "Reviewer returned no JSON.", "suggested_fix": "Retry or check agent configuration."}],
            "missing_sections": [],
            "questions": [],
        }

    verdict = obj.get("verdict")
    if verdict not in ("pass", "warn", "fail"):
        verdict = "warn"

    norm = {
        "verdict": verdict,
        "summary": str(obj.get("summary", "")).strip() or "No summary provided.",
        "issues": obj.get("issues") if isinstance(obj.get("issues"), list) else [],
        "missing_sections": obj.get("missing_sections") if isinstance(obj.get("missing_sections"), list) else [],
        "questions": obj.get("questions") if isinstance(obj.get("questions"), list) else [],
    }

    return True, verdict, norm


# ---------------------------
# Orchestrator Functions
# ---------------------------

def run_orchestrator(plan: str, agent_library: List[AgentConfig], config: OrchestratorConfig, settings: Dict[str, Any]) -> OrchestratorResult:
    """Run the orchestrator agent to analyze plan complexity and select reviewers."""
    eprint("[orchestrator] Starting plan analysis...")

    # Get selection rules and categories from settings
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

    # Build agent list for the prompt
    agent_list = "\n".join([
        f"- {a.name}: {a.focus} (categories: {', '.join(a.categories)})"
        for a in agent_library if a.enabled
    ])

    # Build category list for the prompt
    category_list = "/".join(categories)

    # Build selection rules for the prompt
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

    # Use full path to claude CLI (important for Windows where it may be a .CMD file)
    # Use empty settings to completely bypass project/user hooks that affect output
    # Pass prompt via stdin to avoid Windows shell escaping issues with multiline prompts

    # Get max turns from orchestrator config
    orch_max_turns = str(settings.get("orchestrator", {}).get("maxTurns", 3))

    cmd_args = [
        claude_path,
        "--agent", "plan-orchestrator",
        "--model", config.model,
        "--permission-mode", "bypassPermissions",
        "--output-format", "json",
        "--max-turns", orch_max_turns,
        "--json-schema", schema_json,
        "--settings", "{}",
    ]

    eprint(f"[orchestrator] Running with model: {config.model}, timeout: {config.timeout}s")

    try:
        # Pass prompt via stdin to avoid escaping issues
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

    # Parse the orchestrator output
    # Claude CLI --output-format json produces: {"type":"result", "structured_output": {...}, ...}
    obj = None
    try:
        result = json.loads(raw)
        if isinstance(result, dict):
            # Check for structured_output field (new format)
            if "structured_output" in result:
                obj = result["structured_output"]
                eprint("[orchestrator] Found structured_output in result")
            # Check for older event stream format (backwards compatibility)
            elif result.get("type") == "assistant":
                message = result.get("message", {})
                content = message.get("content", [])
                for item in content:
                    if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                        obj = item.get("input", {})
                        eprint("[orchestrator] Found StructuredOutput tool call")
                        break
        elif isinstance(result, list):
            # Legacy event stream format
            for event in result:
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "assistant":
                    message = event.get("message", {})
                    content = message.get("content", [])
                    for item in content:
                        if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                            obj = item.get("input", {})
                            eprint("[orchestrator] Found StructuredOutput tool call")
                            break
                    if obj:
                        break
    except json.JSONDecodeError as e:
        eprint(f"[orchestrator] JSON decode error: {e}")
        obj = parse_json_maybe(raw)
    except Exception as e:
        eprint(f"[orchestrator] Parse exception: {e}")
        obj = parse_json_maybe(raw)

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
    # Use categories from settings (already loaded at top of function)
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


def output_no_review_needed(orch_result: OrchestratorResult, review_file: Optional[Path] = None) -> Dict[str, Any]:
    """Build hook output when no agent review is needed."""
    skip_msg = orch_result.skip_reason or "Plan complexity is simple - CLI review is sufficient"

    context_msg = (
        f"**CC-Native Plan Orchestration Complete**\n\n"
        f"The plan orchestrator has analyzed your plan.\n\n"
        f"**Complexity:** `{orch_result.complexity}`\n"
        f"**Category:** `{orch_result.category}`\n"
        f"**Agents Selected:** None\n\n"
        f"**Reasoning:** {orch_result.reasoning}\n\n"
        f"**Skip Reason:** {skip_msg}\n\n"
        f"No specialized agent review required. You may proceed with implementation."
    )

    if review_file:
        context_msg += f"\n\nOrchestration log saved to: `{review_file}`"

    return {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": context_msg,
        }
    }


def run_agent_review(plan: str, agent: AgentConfig, schema: Dict[str, Any], timeout: int, max_turns: int = 3) -> ReviewerResult:
    """Run a single Claude Code agent to review the plan."""
    claude_path = shutil.which("claude")
    if claude_path is None:
        eprint(f"[{agent.name}] Claude CLI not found on PATH")
        eprint(f"[{agent.name}] PATH = {os.environ.get('PATH', '')}")
        return ReviewerResult(
            name=agent.name,
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="claude CLI not found on PATH",
        )

    eprint(f"[{agent.name}] Found Claude CLI at: {claude_path}")

    prompt = f"""IMPORTANT: You must analyze this plan and output your review immediately using StructuredOutput. Do NOT ask questions or request clarification - analyze what is provided and give your assessment.

You are a senior staff software engineer acting as a strict plan reviewer.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)

Analyze the plan now and call StructuredOutput with your verdict (pass/warn/fail), summary, issues array, missing_sections array, and questions array.

PLAN:
<<<
{plan}
>>>
"""

    # Convert schema to JSON string for --json-schema flag
    schema_json = json.dumps(schema, ensure_ascii=False)

    # Use full path to claude CLI (important for Windows where it may be a .CMD file)
    # Use empty settings to completely bypass project/user hooks that affect output
    # Pass prompt via stdin to avoid Windows shell escaping issues with multiline prompts

    cmd_args = [
        claude_path,
        "--agent", agent.name,
        "--model", agent.model,
        "--permission-mode", "bypassPermissions",
        "--output-format", "json",
        "--max-turns", str(max_turns),
        "--json-schema", schema_json,
        "--settings", "{}",
    ]

    eprint(f"[{agent.name}] Running command: claude <stdin> --agent {agent.name} --model {agent.model} --permission-mode bypassPermissions --output-format json --max-turns {max_turns} --json-schema <schema> --settings {{}}")

    try:
        # Pass prompt via stdin to avoid escaping issues
        p = subprocess.run(
            cmd_args,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.TimeoutExpired:
        eprint(f"[{agent.name}] TIMEOUT after {timeout}s")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[{agent.name}] EXCEPTION: {ex}")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} failed to run: {ex}")

    eprint(f"[{agent.name}] Exit code: {p.returncode}")
    eprint(f"[{agent.name}] stdout length: {len(p.stdout or '')} chars")
    eprint(f"[{agent.name}] stderr length: {len(p.stderr or '')} chars")
    if p.stderr:
        eprint(f"[{agent.name}] stderr: {p.stderr[:500]}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    if raw:
        eprint(f"[{agent.name}] stdout preview: {raw[:500]}")

    # Claude CLI --output-format json produces: {"type":"result", "structured_output": {...}, ...}
    obj = None
    try:
        result = json.loads(raw)
        if isinstance(result, dict):
            # Check for structured_output field (new format)
            if "structured_output" in result:
                obj = result["structured_output"]
                eprint(f"[{agent.name}] Found structured_output in result")
            # Check for older event stream format (backwards compatibility)
            elif result.get("type") == "assistant":
                message = result.get("message", {})
                content = message.get("content", [])
                for item in content:
                    if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                        obj = item.get("input", {})
                        eprint(f"[{agent.name}] Found StructuredOutput tool call")
                        break
        elif isinstance(result, list):
            # Legacy event stream format
            for event in result:
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "assistant":
                    message = event.get("message", {})
                    content = message.get("content", [])
                    for item in content:
                        if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                            obj = item.get("input", {})
                            eprint(f"[{agent.name}] Found StructuredOutput tool call")
                            break
                    if obj:
                        break
    except json.JSONDecodeError as e:
        eprint(f"[{agent.name}] JSON parse exception: {e}")
        obj = parse_json_maybe(raw)
    except Exception as e:
        eprint(f"[{agent.name}] Unexpected exception: {e}")
        obj = parse_json_maybe(raw)

    if obj:
        eprint(f"[{agent.name}] Parsed JSON successfully, verdict: {obj.get('verdict', 'N/A')}")
    else:
        eprint(f"[{agent.name}] Failed to parse JSON from output")

    ok, verdict, norm = coerce_to_review(obj)

    return ReviewerResult(agent.name, ok, verdict, norm, raw, err)


def worst_verdict(verdicts: List[str]) -> str:
    """Return the worst verdict from a list."""
    order = {"pass": 0, "warn": 1, "fail": 2, "skip": 0, "error": 1}
    worst = "pass"
    for v in verdicts:
        if order.get(v, 1) > order.get(worst, 0):
            worst = v
    if worst == "error":
        return "warn"
    return worst


def format_markdown(plan: str, results: List[ReviewerResult], overall: str, settings: Optional[Dict[str, Any]] = None) -> str:
    """Format review results as markdown."""
    # Get display limits from settings
    display = DEFAULT_DISPLAY.copy()
    if settings:
        display = settings.get("display", DEFAULT_DISPLAY)

    max_issues = display.get("maxIssues", 12)
    max_missing = display.get("maxMissingSections", 12)
    max_questions = display.get("maxQuestions", 12)

    lines: List[str] = []
    lines.append("# CC-Native Agent Plan Review\n")
    lines.append(f"**Overall verdict:** `{overall.upper()}`\n")

    for r in results:
        lines.append(f"## {r.name}\n")
        lines.append(f"- ok: `{r.ok}`")
        lines.append(f"- verdict: `{r.verdict}`")
        if r.data:
            lines.append(f"- summary: {r.data.get('summary','').strip()}")
            issues = r.data.get("issues", [])
            if issues:
                lines.append("\n### Issues")
                for it in issues[:max_issues]:
                    sev = it.get("severity", "medium")
                    cat = it.get("category", "general")
                    issue = it.get("issue", "")
                    fix = it.get("suggested_fix", "")
                    lines.append(f"- **[{sev}] {cat}**: {issue}\n  - fix: {fix}")
            missing = r.data.get("missing_sections", [])
            if missing:
                lines.append("\n### Missing Sections")
                for m in missing[:max_missing]:
                    lines.append(f"- {m}")
            qs = r.data.get("questions", [])
            if qs:
                lines.append("\n### Questions")
                for q in qs[:max_questions]:
                    lines.append(f"- {q}")
        else:
            lines.append(f"- note: {r.err or 'no structured output'}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"


def write_artifacts(base: Path, plan: str, md: str, results: List[ReviewerResult], payload: Dict[str, Any]) -> Path:
    """Write review artifacts to _output/cc-native/plans/agent-reviews/."""
    ts = now_local()
    date_folder = ts.strftime("%Y-%m-%d")
    time_part = ts.strftime("%H%M%S")
    sid = sanitize_filename(str(payload.get("session_id", "unknown")))

    out_dir = base / "_output" / "cc-native" / "plans" / "agent-reviews" / date_folder
    out_dir.mkdir(parents=True, exist_ok=True)

    plan_path = out_dir / f"{time_part}-session-{sid}-plan.md"
    review_path = out_dir / f"{time_part}-session-{sid}-agents-review.md"

    plan_path.write_text(plan, encoding="utf-8")
    review_path.write_text(md, encoding="utf-8")

    for r in results:
        if r.data:
            (out_dir / f"{time_part}-session-{sid}-{r.name}.json").write_text(
                json.dumps(r.data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    return review_path


def main() -> int:
    eprint("[cc-native-agent-review] Hook started")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[cc-native-agent-review] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name")
    eprint(f"[cc-native-agent-review] tool_name: {tool_name}")

    # Only process ExitPlanMode
    if tool_name != "ExitPlanMode":
        eprint("[cc-native-agent-review] Skipping: not ExitPlanMode")
        return 0

    # Load settings
    base = project_dir(payload)
    settings = load_settings(base)

    if not settings.get("enabled", True):
        eprint("[cc-native-agent-review] Skipping: agent review disabled in settings")
        return 0

    tool_response = payload.get("tool_response") or {}

    # Plan is in tool_response.plan for PostToolUse hooks
    plan = str(tool_response.get("plan", "")).strip()
    if not plan:
        eprint("[cc-native-agent-review] Skipping: no plan content")
        return 0

    eprint(f"[cc-native-agent-review] Plan length: {len(plan)} chars")

    # Load agent library from frontmatter auto-detection
    agent_library = load_agent_library(base, settings)
    timeout = settings.get("timeout", 120)
    legacy_mode = settings.get("legacyMode", False)

    # Build orchestrator config
    orch_settings = settings.get("orchestrator", DEFAULT_ORCHESTRATOR)
    orchestrator_config = OrchestratorConfig(
        enabled=orch_settings.get("enabled", True),
        model=orch_settings.get("model", "haiku"),
        timeout=orch_settings.get("timeout", 30),
    )

    # Filter to only enabled agents
    enabled_agents = [a for a in agent_library if a.enabled]

    eprint(f"[cc-native-agent-review] Agent library: {[a.name for a in agent_library]}")
    eprint(f"[cc-native-agent-review] Enabled agents: {[a.name for a in enabled_agents]}")
    eprint(f"[cc-native-agent-review] Legacy mode: {legacy_mode}")
    eprint(f"[cc-native-agent-review] Orchestrator enabled: {orchestrator_config.enabled}")

    if not enabled_agents:
        eprint("[cc-native-agent-review] No agents enabled, exiting")
        return 0

    # ---------------------------
    # ORCHESTRATION PHASE
    # ---------------------------
    orch_result: Optional[OrchestratorResult] = None
    selected_agents: List[AgentConfig] = []

    if orchestrator_config.enabled and not legacy_mode:
        eprint("[cc-native-agent-review] Running orchestrator phase...")
        orch_result = run_orchestrator(plan, enabled_agents, orchestrator_config, settings)

        # If simple complexity, no agents needed
        if orch_result.complexity == "simple" and not orch_result.selected_agents:
            eprint("[cc-native-agent-review] Orchestrator determined: simple complexity, no review needed")
            out = output_no_review_needed(orch_result)
            print(json.dumps(out, ensure_ascii=False))
            return 0

        # Filter to only selected agents
        selected_names = set(orch_result.selected_agents)
        selected_agents = [a for a in enabled_agents if a.name in selected_names]

        # If orchestrator selected agents that don't exist, fall back to category matching
        if not selected_agents and selected_names:
            eprint(f"[cc-native-agent-review] Warning: orchestrator selected unknown agents: {selected_names}")
            # Fall back to agents matching the category
            selected_agents = [
                a for a in enabled_agents
                if orch_result.category in a.categories
            ]

        eprint(f"[cc-native-agent-review] Orchestrator selected: {[a.name for a in selected_agents]}")
    else:
        # Legacy mode: run all enabled agents
        eprint("[cc-native-agent-review] Running in legacy mode (all enabled agents)")
        selected_agents = enabled_agents

    if not selected_agents:
        eprint("[cc-native-agent-review] No agents selected, exiting")
        if orch_result:
            out = output_no_review_needed(orch_result)
            print(json.dumps(out, ensure_ascii=False))
        return 0

    # ---------------------------
    # AGENT REVIEW PHASE
    # ---------------------------
    results: List[ReviewerResult] = []

    # Run selected agents in parallel
    max_turns = settings.get("maxTurns", 3)
    with ThreadPoolExecutor(max_workers=len(selected_agents)) as executor:
        futures = {
            executor.submit(run_agent_review, plan, agent, REVIEW_SCHEMA, timeout, max_turns): agent
            for agent in selected_agents
        }
        for future in as_completed(futures):
            agent = futures[future]
            try:
                result = future.result()
                results.append(result)
                eprint(f"[cc-native-agent-review] {agent.name} completed with verdict: {result.verdict}")
            except Exception as ex:
                eprint(f"[cc-native-agent-review] {agent.name} failed with exception: {ex}")
                results.append(ReviewerResult(
                    name=agent.name,
                    ok=False,
                    verdict="error",
                    data={},
                    raw="",
                    err=str(ex),
                ))

    if not results:
        eprint("[cc-native-agent-review] No results, exiting")
        return 0

    overall = worst_verdict([r.verdict for r in results if r.verdict])

    md = format_markdown(plan, results, overall, settings)

    # Add orchestrator info to markdown if available
    if orch_result:
        orch_info = (
            f"\n## Orchestration\n\n"
            f"- **Complexity:** `{orch_result.complexity}`\n"
            f"- **Category:** `{orch_result.category}`\n"
            f"- **Reasoning:** {orch_result.reasoning}\n"
        )
        md = md.replace("# CC-Native Agent Plan Review\n", f"# CC-Native Agent Plan Review\n{orch_info}")

    review_file = write_artifacts(base, plan, md, results, payload)
    eprint(f"[cc-native-agent-review] Saved review: {review_file}")

    # Build Claude Code hook JSON output
    context_parts = [
        f"**CC-Native Agent Plan Review Complete**\n\n",
    ]

    if orch_result:
        context_parts.append(
            f"**Orchestration:** Complexity=`{orch_result.complexity}`, "
            f"Category=`{orch_result.category}`, "
            f"Agents selected: {len(selected_agents)}/{len(enabled_agents)}\n\n"
        )

    context_parts.extend([
        f"Claude Code agents have analyzed your plan in parallel.\n",
        f"Review saved to: `{review_file}`\n\n",
        f"Use these findings before starting implementation.\n\n",
        md,
    ])

    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": "".join(context_parts),
        }
    }

    block_on_fail = settings.get("blockOnFail", True)
    if overall == "fail" and block_on_fail:
        out["decision"] = "block"
        out["reason"] = (
            "Agent plan review verdict = FAIL. Do NOT start implementation yet. "
            "Revise the plan to address the high-severity issues and missing sections, "
            "then present an updated plan."
        )

    # Print JSON to stdout for Claude Code to process
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
