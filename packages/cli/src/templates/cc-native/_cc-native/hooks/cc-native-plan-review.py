#!/usr/bin/env python3
"""
CC-Native Plan Review Hook (Unified)

Claude Code PreToolUse hook that intercepts ExitPlanMode and
automatically reviews plans using:
1. CLI reviewers (Codex + Gemini)
2. Plan orchestrator for complexity analysis
3. Claude Code agents in parallel

Trigger: ExitPlanMode tool use (PreToolUse - runs BEFORE user approval prompt)

Features:
- Detects plans via ExitPlanMode PreToolUse
- Phase 1: Runs CLI reviewers (Codex/Gemini) if enabled
- Phase 2: Runs orchestrator to analyze complexity and select agents
- Phase 3: Runs selected agents in parallel
- Phase 4: Generates combined output (single JSON + single Markdown)
- Returns feedback to Claude via hook additionalContext
- Optional blocking on FAIL verdict

Configuration: _cc-native/config.json -> planReview, agentReview

Output: _output/cc-native/plans/reviews/{YYYY-MM-DD}/
  - HHMMSS-session-{id}-plan.md
  - HHMMSS-session-{id}-review.json
  - HHMMSS-session-{id}-review.md
"""

import json
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Import shared library
try:
    _lib = Path(__file__).parent.parent / "lib"
    sys.path.insert(0, str(_lib))
    from utils import (
        DEFAULT_DISPLAY,
        DEFAULT_SANITIZATION,
        REVIEW_SCHEMA,
        ReviewerResult,
        OrchestratorResult,
        CombinedReviewResult,
        eprint,
        project_dir,
        find_plan_file,
        compute_plan_hash,
        is_plan_already_reviewed,
        mark_plan_reviewed,
        parse_json_maybe,
        coerce_to_review,
        worst_verdict,
        format_combined_markdown,
        write_combined_artifacts,
        load_config,
        get_display_settings,
    )
except ImportError as e:
    print(f"[cc-native-plan-review] Failed to import lib: {e}", file=sys.stderr)
    sys.exit(0)  # Non-blocking failure

# Add scripts directory to path for aggregate_agents import
_scripts_dir = Path(__file__).parent.parent / "scripts"
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

try:
    from aggregate_agents import aggregate_agents
except ImportError:
    def aggregate_agents(agents_dir: Path) -> List[Dict[str, Any]]:
        eprint("[cc-native-plan-review] Warning: aggregate_agents not found")
        return []


# ---------------------------
# Agent Configuration
# ---------------------------

@dataclass
class AgentConfig:
    """Configuration for a Claude Code review agent."""
    name: str
    model: str = "sonnet"
    focus: str = ""
    enabled: bool = True
    categories: List[str] = field(default_factory=lambda: ["code"])
    description: str = ""
    tools: str = ""


@dataclass
class OrchestratorConfig:
    """Configuration for the plan orchestrator."""
    enabled: bool = True
    model: str = "haiku"
    timeout: int = 30
    max_turns: int = 3


# Default configurations
DEFAULT_AGENTS: List[Dict[str, Any]] = [
    {"name": "architect-reviewer", "model": "sonnet", "focus": "architectural concerns and scalability", "enabled": True, "categories": ["code", "infrastructure", "design"]},
    {"name": "penetration-tester", "model": "sonnet", "focus": "security vulnerabilities and attack vectors", "enabled": True, "categories": ["code", "infrastructure"]},
    {"name": "performance-engineer", "model": "sonnet", "focus": "performance bottlenecks and optimization", "enabled": True, "categories": ["code", "infrastructure"]},
    {"name": "accessibility-tester", "model": "sonnet", "focus": "accessibility compliance and UX concerns", "enabled": True, "categories": ["code", "design"]},
]

