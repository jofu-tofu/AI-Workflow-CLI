#!/usr/bin/env python3
"""
GSD Unified Review Hook

Claude Code PostToolUse hook that intercepts GSD plan file creation and
automatically reviews plans using external AI CLIs (Codex, Gemini) and
Claude Code agents - all in parallel.

Trigger: Write tool creating files matching _output/gsd/.planning/PLAN-phase-*.md

Features:
- Detects GSD plan file writes via file path pattern
- Runs Codex CLI, Gemini CLI, and Claude Code agents ALL in parallel
- Outputs unified review alongside plan files (PLAN-phase-N.md -> REVIEW-phase-N.md)
- Consolidates issues by severity across all reviewers
- Returns feedback to Claude via hook additionalContext
- Optional blocking on FAIL verdict

Configuration: _gsd/config.json -> unifiedReview
Agent definitions: .claude/agents/<agent-name>.md
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
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


# Default agents
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
# Load settings from _gsd/config.json
# ---------------------------

def load_settings(project_dir: Path) -> Dict[str, Any]:
    """Load GSD unified review settings from _gsd/config.json"""
    settings_path = project_dir / "_gsd" / "config.json"
    defaults = {
        "enabled": True,
        "blockOnFail": False,
        "planPattern": "_output/gsd/.planning/PLAN-phase-",
        "reviewers": {
            "codex": {"enabled": True, "model": "", "timeout": 120},
            "gemini": {"enabled": False, "model": "", "timeout": 120},
        },
        "agents": DEFAULT_AGENTS,
        "agentTimeout": 120,
    }

    if not settings_path.exists():
        return defaults

    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            all_settings = json.load(f)
        unified_review = all_settings.get("unifiedReview", {})
        # Merge with defaults
        merged = defaults.copy()
        merged.update(unified_review)
        if "reviewers" in unified_review:
            merged["reviewers"] = defaults["reviewers"].copy()
            merged["reviewers"].update(unified_review["reviewers"])
        if "agents" not in unified_review:
            merged["agents"] = defaults["agents"]
        return merged
    except Exception as e:
        eprint(f"[gsd-unified-review] Failed to load settings: {e}")
        return defaults


# ---------------------------
# Review schema for structured output
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
    reviewer_type: str  # "cli" or "agent"
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


def extract_phase_number(file_path: str) -> str:
    """Extract phase number from PLAN-phase-N.md filename"""
    match = re.search(r"PLAN-phase-(\d+)", file_path)
    return match.group(1) if match else "unknown"


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
            "issues": [{"severity": "high", "category": "tooling", "issue": "Reviewer returned no JSON.", "suggested_fix": "Retry or check CLI/agent configuration."}],
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
# External CLI Reviewers
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
            reviewer_type="cli",
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="codex CLI not found on PATH",
        )

    eprint(f"[codex] Found CLI at: {codex_path}")

    prompt = f"""You are a senior staff software engineer acting as a strict plan reviewer for a GSD (Get Stuff Done) workflow.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- task dependencies and wave groupings
