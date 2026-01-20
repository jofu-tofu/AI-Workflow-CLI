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
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------
# Agent Configuration
# ---------------------------

@dataclass
class AgentConfig:
    """Configuration for a Claude Code review agent."""
    name: str        # Agent name - must match .claude/agents/<name>.md
    model: str       # Model: "sonnet", "opus", "haiku"
    focus: str       # Brief description for logging
    enabled: bool = True


# Default agents - can be overridden via config.json
DEFAULT_AGENTS: List[Dict[str, Any]] = [
    {
        "name": "architect-reviewer",
        "model": "sonnet",
        "focus": "architectural concerns and scalability",
        "enabled": True,
    },
    {
        "name": "penetration-tester",
        "model": "sonnet",
        "focus": "security vulnerabilities and attack vectors",
        "enabled": True,
    },
    {
        "name": "performance-engineer",
        "model": "sonnet",
        "focus": "performance bottlenecks and optimization",
        "enabled": True,
    },
    {
        "name": "accessibility-tester",
        "model": "sonnet",
        "focus": "accessibility compliance and UX concerns",
        "enabled": True,
    },
]


# ---------------------------
# Load settings from _cc-native/config.json
# ---------------------------

def load_settings(project_dir: Path) -> Dict[str, Any]:
    """Load CC-Native agent review settings from _cc-native/config.json"""
    settings_path = project_dir / "_cc-native" / "config.json"
    defaults = {
        "enabled": True,
        "agents": DEFAULT_AGENTS,
        "timeout": 120,
        "blockOnFail": True,
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


def sanitize_filename(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    return s.strip("._-")[:32] or "unknown"


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


def run_agent_review(plan: str, agent: AgentConfig, schema: Dict[str, Any], timeout: int) -> ReviewerResult:
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

    cmd = [
        "claude",
        "-p", prompt,
        "--agent", agent.name,
        "--model", agent.model,
        "--permission-mode", "plan",
        "--output-format", "json",
        "--max-turns", "1",
        "--json-schema", schema_json,
    ]

    eprint(f"[{agent.name}] Running command: claude -p <prompt> --agent {agent.name} --model {agent.model} --permission-mode plan --output-format json --max-turns 1 --json-schema <schema>")

    try:
        p = subprocess.run(
            cmd,
            text=True,
            capture_output=True,
            timeout=timeout,
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

    # Claude Code with --output-format json outputs a JSON array of events
    # We need to find the StructuredOutput tool call in assistant messages
    obj = None
    try:
        events = json.loads(raw)
        if isinstance(events, list):
            for event in events:
                if not isinstance(event, dict):
                    continue

                # Look for assistant message with StructuredOutput tool_use
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
        elif isinstance(events, dict):
            # Single object fallback
            obj = parse_json_maybe(raw)
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


def format_markdown(plan: str, results: List[ReviewerResult], overall: str) -> str:
    """Format review results as markdown."""
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
                for it in issues[:12]:
                    sev = it.get("severity", "medium")
                    cat = it.get("category", "general")
                    issue = it.get("issue", "")
                    fix = it.get("suggested_fix", "")
                    lines.append(f"- **[{sev}] {cat}**: {issue}\n  - fix: {fix}")
            missing = r.data.get("missing_sections", [])
            if missing:
                lines.append("\n### Missing Sections")
                for m in missing[:12]:
                    lines.append(f"- {m}")
            qs = r.data.get("questions", [])
            if qs:
                lines.append("\n### Questions")
                for q in qs[:12]:
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

    # Build agent configs from settings
    agents_config = settings.get("agents", DEFAULT_AGENTS)
    timeout = settings.get("timeout", 120)

    enabled_agents = [
        AgentConfig(
            name=a["name"],
            model=a.get("model", "sonnet"),
            focus=a.get("focus", "general review"),
            enabled=a.get("enabled", True),
        )
        for a in agents_config
        if a.get("enabled", True)
    ]

    eprint(f"[cc-native-agent-review] Enabled agents: {[a.name for a in enabled_agents]}")

    if not enabled_agents:
        eprint("[cc-native-agent-review] No agents enabled, exiting")
        return 0

    results: List[ReviewerResult] = []

    # Run all agents in parallel
    with ThreadPoolExecutor(max_workers=len(enabled_agents)) as executor:
        futures = {
            executor.submit(run_agent_review, plan, agent, REVIEW_SCHEMA, timeout): agent
            for agent in enabled_agents
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

    md = format_markdown(plan, results, overall)

    review_file = write_artifacts(base, plan, md, results, payload)
    eprint(f"[cc-native-agent-review] Saved review: {review_file}")

    # Build Claude Code hook JSON output
    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": (
                f"**CC-Native Agent Plan Review Complete**\n\n"
                f"Claude Code agents have analyzed your plan in parallel.\n"
                f"Review saved to: `{review_file}`\n\n"
                f"Use these findings before starting implementation.\n\n"
                + md
            ),
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