DEFAULT_ORCHESTRATOR: Dict[str, Any] = {"enabled": True, "model": "haiku", "timeout": 30, "maxTurns": 3}
DEFAULT_AGENT_SELECTION: Dict[str, Any] = {"simple": {"min": 0, "max": 0}, "medium": {"min": 1, "max": 2}, "high": {"min": 2, "max": 4}, "fallbackCount": 2}
DEFAULT_COMPLEXITY_CATEGORIES: List[str] = ["code", "infrastructure", "documentation", "life", "business", "design", "research"]
DEFAULT_AGENT_MODEL: str = "sonnet"

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
# Settings Loading
# ---------------------------

def load_settings(proj_dir: Path) -> Dict[str, Any]:
    """Load CC-Native settings from _cc-native/config.json"""
    defaults = {
        "planReview": {
            "enabled": True,
            "reviewers": {
                "codex": {"enabled": True, "model": "", "timeout": 120},
                "gemini": {"enabled": False, "model": "", "timeout": 120},
            },
            "blockOnFail": False,
            "display": DEFAULT_DISPLAY.copy(),
        },
        "agentReview": {
            "enabled": True,
            "orchestrator": DEFAULT_ORCHESTRATOR.copy(),
            "timeout": 120,
            "blockOnFail": True,
            "legacyMode": False,
            "maxTurns": 3,
            "display": DEFAULT_DISPLAY.copy(),
            "agentSelection": DEFAULT_AGENT_SELECTION.copy(),
            "agentDefaults": {"model": DEFAULT_AGENT_MODEL},
            "complexityCategories": DEFAULT_COMPLEXITY_CATEGORIES.copy(),
            "sanitization": DEFAULT_SANITIZATION.copy(),
        },
    }

    config = load_config(proj_dir)
    if not config:
        return defaults

    # Merge planReview settings
    plan_review = config.get("planReview", {})
    merged_plan = defaults["planReview"].copy()
    merged_plan.update(plan_review)
    if "reviewers" in plan_review:
        merged_plan["reviewers"] = defaults["planReview"]["reviewers"].copy()
        merged_plan["reviewers"].update(plan_review["reviewers"])
    merged_plan["display"] = get_display_settings(config, "planReview")

    # Merge agentReview settings
    agent_review = config.get("agentReview", {})
    merged_agent = defaults["agentReview"].copy()
    merged_agent.update(agent_review)

    # Handle orchestrator nested config
    if "orchestrator" not in merged_agent or not isinstance(merged_agent["orchestrator"], dict):
        merged_agent["orchestrator"] = DEFAULT_ORCHESTRATOR.copy()
    else:
        orch = DEFAULT_ORCHESTRATOR.copy()
        orch.update(merged_agent["orchestrator"])
        merged_agent["orchestrator"] = orch

    merged_agent["display"] = get_display_settings(config, "agentReview")
    merged_agent["agentSelection"] = {**DEFAULT_AGENT_SELECTION, **config.get("agentSelection", {})}
    merged_agent["agentDefaults"] = {**{"model": DEFAULT_AGENT_MODEL}, **config.get("agentDefaults", {})}
    merged_agent["complexityCategories"] = config.get("complexityCategories", DEFAULT_COMPLEXITY_CATEGORIES.copy())
    merged_agent["sanitization"] = {**DEFAULT_SANITIZATION, **config.get("sanitization", {})}

    return {"planReview": merged_plan, "agentReview": merged_agent}


def load_agent_library(proj_dir: Path, settings: Optional[Dict[str, Any]] = None) -> List[AgentConfig]:
    """Load agent library by auto-detecting from frontmatter."""
    agents_dir = proj_dir / ".claude" / "agents" / "cc-native"
    agents_data = aggregate_agents(agents_dir)

    default_model = DEFAULT_AGENT_MODEL
    if settings:
        default_model = settings.get("agentDefaults", {}).get("model", DEFAULT_AGENT_MODEL)

    if not agents_data:
        eprint("[cc-native-plan-review] No agents found in frontmatter, using defaults")
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
# CLI Reviewers (Phase 1)
# ---------------------------

