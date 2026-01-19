#!/usr/bin/env python3
"""
GSD Plan Review Hook

Claude Code PostToolUse hook that intercepts GSD plan file creation and
automatically reviews plans using external AI agents (Codex + Gemini).

Trigger: Write tool creating files matching _output/gsd/.planning/PLAN-phase-*.md

Features:
- Detects GSD plan file writes via file path pattern
- Runs Codex CLI and/or Gemini CLI for plan review
- Outputs review artifacts alongside plan files (PLAN-phase-N.md → REVIEW-phase-N.md)
- Returns feedback to Claude via hook additionalContext
- Optional blocking on FAIL verdict

Configuration: .claude/settings.json -> gsd.planReview
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
# Load settings from .claude/settings.json
# ---------------------------

def load_settings(project_dir: Path) -> Dict[str, Any]:
    """Load GSD plan review settings from .claude/settings.json"""
    settings_path = project_dir / ".claude" / "settings.json"
    defaults = {
        "enabled": True,
        "reviewers": {
            "codex": {"enabled": True, "model": "", "timeout": 120},
            "gemini": {"enabled": False, "model": "", "timeout": 120},
        },
        "blockOnFail": False,
        "planPattern": "_output/gsd/.planning/PLAN-phase-",
    }

    if not settings_path.exists():
        return defaults

    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            all_settings = json.load(f)
        gsd_settings = all_settings.get("gsd", {}).get("planReview", {})
        # Merge with defaults
        merged = defaults.copy()
        merged.update(gsd_settings)
        if "reviewers" in gsd_settings:
            merged["reviewers"] = defaults["reviewers"].copy()
            merged["reviewers"].update(gsd_settings["reviewers"])
        return merged
    except Exception as e:
        eprint(f"[gsd-plan-review] Failed to load settings: {e}")
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
            codex_path,  # Use resolved path instead of literal "codex"
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
        gemini_path,  # Use resolved path instead of literal "gemini"
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


def format_markdown(plan_path: str, results: List[ReviewerResult], overall: str) -> str:
    """Format review results as markdown."""
    lines: List[str] = []
    lines.append("# GSD Plan Review (Codex + Gemini)\n")
    lines.append(f"**Plan:** `{plan_path}`")
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


def write_artifacts(base: Path, plan_content: str, plan_path: str, md: str, results: List[ReviewerResult], payload: Dict[str, Any], settings: Dict[str, Any]) -> Path:
    """Write review artifacts alongside the plan file with matching naming."""
    phase_num = extract_phase_number(plan_path)

    # Derive review path from plan path: PLAN-phase-N.md → REVIEW-phase-N.md
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
    eprint("[gsd-plan-review] Hook started")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[gsd-plan-review] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name")
    eprint(f"[gsd-plan-review] tool_name: {tool_name}")

    # Only process Write tool
    if tool_name != "Write":
        eprint("[gsd-plan-review] Skipping: not Write tool")
        return 0

    tool_input = payload.get("tool_input") or {}
    file_path = str(tool_input.get("file_path", ""))

    # Load settings
    base = project_dir(payload)
    settings = load_settings(base)

    if not settings.get("enabled", True):
        eprint("[gsd-plan-review] Skipping: plan review disabled in settings")
        return 0

    plan_pattern = settings.get("planPattern", "_output/gsd/.planning/PLAN-phase-")

    # Check if this is a GSD plan file
    # Normalize path separators for cross-platform compatibility
    normalized_path = file_path.replace("\\", "/")
    normalized_pattern = plan_pattern.replace("\\", "/")

    if normalized_pattern not in normalized_path:
        eprint(f"[gsd-plan-review] Skipping: file '{file_path}' does not match pattern '{plan_pattern}'")
        return 0

    eprint(f"[gsd-plan-review] Detected GSD plan file: {file_path}")

    # Get plan content from tool_input.content (Write tool provides this)
    plan_content = str(tool_input.get("content", "")).strip()
    if not plan_content:
        eprint("[gsd-plan-review] Skipping: no plan content")
        return 0

    eprint(f"[gsd-plan-review] Plan length: {len(plan_content)} chars")

    # Check which reviewers are enabled
    reviewers_config = settings.get("reviewers", {})
    codex_enabled = reviewers_config.get("codex", {}).get("enabled", True)
    gemini_enabled = reviewers_config.get("gemini", {}).get("enabled", False)

    eprint(f"[gsd-plan-review] Codex enabled: {codex_enabled}, Gemini enabled: {gemini_enabled}")

    results: List[ReviewerResult] = []

    if codex_enabled:
        results.append(run_codex_review(plan_content, REVIEW_SCHEMA, settings))
    else:
        eprint("[gsd-plan-review] Skipping Codex (disabled)")

    if gemini_enabled:
        results.append(run_gemini_review(plan_content, REVIEW_SCHEMA, settings))
    else:
        eprint("[gsd-plan-review] Skipping Gemini (disabled)")

    if not results:
        eprint("[gsd-plan-review] No reviewers enabled, exiting")
        return 0

    overall = worst_verdict([r.verdict for r in results if r.verdict])

    md = format_markdown(file_path, results, overall)

    review_file = write_artifacts(base, plan_content, file_path, md, results, payload, settings)
    eprint(f"[gsd-plan-review] Saved review: {review_file}")

    # Build Claude Code hook JSON output
    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": (
                f"**GSD Plan Review Complete**\n\n"
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
            "GSD plan review verdict = FAIL. Do NOT start execution yet. "
            "Revise the plan to address the high-severity issues and missing sections, "
            "then regenerate the plan with `/gsd:plan-phase`."
        )

    # Print JSON to stdout for Claude Code to process
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