- requirements traceability

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
            return ReviewerResult("codex", "cli", False, "error", {}, "", f"codex timed out after {timeout}s")
        except Exception as ex:
            eprint(f"[codex] EXCEPTION: {ex}")
            return ReviewerResult("codex", "cli", False, "error", {}, "", f"codex failed to run: {ex}")

        eprint(f"[codex] Exit code: {p.returncode}")

        raw = ""
        if out_path.exists():
            raw = out_path.read_text(encoding="utf-8", errors="replace")

        obj = parse_json_maybe(raw) or parse_json_maybe(p.stdout)
        ok, verdict, norm = coerce_to_review(obj)

        err = (p.stderr or "").strip()
        return ReviewerResult("codex", "cli", ok, verdict, norm, raw or p.stdout, err)


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
            reviewer_type="cli",
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="gemini CLI not found on PATH",
        )

    eprint(f"[gemini] Found CLI at: {gemini_path}")

    instruction = f"""

Review the PLAN above as a senior staff software engineer for a GSD (Get Stuff Done) workflow. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- task dependencies and wave groupings
- requirements traceability

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

    eprint(f"[gemini] Running command: gemini -y -p <instruction>")

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
        return ReviewerResult("gemini", "cli", False, "error", {}, "", f"gemini timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[gemini] EXCEPTION: {ex}")
        return ReviewerResult("gemini", "cli", False, "error", {}, "", f"gemini failed to run: {ex}")

    eprint(f"[gemini] Exit code: {p.returncode}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    obj = parse_json_maybe(raw)
    ok, verdict, norm = coerce_to_review(obj)

    return ReviewerResult("gemini", "cli", ok, verdict, norm, raw, err)


# ---------------------------
# Claude Code Agent Reviewers
# ---------------------------

def run_agent_review(plan: str, agent: AgentConfig, schema: Dict[str, Any], timeout: int) -> ReviewerResult:
    """Run a single Claude Code agent to review the plan."""
    claude_path = shutil.which("claude")
    if claude_path is None:
        eprint(f"[{agent.name}] Claude CLI not found on PATH")
        eprint(f"[{agent.name}] PATH = {os.environ.get('PATH', '')}")
        return ReviewerResult(
            name=agent.name,
            reviewer_type="agent",
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="claude CLI not found on PATH",
        )

    eprint(f"[{agent.name}] Found Claude CLI at: {claude_path}")

    prompt = f"""IMPORTANT: You must analyze this plan and output your review immediately using StructuredOutput. Do NOT ask questions or request clarification - analyze what is provided and give your assessment.

You are a senior staff software engineer acting as a strict plan reviewer for a GSD (Get Stuff Done) workflow.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- task dependencies and wave groupings
- requirements traceability

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
        return ReviewerResult(agent.name, "agent", False, "error", {}, "", f"{agent.name} timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[{agent.name}] EXCEPTION: {ex}")
        return ReviewerResult(agent.name, "agent", False, "error", {}, "", f"{agent.name} failed to run: {ex}")

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

    return ReviewerResult(agent.name, "agent", ok, verdict, norm, raw, err)


# ---------------------------
# Result Processing
# ---------------------------

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