def run_codex_review(plan: str, schema: Dict[str, Any], settings: Dict[str, Any]) -> ReviewerResult:
    """Run Codex CLI to review the plan."""
    codex_settings = settings.get("reviewers", {}).get("codex", {})
    timeout = codex_settings.get("timeout", 120)
    model = codex_settings.get("model", "")

    codex_path = shutil.which("codex")
    if codex_path is None:
        eprint("[codex] CLI not found on PATH")
        return ReviewerResult(
            name="codex",
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="codex CLI not found on PATH",
        )

    eprint(f"[codex] Found CLI at: {codex_path}")

    prompt = f"""You are a senior staff software engineer acting as a strict plan reviewer.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)

Return ONLY a JSON object that matches this JSON Schema:
{json.dumps(schema, ensure_ascii=False)}

PLAN:
<<<
{plan}
>>>
"""

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        schema_path = td_path / "schema.json"
        out_path = td_path / "codex_review.json"

        schema_path.write_text(json.dumps(schema, indent=2), encoding="utf-8")

        cmd = [
            codex_path,
            "exec",
            "--full-auto",
            "--sandbox",
            "read-only",
            "--output-schema",
            str(schema_path),
            "-o",
            str(out_path),
            "-",
        ]

        if model:
            cmd.insert(2, "--model")
            cmd.insert(3, model)

        eprint(f"[codex] Running command: {' '.join(cmd)}")

        try:
            p = subprocess.run(
                cmd,
                input=prompt,
                text=True,
                capture_output=True,
                timeout=timeout,
                encoding='utf-8',
                errors='replace',
            )
        except subprocess.TimeoutExpired:
            eprint(f"[codex] TIMEOUT after {timeout}s")
            return ReviewerResult("codex", False, "error", {}, "", f"codex timed out after {timeout}s")
        except Exception as ex:
            eprint(f"[codex] EXCEPTION: {ex}")
            return ReviewerResult("codex", False, "error", {}, "", f"codex failed to run: {ex}")

        eprint(f"[codex] Exit code: {p.returncode}")

        raw = ""
        if out_path.exists():
            raw = out_path.read_text(encoding="utf-8", errors="replace")

        obj = parse_json_maybe(raw) or parse_json_maybe(p.stdout)
        ok, verdict, norm = coerce_to_review(obj, "Retry or check CLI auth/config.")

        err = (p.stderr or "").strip()
        return ReviewerResult("codex", ok, verdict, norm, raw or p.stdout, err)


