#!/usr/bin/env python3
"""
CC-Native Plan Review Hook

Claude Code PostToolUse hook that intercepts ExitPlanMode and
automatically reviews plans using external AI agents (Codex + Gemini).

Trigger: ExitPlanMode tool use

Features:
- Detects approved plans via ExitPlanMode PostToolUse
- Runs Codex CLI and/or Gemini CLI for plan review
- Outputs review artifacts to _output/cc-native/plans/reviews/
- Returns feedback to Claude via hook additionalContext
- Optional blocking on FAIL verdict

Configuration: _cc-native/config.json -> planReview
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------
# Default display limits
# ---------------------------

DEFAULT_DISPLAY: Dict[str, int] = {
    "maxIssues": 12,
    "maxMissingSections": 12,
    "maxQuestions": 12,
}


# ---------------------------
# Load settings from _cc-native/config.json
# ---------------------------

def load_settings(project_dir: Path) -> Dict[str, Any]:
    """Load CC-Native plan review settings from _cc-native/config.json"""
    settings_path = project_dir / "_cc-native" / "config.json"
    defaults = {
        "enabled": True,
        "reviewers": {
            "codex": {"enabled": True, "model": "", "timeout": 120},
            "gemini": {"enabled": False, "model": "", "timeout": 120},
        },
        "blockOnFail": False,
        "display": DEFAULT_DISPLAY.copy(),
    }

    if not settings_path.exists():
        return defaults

    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            all_settings = json.load(f)
        plan_review = all_settings.get("planReview", {})
        # Merge with defaults
        merged = defaults.copy()
        merged.update(plan_review)
        if "reviewers" in plan_review:
            merged["reviewers"] = defaults["reviewers"].copy()
            merged["reviewers"].update(plan_review["reviewers"])
        # Merge display settings with defaults
        merged["display"] = {**DEFAULT_DISPLAY, **plan_review.get("display", {})}
        return merged
    except Exception as e:
        eprint(f"[cc-native-plan-review] Failed to load settings: {e}")
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
            "issues": [{"severity": "high", "category": "tooling", "issue": "Reviewer returned no JSON.", "suggested_fix": "Retry or check CLI auth/config."}],
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
        ok, verdict, norm = coerce_to_review(obj)

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
        return ReviewerResult("gemini", False, "error", {}, "", f"gemini timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[gemini] EXCEPTION: {ex}")
        return ReviewerResult("gemini", False, "error", {}, "", f"gemini failed to run: {ex}")

    eprint(f"[gemini] Exit code: {p.returncode}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    obj = parse_json_maybe(raw)
    ok, verdict, norm = coerce_to_review(obj)

    return ReviewerResult("gemini", ok, verdict, norm, raw, err)


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


def format_markdown(results: List[ReviewerResult], overall: str, settings: Optional[Dict[str, Any]] = None) -> str:
    """Format review results as markdown."""
    # Get display limits from settings
    display = DEFAULT_DISPLAY.copy()
    if settings:
        display = settings.get("display", DEFAULT_DISPLAY)

    max_issues = display.get("maxIssues", 12)
    max_missing = display.get("maxMissingSections", 12)
    max_questions = display.get("maxQuestions", 12)

    lines: List[str] = []
    lines.append("# CC-Native Plan Review (Codex + Gemini)\n")
    lines.append(f"**Overall verdict:** `{overall.upper()}`\n")

    for r in results:
        lines.append(f"## {r.name.title()}\n")
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
    """Write review artifacts to _output/cc-native/plans/reviews/."""
    ts = now_local()
    date_folder = ts.strftime("%Y-%m-%d")
    time_part = ts.strftime("%H%M%S")
    sid = sanitize_filename(str(payload.get("session_id", "unknown")))

    out_dir = base / "_output" / "cc-native" / "plans" / "reviews" / date_folder
    out_dir.mkdir(parents=True, exist_ok=True)

    plan_path = out_dir / f"{time_part}-session-{sid}-plan.md"
    review_path = out_dir / f"{time_part}-session-{sid}-review.md"

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
    eprint("[cc-native-plan-review] Hook started")

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

    # Load settings
    base = project_dir(payload)
    settings = load_settings(base)

    if not settings.get("enabled", True):
        eprint("[cc-native-plan-review] Skipping: plan review disabled in settings")
        return 0

    tool_response = payload.get("tool_response") or {}

    # Plan is in tool_response.plan for PostToolUse hooks
    plan = str(tool_response.get("plan", "")).strip()
    if not plan:
        eprint("[cc-native-plan-review] Skipping: no plan content")
        return 0

    eprint(f"[cc-native-plan-review] Plan length: {len(plan)} chars")

    # Check which reviewers are enabled
    reviewers_config = settings.get("reviewers", {})
    codex_enabled = reviewers_config.get("codex", {}).get("enabled", True)
    gemini_enabled = reviewers_config.get("gemini", {}).get("enabled", False)

    eprint(f"[cc-native-plan-review] Codex enabled: {codex_enabled}, Gemini enabled: {gemini_enabled}")

    results: List[ReviewerResult] = []

    if codex_enabled:
        results.append(run_codex_review(plan, REVIEW_SCHEMA, settings))
    else:
        eprint("[cc-native-plan-review] Skipping Codex (disabled)")

    if gemini_enabled:
        results.append(run_gemini_review(plan, REVIEW_SCHEMA, settings))
    else:
        eprint("[cc-native-plan-review] Skipping Gemini (disabled)")

    if not results:
        eprint("[cc-native-plan-review] No reviewers enabled, exiting")
        return 0

    overall = worst_verdict([r.verdict for r in results if r.verdict])

    md = format_markdown(results, overall, settings)

    review_file = write_artifacts(base, plan, md, results, payload)
    eprint(f"[cc-native-plan-review] Saved review: {review_file}")

    # Build Claude Code hook JSON output
    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": (
                f"**CC-Native Plan Review Complete**\n\n"
                f"External reviewers (Codex + Gemini) have analyzed your plan.\n"
                f"Review saved to: `{review_file}`\n\n"
                f"Use these findings before starting implementation.\n\n"
                + md
            ),
        }
    }

    block_on_fail = settings.get("blockOnFail", False)
    if overall == "fail" and block_on_fail:
        out["decision"] = "block"
        out["reason"] = (
            "CC-Native plan review verdict = FAIL. Do NOT start implementation yet. "
            "Revise the plan to address the high-severity issues and missing sections, "
            "then present an updated plan."
        )

    # Print JSON to stdout for Claude Code to process
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