def format_unified_markdown(plan_path: str, results: List[ReviewerResult], overall: str) -> str:
    """Format review results as unified markdown with sections."""
    lines: List[str] = []

    # Separate by type
    cli_results = [r for r in results if r.reviewer_type == "cli"]
    agent_results = [r for r in results if r.reviewer_type == "agent"]

    # Count non-skipped reviewers
    active_reviewers = [r for r in results if r.verdict != "skip"]

    # Header
    lines.append("# GSD Unified Plan Review\n")
    lines.append(f"**Plan:** `{plan_path}`")
    lines.append(f"**Overall Verdict:** `{overall.upper()}`")
    lines.append(f"**Reviewers:** {len(active_reviewers)} ({len([r for r in cli_results if r.verdict != 'skip'])} external CLIs + {len([r for r in agent_results if r.verdict != 'skip'])} agents)\n")

    # Executive Summary
    lines.append("## Executive Summary\n")
    summaries = [r.data.get("summary", "") for r in results if r.ok and r.data.get("summary")]
    if summaries:
        lines.append(f"**Worst verdict: {overall.upper()}**\n")
        lines.append("Key findings from all reviewers:")
        for r in results:
            if r.ok and r.data.get("summary"):
                lines.append(f"- **{r.name}**: {r.data['summary'][:200]}...")
    else:
        lines.append("No summaries available from reviewers.")
    lines.append("")

    # External CLI Reviews
    if cli_results:
        lines.append("## External CLI Reviews\n")
        for r in cli_results:
            lines.append(f"### {r.name.title()}\n")
            lines.append(f"- verdict: `{r.verdict}`")
            if r.data:
                lines.append(f"- summary: {r.data.get('summary','').strip()}")
                issues = r.data.get("issues", [])
                if issues:
                    lines.append(f"- issues: {len(issues)} found")
            else:
                lines.append(f"- note: {r.err or 'no structured output'}")
            lines.append("")

    # Agent Reviews
    if agent_results:
        lines.append("## Agent Reviews\n")
        for r in agent_results:
            lines.append(f"### {r.name.replace('-', ' ').title()}\n")
            lines.append(f"- verdict: `{r.verdict}`")
            if r.data:
                lines.append(f"- summary: {r.data.get('summary','').strip()}")
                issues = r.data.get("issues", [])
                if issues:
                    lines.append(f"- issues: {len(issues)} found")
            else:
                lines.append(f"- note: {r.err or 'no structured output'}")
            lines.append("")

    # Consolidated Issues by Severity
    lines.append("## Consolidated Issues by Severity\n")

    all_issues: Dict[str, List[Tuple[str, Dict[str, Any]]]] = {
        "high": [],
        "medium": [],
        "low": [],
    }

    for r in results:
        if r.data:
            for issue in r.data.get("issues", []):
                severity = issue.get("severity", "medium")
                if severity in all_issues:
                    all_issues[severity].append((r.name, issue))

    for severity in ["high", "medium", "low"]:
        issues = all_issues[severity]
        if issues:
            lines.append(f"### {severity.title()} Severity\n")
            for reviewer_name, issue in issues[:15]:  # Limit per severity
                cat = issue.get("category", "general")
                desc = issue.get("issue", "")
                fix = issue.get("suggested_fix", "")
                lines.append(f"- **[{reviewer_name}]** ({cat}) {desc}")
                if fix:
                    lines.append(f"  - Fix: {fix}")
            lines.append("")

    if not any(all_issues.values()):
        lines.append("No issues found by any reviewer.\n")

    # Questions & Missing Sections
    all_questions: List[Tuple[str, str]] = []
    all_missing: List[Tuple[str, str]] = []

    for r in results:
        if r.data:
            for q in r.data.get("questions", []):
                all_questions.append((r.name, q))
            for m in r.data.get("missing_sections", []):
                all_missing.append((r.name, m))

    if all_questions or all_missing:
        lines.append("## Questions & Missing Sections\n")
        if all_questions:
            lines.append("### Questions")
            for reviewer_name, q in all_questions[:12]:
                lines.append(f"- **[{reviewer_name}]** {q}")
            lines.append("")
        if all_missing:
            lines.append("### Missing Sections")
            for reviewer_name, m in all_missing[:12]:
                lines.append(f"- **[{reviewer_name}]** {m}")
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def write_artifacts(base: Path, plan_content: str, plan_path: str, md: str, results: List[ReviewerResult], payload: Dict[str, Any], settings: Dict[str, Any]) -> Path:
    """Write review artifacts alongside the plan file with matching naming."""
    phase_num = extract_phase_number(plan_path)

    # Derive review path from plan path: PLAN-phase-N.md -> REVIEW-phase-N.md
    plan_file = Path(plan_path)
    plan_dir = plan_file.parent
    review_filename = plan_file.name.replace("PLAN-phase-", "REVIEW-phase-")
    review_path = plan_dir / review_filename

    # Ensure directory exists (should already exist since plan was just written)
    plan_dir.mkdir(parents=True, exist_ok=True)

    # Write the review markdown
    review_path.write_text(md, encoding="utf-8")

    # Write individual reviewer JSON files alongside
    for r in results:
        if r.data:
            json_filename = f"REVIEW-phase-{phase_num}-{r.name}.json"
            (plan_dir / json_filename).write_text(
                json.dumps(r.data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    return review_path


def main() -> int:
    eprint("[gsd-unified-review] Hook started")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[gsd-unified-review] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name")
    eprint(f"[gsd-unified-review] tool_name: {tool_name}")

    # Only process Write tool
    if tool_name != "Write":
        eprint("[gsd-unified-review] Skipping: not Write tool")
        return 0

    tool_input = payload.get("tool_input") or {}
    file_path = str(tool_input.get("file_path", ""))

    # Load settings
    base = project_dir(payload)
    settings = load_settings(base)

    if not settings.get("enabled", True):
        eprint("[gsd-unified-review] Skipping: unified review disabled in settings")
        return 0

    plan_pattern = settings.get("planPattern", "_output/gsd/.planning/PLAN-phase-")

    # Check if this is a GSD plan file
    # Normalize path separators for cross-platform compatibility
    normalized_path = file_path.replace("\\", "/")
    normalized_pattern = plan_pattern.replace("\\", "/")

    if normalized_pattern not in normalized_path:
        eprint(f"[gsd-unified-review] Skipping: file '{file_path}' does not match pattern '{plan_pattern}'")
        return 0

    eprint(f"[gsd-unified-review] Detected GSD plan file: {file_path}")

    # Get plan content from tool_input.content (Write tool provides this)
    plan_content = str(tool_input.get("content", "")).strip()
    if not plan_content:
        eprint("[gsd-unified-review] Skipping: no plan content")
        return 0

    eprint(f"[gsd-unified-review] Plan length: {len(plan_content)} chars")

    # Build list of all tasks to run in parallel
    tasks: List[Tuple[str, Any]] = []  # (name, callable_args)

    # Check which CLI reviewers are enabled
    reviewers_config = settings.get("reviewers", {})
    codex_enabled = reviewers_config.get("codex", {}).get("enabled", True)
    gemini_enabled = reviewers_config.get("gemini", {}).get("enabled", False)

    eprint(f"[gsd-unified-review] Codex enabled: {codex_enabled}, Gemini enabled: {gemini_enabled}")

    # Build agent configs
    agents_config = settings.get("agents", DEFAULT_AGENTS)
    agent_timeout = settings.get("agentTimeout", 120)

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

    eprint(f"[gsd-unified-review] Enabled agents: {[a.name for a in enabled_agents]}")

    # Calculate total parallel workers
    total_workers = (1 if codex_enabled else 0) + (1 if gemini_enabled else 0) + len(enabled_agents)

    if total_workers == 0:
        eprint("[gsd-unified-review] No reviewers enabled, exiting")
        return 0

    eprint(f"[gsd-unified-review] Running {total_workers} reviewers in parallel")

    results: List[ReviewerResult] = []

    # Run ALL reviewers in parallel
    with ThreadPoolExecutor(max_workers=total_workers) as executor:
        futures = {}

        # Submit CLI reviewers
        if codex_enabled:
            futures[executor.submit(run_codex_review, plan_content, REVIEW_SCHEMA, settings)] = "codex"

        if gemini_enabled:
            futures[executor.submit(run_gemini_review, plan_content, REVIEW_SCHEMA, settings)] = "gemini"

        # Submit agent reviewers
        for agent in enabled_agents:
            futures[executor.submit(run_agent_review, plan_content, agent, REVIEW_SCHEMA, agent_timeout)] = agent.name

        # Collect results
        for future in as_completed(futures):
            name = futures[future]
            try:
                result = future.result()
                results.append(result)
                eprint(f"[gsd-unified-review] {name} completed with verdict: {result.verdict}")
            except Exception as ex:
                eprint(f"[gsd-unified-review] {name} failed with exception: {ex}")
                # Determine type based on name
                reviewer_type = "cli" if name in ["codex", "gemini"] else "agent"
                results.append(ReviewerResult(
                    name=name,
                    reviewer_type=reviewer_type,
                    ok=False,
                    verdict="error",
                    data={},
                    raw="",
                    err=str(ex),
                ))

    if not results:
        eprint("[gsd-unified-review] No results, exiting")
        return 0

    overall = worst_verdict([r.verdict for r in results if r.verdict])

    md = format_unified_markdown(file_path, results, overall)

    review_file = write_artifacts(base, plan_content, file_path, md, results, payload, settings)
    eprint(f"[gsd-unified-review] Saved review: {review_file}")

    # Build Claude Code hook JSON output
    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": (
                f"**GSD Unified Plan Review Complete**\n\n"
                f"All reviewers (external CLIs + Claude Code agents) analyzed your plan in parallel.\n"
                f"Review saved to: `{review_file}`\n\n"
                f"Use these findings before starting execution.\n\n"
                + md
            ),
        }
    }

    block_on_fail = settings.get("blockOnFail", False)
    if overall == "fail" and block_on_fail:
        out["decision"] = "block"
        out["reason"] = (
            "Unified plan review verdict = FAIL. Do NOT start execution yet. "
            "Revise the plan to address the high-severity issues and missing sections, "
            "then regenerate the plan with `/gsd:plan-phase`."
        )

    # Print JSON to stdout for Claude Code to process
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