def run_gemini_review(plan: str, schema: Dict[str, Any], settings: Dict[str, Any]) -> ReviewerResult:
    """Run Gemini CLI to review the plan."""
    gemini_settings = settings.get("reviewers", {}).get("gemini", {})
    timeout = gemini_settings.get("timeout", 120)
    model = gemini_settings.get("model", "")

    gemini_path = shutil.which("gemini")
    if gemini_path is None:
        eprint("[gemini] CLI not found on PATH")
        return ReviewerResult(
            name="gemini",
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="gemini CLI not found on PATH",
        )

    eprint(f"[gemini] Found CLI at: {gemini_path}")

    instruction = f"""

Review the PLAN above as a senior staff software engineer. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)

Return ONLY a JSON object that matches this JSON Schema (no markdown, no code fences):
{json.dumps(schema, ensure_ascii=False)}
"""

    cmd = [
        gemini_path,
        "-y",  # YOLO mode - auto-approve all actions
        "-p",
        instruction,
    ]

    if model:
        cmd.extend(["--model", model])

    eprint("[gemini] Running command: gemini -y -p <instruction>")

    try:
        p = subprocess.run(
            cmd,
            input=plan,
            text=True,
            capture_output=True,
            timeout=timeout,
            encoding='utf-8',
            errors='replace',
        )
    except subprocess.TimeoutExpired:
        eprint(f"[gemini] TIMEOUT after {timeout}s")
        return ReviewerResult("gemini", False, "error", {}, "", f"gemini timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[gemini] EXCEPTION: {ex}")
        return ReviewerResult("gemini", False, "error", {}, "", f"gemini failed to run: {ex}")

    eprint(f"[gemini] Exit code: {p.returncode}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    obj = parse_json_maybe(raw)
    ok, verdict, norm = coerce_to_review(obj, "Retry or check CLI auth/config.")

    return ReviewerResult("gemini", ok, verdict, norm, raw, err)


# ---------------------------
# Orchestrator (Phase 2)
# ---------------------------

def run_orchestrator(plan: str, agent_library: List[AgentConfig], config: OrchestratorConfig, settings: Dict[str, Any]) -> OrchestratorResult:
    """Run the orchestrator agent to analyze plan complexity and select reviewers."""
    eprint("[orchestrator] Starting plan analysis...")

    selection = settings.get("agentSelection", DEFAULT_AGENT_SELECTION)
    categories = settings.get("complexityCategories", DEFAULT_COMPLEXITY_CATEGORIES)
    fallback_count = selection.get("fallbackCount", 2)

    claude_path = shutil.which("claude")
    if claude_path is None:
        eprint("[orchestrator] Claude CLI not found on PATH, falling back to medium complexity")
        return OrchestratorResult(
            complexity="medium", category="code",
            selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count],
            reasoning="Orchestrator skipped - Claude CLI not found",
            error="claude CLI not found on PATH",
        )

    eprint(f"[orchestrator] Found Claude CLI at: {claude_path}")

    agent_list = "\n".join([f"- {a.name}: {a.focus} (categories: {', '.join(a.categories)})" for a in agent_library if a.enabled])
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

    cmd_args = [claude_path, "--agent", "plan-orchestrator", "--model", config.model, "--permission-mode", "bypassPermissions", "--output-format", "json", "--max-turns", str(config.max_turns), "--json-schema", schema_json, "--settings", "{}"]

    eprint(f"[orchestrator] Running with model: {config.model}, timeout: {config.timeout}s")

    try:
        p = subprocess.run(cmd_args, input=prompt, text=True, capture_output=True, timeout=config.timeout, encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        eprint(f"[orchestrator] TIMEOUT after {config.timeout}s, falling back to medium complexity")
        return OrchestratorResult(complexity="medium", category="code", selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count], reasoning="Orchestrator timed out - defaulting to medium complexity", error=f"Orchestrator timed out after {config.timeout}s")
    except Exception as ex:
        eprint(f"[orchestrator] EXCEPTION: {ex}, falling back to medium complexity")
        return OrchestratorResult(complexity="medium", category="code", selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count], reasoning=f"Orchestrator failed: {ex}", error=str(ex))

    eprint(f"[orchestrator] Exit code: {p.returncode}")

    raw = (p.stdout or "").strip()
    if p.stderr:
        eprint(f"[orchestrator] stderr: {p.stderr[:300]}")

    obj = _parse_claude_output(raw)
    if not obj:
        eprint("[orchestrator] Failed to parse output, falling back to medium complexity")
        return OrchestratorResult(complexity="medium", category="code", selected_agents=[a.name for a in agent_library if a.enabled][:fallback_count], reasoning="Orchestrator output could not be parsed", error="Failed to parse orchestrator output")

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

    return OrchestratorResult(complexity=complexity, category=category, selected_agents=selected_agents, reasoning=reasoning, skip_reason=skip_reason if skip_reason else None)


def _parse_claude_output(raw: str) -> Optional[Dict[str, Any]]:
    """Parse Claude CLI JSON output, handling various formats."""
    try:
        result = json.loads(raw)
        if isinstance(result, dict):
            if "structured_output" in result:
                return result["structured_output"]
            if result.get("type") == "assistant":
                message = result.get("message", {})
                content = message.get("content", [])
                for item in content:
                    if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                        return item.get("input", {})
        elif isinstance(result, list):
            for event in result:
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "assistant":
                    message = event.get("message", {})
                    content = message.get("content", [])
                    for item in content:
                        if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                            return item.get("input", {})
    except json.JSONDecodeError:
        pass
    except Exception:
        pass
    return parse_json_maybe(raw)


# ---------------------------
# Agent Review (Phase 3)
# ---------------------------

def run_agent_review(plan: str, agent: AgentConfig, schema: Dict[str, Any], timeout: int, max_turns: int = 3) -> ReviewerResult:
    """Run a single Claude Code agent to review the plan."""
    claude_path = shutil.which("claude")
    if claude_path is None:
        eprint(f"[{agent.name}] Claude CLI not found on PATH")
        return ReviewerResult(name=agent.name, ok=False, verdict="skip", data={}, raw="", err="claude CLI not found on PATH")

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

    schema_json = json.dumps(schema, ensure_ascii=False)
    cmd_args = [claude_path, "--agent", agent.name, "--model", agent.model, "--permission-mode", "bypassPermissions", "--output-format", "json", "--max-turns", str(max_turns), "--json-schema", schema_json, "--settings", "{}"]

    eprint(f"[{agent.name}] Running with model: {agent.model}, timeout: {timeout}s, max-turns: {max_turns}")

    try:
        p = subprocess.run(cmd_args, input=prompt, text=True, capture_output=True, timeout=timeout, encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        eprint(f"[{agent.name}] TIMEOUT after {timeout}s")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[{agent.name}] EXCEPTION: {ex}")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} failed to run: {ex}")

    eprint(f"[{agent.name}] Exit code: {p.returncode}")
    eprint(f"[{agent.name}] stdout length: {len(p.stdout or '')} chars")
    if p.stderr:
        eprint(f"[{agent.name}] stderr: {p.stderr[:500]}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    if raw:
        eprint(f"[{agent.name}] stdout preview: {raw[:500]}")

    obj = _parse_claude_output(raw)
    if obj:
        eprint(f"[{agent.name}] Parsed JSON successfully, verdict: {obj.get('verdict', 'N/A')}")
    else:
        eprint(f"[{agent.name}] Failed to parse JSON from output")

    ok, verdict, norm = coerce_to_review(obj, "Retry or check agent configuration.")

    return ReviewerResult(agent.name, ok, verdict, norm, raw, err)


# ---------------------------
# Main Hook
# ---------------------------

def main() -> int:
    eprint("[cc-native-plan-review] Unified hook started (PreToolUse)")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[cc-native-plan-review] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name")
    eprint(f"[cc-native-plan-review] tool_name: {tool_name}")

    # Only process ExitPlanMode
    if tool_name != "ExitPlanMode":
        eprint("[cc-native-plan-review] Skipping: not ExitPlanMode")
        return 0

    session_id = str(payload.get("session_id", "unknown"))
    base = project_dir(payload)
    settings = load_settings(base)

    plan_settings = settings.get("planReview", {})
    agent_settings = settings.get("agentReview", {})

    plan_review_enabled = plan_settings.get("enabled", True)
    agent_review_enabled = agent_settings.get("enabled", True)

    if not plan_review_enabled and not agent_review_enabled:
        eprint("[cc-native-plan-review] Skipping: both plan and agent review disabled")
        return 0

    # Find and read plan
    plan_path = find_plan_file()
    if not plan_path:
        eprint("[cc-native-plan-review] Skipping: no plan file found in ~/.claude/plans/")
        return 0

    try:
        plan = Path(plan_path).read_text(encoding="utf-8").strip()
    except Exception as e:
        eprint(f"[cc-native-plan-review] Failed to read plan file: {e}")
        return 0

    if not plan:
        eprint("[cc-native-plan-review] Skipping: plan file is empty")
        return 0

    eprint(f"[cc-native-plan-review] Found plan at: {plan_path}")
    eprint(f"[cc-native-plan-review] Plan length: {len(plan)} chars")

    # Plan-hash deduplication
    plan_hash = compute_plan_hash(plan)
    eprint(f"[cc-native-plan-review] Plan hash: {plan_hash}")
    if is_plan_already_reviewed(session_id, plan_hash):
        eprint("[cc-native-plan-review] Skipping: plan already reviewed (hash match)")
        return 0

    # Initialize combined result
    cli_results: Dict[str, ReviewerResult] = {}
    orch_result: Optional[OrchestratorResult] = None
    agent_results: Dict[str, ReviewerResult] = {}
    all_verdicts: List[str] = []

    # ============================================
    # PHASE 1: CLI Reviewers (Codex/Gemini)
    # ============================================
    if plan_review_enabled:
        eprint("[cc-native-plan-review] === PHASE 1: CLI Reviewers ===")
        reviewers_config = plan_settings.get("reviewers", {})
        codex_enabled = reviewers_config.get("codex", {}).get("enabled", True)
        gemini_enabled = reviewers_config.get("gemini", {}).get("enabled", False)

        eprint(f"[cc-native-plan-review] Codex enabled: {codex_enabled}, Gemini enabled: {gemini_enabled}")

        if codex_enabled:
            result = run_codex_review(plan, REVIEW_SCHEMA, plan_settings)
            cli_results["codex"] = result
            if result.verdict and result.verdict not in ("skip", "error"):
                all_verdicts.append(result.verdict)
        else:
            eprint("[cc-native-plan-review] Skipping Codex (disabled)")

        if gemini_enabled:
            result = run_gemini_review(plan, REVIEW_SCHEMA, plan_settings)
            cli_results["gemini"] = result
            if result.verdict and result.verdict not in ("skip", "error"):
                all_verdicts.append(result.verdict)
        else:
            eprint("[cc-native-plan-review] Skipping Gemini (disabled)")

    # ============================================
    # PHASE 2 & 3: Orchestrator + Agent Reviews
    # ============================================
    if agent_review_enabled:
        eprint("[cc-native-plan-review] === PHASE 2: Orchestrator ===")

        agent_library = load_agent_library(base, agent_settings)
        timeout = agent_settings.get("timeout", 120)
        legacy_mode = agent_settings.get("legacyMode", False)

        orch_settings = agent_settings.get("orchestrator", DEFAULT_ORCHESTRATOR)
        orchestrator_config = OrchestratorConfig(
            enabled=orch_settings.get("enabled", True),
            model=orch_settings.get("model", "haiku"),
            timeout=orch_settings.get("timeout", 30),
            max_turns=orch_settings.get("maxTurns", 3),
        )

        enabled_agents = [a for a in agent_library if a.enabled]
        eprint(f"[cc-native-plan-review] Agent library: {[a.name for a in agent_library]}")
        eprint(f"[cc-native-plan-review] Enabled agents: {[a.name for a in enabled_agents]}")
        eprint(f"[cc-native-plan-review] Legacy mode: {legacy_mode}")
        eprint(f"[cc-native-plan-review] Orchestrator enabled: {orchestrator_config.enabled}")

        selected_agents: List[AgentConfig] = []

        if enabled_agents:
            if orchestrator_config.enabled and not legacy_mode:
                orch_result = run_orchestrator(plan, enabled_agents, orchestrator_config, agent_settings)

                if orch_result.complexity == "simple" and not orch_result.selected_agents:
                    eprint("[cc-native-plan-review] Orchestrator determined: simple complexity, no agent review needed")
                else:
                    selected_names = set(orch_result.selected_agents)
                    selected_agents = [a for a in enabled_agents if a.name in selected_names]

                    if not selected_agents and selected_names:
                        eprint(f"[cc-native-plan-review] Warning: orchestrator selected unknown agents: {selected_names}")
                        selected_agents = [a for a in enabled_agents if orch_result.category in a.categories]

                    eprint(f"[cc-native-plan-review] Orchestrator selected: {[a.name for a in selected_agents]}")
            else:
                eprint("[cc-native-plan-review] Running in legacy mode (all enabled agents)")
                selected_agents = enabled_agents

            # PHASE 3: Run selected agents
            if selected_agents:
                eprint("[cc-native-plan-review] === PHASE 3: Agent Reviews ===")
                max_turns = agent_settings.get("maxTurns", 3)

                with ThreadPoolExecutor(max_workers=len(selected_agents)) as executor:
                    futures = {executor.submit(run_agent_review, plan, agent, REVIEW_SCHEMA, timeout, max_turns): agent for agent in selected_agents}
                    for future in as_completed(futures):
                        agent = futures[future]
                        try:
                            result = future.result()
                            agent_results[agent.name] = result
                            if result.verdict and result.verdict not in ("skip", "error"):
                                all_verdicts.append(result.verdict)
                            eprint(f"[cc-native-plan-review] {agent.name} completed with verdict: {result.verdict}")
                        except Exception as ex:
                            eprint(f"[cc-native-plan-review] {agent.name} failed with exception: {ex}")
                            agent_results[agent.name] = ReviewerResult(name=agent.name, ok=False, verdict="error", data={}, raw="", err=str(ex))

    # ============================================
    # PHASE 4: Generate Combined Output
    # ============================================
    eprint("[cc-native-plan-review] === PHASE 4: Generate Output ===")

    if not cli_results and not agent_results:
        eprint("[cc-native-plan-review] No review results, exiting")
        return 0

    overall = worst_verdict(all_verdicts) if all_verdicts else "pass"

    combined_result = CombinedReviewResult(
        plan_hash=plan_hash,
        overall_verdict=overall,
        cli_reviewers=cli_results,
        orchestration=orch_result,
        agents=agent_results,
        timestamp=datetime.now().isoformat(),
    )

    # Merge display settings from both configs
    display_settings = {**plan_settings.get("display", {}), **agent_settings.get("display", {})}
    combined_settings = {"display": display_settings}

    review_file = write_combined_artifacts(base, plan, combined_result, payload, combined_settings)
    eprint(f"[cc-native-plan-review] Saved review: {review_file}")

    # Build context message
    md_content = format_combined_markdown(combined_result, combined_settings)

    context_parts = [
        "**CC-Native Plan Review Complete**\n\n",
        f"Review saved to: `{review_file}`\n\n",
    ]

    if cli_results:
        cli_verdicts = [f"{name}={r.verdict}" for name, r in cli_results.items()]
        context_parts.append(f"**CLI Reviewers:** {', '.join(cli_verdicts)}\n")

    if orch_result:
        context_parts.append(f"**Orchestration:** Complexity=`{orch_result.complexity}`, Category=`{orch_result.category}`, Agents selected: {len(agent_results)}\n")

    context_parts.append("\nUse these findings before starting implementation.\n\n")
    context_parts.append(md_content)

    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": "".join(context_parts),
        }
    }

    # Check blocking conditions
    block_on_fail_plan = plan_settings.get("blockOnFail", False)
    block_on_fail_agent = agent_settings.get("blockOnFail", True)
    should_block = (overall == "fail") and (block_on_fail_plan or block_on_fail_agent)

    if should_block:
        out["decision"] = "block"
        out["reason"] = (
            "CC-Native plan review verdict = FAIL. Do NOT start implementation yet. "
            "Revise the plan to address the high-severity issues and missing sections, "
            "then present an updated plan."
        )

    mark_plan_reviewed(session_id, plan_hash, "cc-native-plan-review")
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
