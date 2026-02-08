"""
CC-Native shared utilities.

Provides common functions used across all cc-native hooks:
- Core utilities (eprint, now_local, project_dir, sanitize_filename)
- Plan hash deduplication (compute_plan_hash, get_review_marker_path, etc.)
- JSON parsing (parse_json_maybe, coerce_to_review, worst_verdict)
- Artifact writing (format_markdown, write_artifacts, find_plan_file)
- Constants (REVIEW_SCHEMA, DEFAULT_DISPLAY)
- Dataclasses (ReviewerResult)
"""

import hashlib
import json
import os
import re
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from .constants import ENABLE_ROBUST_PLAN_WRITES
except ImportError:
    # When imported directly via sys.path (not as a package)
    from constants import ENABLE_ROBUST_PLAN_WRITES

# Import atomic_write from shared lib (canonical copy)
try:
    from ...lib.base.atomic_write import atomic_write
except ImportError:
    # Fallback for direct execution
    _shared_lib = Path(__file__).resolve().parent.parent.parent / "_shared" / "lib"
    import importlib.util
    _spec = importlib.util.spec_from_file_location(
        "atomic_write", str(_shared_lib / "base" / "atomic_write.py")
    )
    _mod = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    atomic_write = _mod.atomic_write

# Import canonical utilities from shared lib (with Windows bug fixes)
try:
    from ...lib.base.utils import (
        eprint,
        now_local,
        project_dir,
        sanitize_filename,
        sanitize_title,
    )
    from ...lib.base.logger import log_debug, log_info, log_warn, log_error
except ImportError:
    # Fallback for direct execution
    import sys
    from pathlib import Path
    _shared_lib = Path(__file__).resolve().parent.parent.parent / "_shared" / "lib"
    sys.path.insert(0, str(_shared_lib))
    from base.utils import (
        eprint,
        now_local,
        project_dir,
        sanitize_filename,
        sanitize_title,
    )
    from base.logger import log_debug, log_info, log_warn, log_error


# ---------------------------
# Constants
# ---------------------------

DEFAULT_DISPLAY: Dict[str, int] = {
    "maxIssues": 12,
    "maxMissingSections": 12,
    "maxQuestions": 12,
}

DEFAULT_SANITIZATION: Dict[str, int] = {
    "maxSessionIdLength": 32,
    "maxTitleLength": 50,
}

REVIEW_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["pass", "warn", "fail"]},
        "summary": {"type": "string", "minLength": 20},
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
# Dataclasses
# ---------------------------

@dataclass
class ReviewerResult:
    """Result from a plan reviewer (Codex, Gemini, or Claude agent)."""
    name: str
    ok: bool
    verdict: str  # pass|warn|fail|error|skip
    data: Dict[str, Any]
    raw: str
    err: str


# ---------------------------
# Plan hash deduplication
# ---------------------------

def compute_plan_hash(plan_content: str) -> str:
    """Compute a hash of the plan content."""
    return hashlib.sha256(plan_content.encode("utf-8")).hexdigest()[:16]


def get_review_marker_path(session_id: str) -> Path:
    """Get path to review marker file for this session."""
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id)[:32]
    return Path(tempfile.gettempdir()) / f"cc-native-plan-reviewed-{safe_id}.json"


def is_plan_already_reviewed(session_id: str, plan_hash: str) -> bool:
    """Check if this exact plan has already been reviewed in this session."""
    marker_path = get_review_marker_path(session_id)
    if not marker_path.exists():
        return False
    try:
        data = json.loads(marker_path.read_text(encoding="utf-8"))
        stored_hash = data.get("plan_hash", "")
        return stored_hash == plan_hash
    except Exception:
        return False


def was_plan_previously_denied(session_id: str, plan_hash: str) -> bool:
    """Check if this plan hash was previously reviewed and denied."""
    marker_path = get_review_marker_path(session_id)
    if not marker_path.exists():
        return False
    try:
        data = json.loads(marker_path.read_text(encoding="utf-8"))
        return data.get("plan_hash") == plan_hash and data.get("decision") == "deny"
    except Exception:
        return False


def mark_plan_reviewed(
    session_id: str,
    plan_hash: str,
    hook_name: str = "cc-native",
    iteration_state: Optional[Dict[str, Any]] = None,
    decision: str = "allow",
) -> None:
    """Mark this plan as reviewed (stores hash and decision in marker file).

    Args:
        session_id: The session identifier
        plan_hash: Hash of the plan content
        hook_name: Name of the hook (for logging)
        iteration_state: Optional iteration state dict with current, max, verdict info
        decision: Review decision - "allow" or "deny"
    """
    marker = get_review_marker_path(session_id)
    try:
        data: Dict[str, Any] = {
            "plan_hash": plan_hash,
            "reviewed_at": datetime.now().isoformat(),
            "decision": decision,
        }

        # Include iteration info if provided
        if iteration_state:
            data["iteration"] = {
                "current": iteration_state.get("current", 1),
                "max": iteration_state.get("max", 1),
                "complexity": iteration_state.get("complexity", "unknown"),
            }
            # Include latest verdict from history if available
            history = iteration_state.get("history", [])
            if history:
                data["iteration"]["latest_verdict"] = history[-1].get("verdict", "unknown")

        marker.write_text(json.dumps(data), encoding="utf-8")
        iter_info = f" (iteration {data.get('iteration', {}).get('current', '?')}/{data.get('iteration', {}).get('max', '?')})" if iteration_state else ""
        log_info(hook_name, f"Created review marker: {marker} (hash: {plan_hash}){iter_info}")
    except Exception as e:
        log_warn(hook_name, f"Failed to create review marker: {e}")


# ---------------------------
# Questions asked state
# ---------------------------

def get_questions_asked_marker_path(session_id: str) -> Path:
    """Get path to questions-asked marker file for this session."""
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id)[:32]
    return Path(tempfile.gettempdir()) / f"cc-native-questions-asked-{safe_id}.json"


def was_questions_asked(session_id: str) -> bool:
    """Check if AskUserQuestion was called this session.

    Returns False on any error (fail-safe: allow feature to work).
    """
    try:
        return get_questions_asked_marker_path(session_id).exists()
    except Exception:
        return False


def mark_questions_asked(session_id: str) -> bool:
    """Mark that AskUserQuestion was called. Returns True on success.

    Only stores timestamp, no user data. Returns False on error.
    """
    try:
        marker = get_questions_asked_marker_path(session_id)
        marker.write_text(json.dumps({"asked_at": datetime.now().isoformat()}), encoding="utf-8")
        return True
    except Exception as e:
        log_warn("utils", f"Failed to write questions-asked marker: {e}")
        return False


# ---------------------------
# JSON parsing
# ---------------------------

def parse_json_maybe(text: str, require_fields: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
    """Try strict JSON parse. If that fails, attempt to extract the first {...} block.

    Args:
        text: Raw text that may contain JSON
        require_fields: Optional list of field names to check for in parsed result.
                       If provided and fields are missing, a warning is logged but
                       the object is still returned.

    Returns:
        Parsed dict or None if parsing failed entirely.
    """
    text = text.strip()
    if not text:
        return None

    obj: Optional[Dict[str, Any]] = None
    parse_method = None

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            obj = parsed
            parse_method = "strict"
    except Exception:
        pass

    # Heuristic: try to extract a JSON object substring
    if obj is None:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = text[start : end + 1]
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    obj = parsed
                    parse_method = "heuristic"
                    log_debug("parse", f"Used heuristic extraction (chars {start}-{end})")
            except Exception:
                log_debug("parse", f"Heuristic extraction failed for candidate at chars {start}-{end}")
                return None

    # If we parsed something, validate required fields
    if obj and require_fields:
        missing = [f for f in require_fields if f not in obj or not obj[f]]
        if missing:
            log_warn("parse", f"Parsed JSON ({parse_method}) missing/empty fields: {missing}")
            log_debug("parse", f"Keys present: {list(obj.keys())}")

    return obj


def coerce_to_review(obj: Optional[Dict[str, Any]], default_fix_msg: str = "Retry or check configuration.") -> Tuple[bool, str, Dict[str, Any]]:
    """Validate/normalize to our expected structure.

    Returns:
        Tuple of (ok, verdict, normalized_data).
        normalized_data includes 'summary_source' field: 'reviewer' if summary was provided,
        'default' if it was defaulted due to missing/empty summary.
    """
    if not obj:
        log_warn("coerce", "No object provided to coerce_to_review")
        return False, "error", {
            "verdict": "fail",
            "summary": "No structured output returned.",
            "summary_source": "default",
            "issues": [{"severity": "high", "category": "tooling", "issue": "Reviewer returned no JSON.", "suggested_fix": default_fix_msg}],
            "missing_sections": [],
            "questions": [],
        }

    verdict = obj.get("verdict")
    if verdict not in ("pass", "warn", "fail"):
        log_warn("coerce", f"Invalid or missing verdict '{verdict}', defaulting to 'warn'")
        verdict = "warn"

    # Log when fields are being defaulted
    summary_raw = str(obj.get("summary", "")).strip()
    if not summary_raw:
        log_warn("coerce", "summary missing or empty from parsed output, using default")
        # Add diagnostic output
        log_debug("coerce", f"Raw object keys: {list(obj.keys()) if obj else 'None'}")
        if obj:
            log_debug("coerce", f"verdict={obj.get('verdict')}, issues_count={len(obj.get('issues', []))}")
    if not obj.get("issues"):
        log_debug("coerce", "issues array empty or missing")

    norm = {
        "verdict": verdict,
        "summary": summary_raw or "No summary provided.",
        "summary_source": "reviewer" if summary_raw else "default",
        "issues": obj.get("issues") if isinstance(obj.get("issues"), list) else [],
        "missing_sections": obj.get("missing_sections") if isinstance(obj.get("missing_sections"), list) else [],
        "questions": obj.get("questions") if isinstance(obj.get("questions"), list) else [],
    }

    return True, verdict, norm


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


def compute_review_decision(
    all_verdicts: List[str],
    warn_threshold: float = 0.5,
) -> Tuple[bool, str, float]:
    """Verdict aggregation: fail veto triggers a block.

    Per-agent high-severity override happens upstream (caller overrides
    individual agent verdicts to "fail" when they exceed the threshold),
    so this function only needs fail_veto logic.

    Priority order:
    1. Fail Veto: Any fail -> deny (ISO 61508 zero-tolerance).
    2. Acceptable: warns are informational only.

    Error exclusion: Detectors that produce no signal (error/skip) are excluded
    from the denominator. They provide no information about plan quality.

    Args:
        all_verdicts: List of verdict strings from all reviewers.
        warn_threshold: Kept for backward compatibility. No longer used for blocking.

    Returns:
        Tuple of (should_deny, reason, score).
        - should_deny: True if the plan should be denied.
        - reason: "fail_veto", "acceptable", or "no_signal".
        - score: 1.0 for deny cases, warn_ratio for informational, 0.0 for no_signal.
    """
    # Exclude non-signal verdicts
    signal_verdicts = [v for v in all_verdicts if v in ("pass", "warn", "fail")]

    if not signal_verdicts:
        return False, "no_signal", 0.0

    # Fail blocks unconditionally
    fail_count = signal_verdicts.count("fail")
    if fail_count > 0:
        return True, "fail_veto", 1.0

    # Warn ratio still computed for logging/visibility, but does NOT block
    warn_count = signal_verdicts.count("warn")
    warn_ratio = warn_count / len(signal_verdicts)
    return False, "acceptable", warn_ratio


# ---------------------------
# Artifact writing
# ---------------------------

def find_plan_file() -> Optional[str]:
    """Find the most recent plan file in ~/.claude/plans/."""
    plans_dir = Path.home() / ".claude" / "plans"
    if not plans_dir.exists():
        return None
    plan_files = list(plans_dir.glob("*.md"))
    if not plan_files:
        return None
    plan_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return str(plan_files[0])


def get_state_path_from_plan(plan_path: str) -> Path:
    """Derive state file path from plan file path.

    The state file is stored adjacent to the plan file with a .state.json extension.
    This prevents state loss when session IDs change or temp files are cleaned up.

    Example: ~/.claude/plans/foo.md -> ~/.claude/plans/foo.state.json
    """
    plan_file = Path(plan_path)
    return plan_file.with_suffix('.state.json')


def format_review_markdown(
    results: List[ReviewerResult],
    overall: str,
    title: str = "CC-Native Plan Review",
    settings: Optional[Dict[str, Any]] = None,
) -> str:
    """Format review results as markdown."""
    display = DEFAULT_DISPLAY.copy()
    if settings:
        display = settings.get("display", DEFAULT_DISPLAY)

    max_issues = display.get("maxIssues", 12)
    max_missing = display.get("maxMissingSections", 12)
    max_questions = display.get("maxQuestions", 12)

    lines: List[str] = []
    lines.append(f"# {title}\n")
    lines.append(f"**Overall verdict:** `{overall.upper()}`\n")

    for r in results:
        lines.append(f"## {r.name.title() if r.name.islower() else r.name}\n")
        lines.append(f"- ok: `{r.ok}`")
        lines.append(f"- verdict: `{r.verdict}`")
        if r.data:
            summary = r.data.get('summary', '').strip()
            if r.data.get('summary_source') == 'default':
                lines.append(f"- summary: ⚠️ {summary} *(reviewer did not return summary)*")
            else:
                lines.append(f"- summary: {summary}")
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


def write_review_artifacts(
    base: Path,
    plan: str,
    md: str,
    results: List[ReviewerResult],
    payload: Dict[str, Any],
    subdir: str = "reviews",
) -> Path:
    """Write review artifacts to _output/cc-native/plans/{subdir}/."""
    ts = now_local()
    date_folder = ts.strftime("%Y-%m-%d")
    time_part = ts.strftime("%H%M%S")
    sid = sanitize_filename(str(payload.get("session_id", "unknown")))

    out_dir = base / "_output" / "cc-native" / "plans" / subdir / date_folder
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


@dataclass
class OrchestratorResult:
    """Result from the plan orchestrator."""
    complexity: str  # simple | medium | high
    category: str    # code | infrastructure | documentation | life | business | design | research
    selected_agents: List[str]
    reasoning: str
    skip_reason: Optional[str] = None
    error: Optional[str] = None


@dataclass
class CombinedReviewResult:
    """Combined result from all review phases."""
    plan_hash: str
    overall_verdict: str
    cli_reviewers: Dict[str, ReviewerResult]
    orchestration: Optional[OrchestratorResult]
    agents: Dict[str, ReviewerResult]
    timestamp: str


def format_combined_markdown(
    result: CombinedReviewResult,
    settings: Optional[Dict[str, Any]] = None,
) -> str:
    """Format combined review result as a single markdown document."""
    display = DEFAULT_DISPLAY.copy()
    if settings:
        display = settings.get("display", DEFAULT_DISPLAY)

    max_issues = display.get("maxIssues", 12)
    max_missing = display.get("maxMissingSections", 12)
    max_questions = display.get("maxQuestions", 12)

    lines: List[str] = []
    lines.append("# CC-Native Plan Review\n")
    lines.append(f"**Overall Verdict:** `{result.overall_verdict.upper()}`")
    lines.append(f"**Plan Hash:** `{result.plan_hash}`\n")
    lines.append("---\n")

    # CLI Reviewers section
    if result.cli_reviewers:
        lines.append("## CLI Reviewers\n")
        for name, r in result.cli_reviewers.items():
            lines.append(f"### {name.title()}\n")
            lines.append(f"- verdict: `{r.verdict}`")
            if r.data:
                summary = r.data.get('summary', '').strip()
                if r.data.get('summary_source') == 'default':
                    lines.append(f"- summary: ⚠️ {summary} *(reviewer did not return summary)*")
                else:
                    lines.append(f"- summary: {summary}")
                _append_review_details(lines, r.data, max_issues, max_missing, max_questions)
            elif r.err:
                lines.append(f"- error: {r.err}")
            lines.append("")

    # Orchestration section
    if result.orchestration:
        lines.append("---\n")
        lines.append("## Orchestration\n")
        lines.append(f"- **Complexity:** `{result.orchestration.complexity}`")
        lines.append(f"- **Category:** `{result.orchestration.category}`")
        agents_str = ", ".join(result.orchestration.selected_agents) if result.orchestration.selected_agents else "None"
        lines.append(f"- **Agents Selected:** {agents_str}")
        lines.append(f"- **Reasoning:** {result.orchestration.reasoning}")
        if result.orchestration.skip_reason:
            lines.append(f"- **Skip Reason:** {result.orchestration.skip_reason}")
        if result.orchestration.error:
            lines.append(f"- **Error:** {result.orchestration.error}")
        lines.append("")

    # Agent Reviews section
    if result.agents:
        lines.append("---\n")
        lines.append("## Agent Reviews\n")
        for name, r in result.agents.items():
            lines.append(f"### {name}\n")
            lines.append(f"- verdict: `{r.verdict}`")
            if r.data:
                summary = r.data.get('summary', '').strip()
                if r.data.get('summary_source') == 'default':
                    lines.append(f"- summary: ⚠️ {summary} *(reviewer did not return summary)*")
                else:
                    lines.append(f"- summary: {summary}")
                _append_review_details(lines, r.data, max_issues, max_missing, max_questions)
            elif r.err:
                lines.append(f"- error: {r.err}")
            lines.append("")

    return "\n".join(lines).strip() + "\n"


def build_inline_review_summary(
    combined: CombinedReviewResult,
    max_issues: int = 5,
    max_chars: int = 800,
) -> str:
    """Build compact inline summary of HIGH-severity review findings for additionalContext.

    Returns an overall verdict line plus up to 5 high-severity issues as bullet points.
    Per-reviewer verdicts, missing sections, and key questions are omitted from inline
    output (they remain in the full review artifact on disk).

    Args:
        combined: The combined review result from all reviewers.
        max_issues: Maximum number of high-severity issues to include.
        max_chars: Character budget for the summary (truncated if exceeded).

    Returns:
        Compact summary string, or empty string if no high-severity findings.
    """
    # Collect HIGH severity issues across all reviewers
    all_reviewers: List[ReviewerResult] = []
    all_reviewers.extend(combined.cli_reviewers.values())
    all_reviewers.extend(combined.agents.values())

    high_issues: List[Dict[str, Any]] = []
    for r in all_reviewers:
        if not r.data:
            continue
        for issue in r.data.get("issues", []):
            if issue.get("severity") == "high":
                high_issues.append({**issue, "_reviewer": r.name})

    parts: List[str] = []

    # Overall verdict line
    parts.append(f"**Plan Review: {combined.overall_verdict.upper()}**"
                 + (f" ({len(high_issues)} high-severity issue{'s' if len(high_issues) != 1 else ''})"
                    if high_issues else ""))

    # High-severity issue bullets (max 5)
    for issue in high_issues[:max_issues]:
        cat = issue.get("category", "general")
        text = issue.get("issue", "")
        fix = issue.get("suggested_fix", "")
        reviewer = issue.get("_reviewer", "unknown")
        line = f"- [{cat}] {text}"
        if fix:
            line += f" \u2192 {fix}"
        line += f" ({reviewer})"
        parts.append(line)
    remaining = len(high_issues) - max_issues
    if remaining > 0:
        parts.append(f"  ...and {remaining} more")

    result = "\n".join(parts)
    if len(result) > max_chars:
        result = result[:max_chars - 3] + "..."
    return result


def extract_top_issues_text(
    combined: CombinedReviewResult,
    max_count: int = 3,
    severity: str = "high",
) -> str:
    """Extract top issues as a compact text string for permissionDecisionReason.

    Collects the first matching issue from each reviewer/agent, prefixed with
    the reviewer name for attribution. This gives breadth across agents rather
    than depth from a single one.

    Args:
        combined: The combined review result.
        max_count: Maximum number of issues to include.
        severity: Severity level to filter for.

    Returns:
        Compact semicolon-separated issue text with agent attribution.
    """
    all_reviewers: List[ReviewerResult] = []
    all_reviewers.extend(combined.cli_reviewers.values())
    all_reviewers.extend(combined.agents.values())

    issues: List[str] = []
    for r in all_reviewers:
        if not r.data:
            continue
        for issue in r.data.get("issues", []):
            if issue.get("severity") == severity:
                text = issue.get("issue", "").strip()
                if text:
                    issues.append(f"[{r.name}] {text}")
                break  # first high issue per reviewer only
        if len(issues) >= max_count:
            break

    if not issues:
        return "Review found critical issues"
    return "; ".join(issues)


def build_high_issues_document(combined: CombinedReviewResult) -> str:
    """Build a markdown document containing ONLY high-severity issues.

    Grouped by reviewer/agent name with issue text and suggested fix.
    This is the primary signal document for plan revision — high severity
    only, no noise from medium/low issues.
    """
    lines = ["# High-Severity Issues\n"]
    all_reviewers = list(combined.cli_reviewers.values()) + list(combined.agents.values())

    found_any = False
    for r in all_reviewers:
        if not r.data:
            continue
        high_issues = [i for i in r.data.get("issues", []) if i.get("severity") == "high"]
        if not high_issues:
            continue
        found_any = True
        lines.append(f"## {r.name} ({r.verdict})\n")
        for issue in high_issues:
            cat = issue.get("category", "general")
            text = issue.get("issue", "").strip()
            fix = issue.get("suggested_fix", "").strip()
            lines.append(f"- **[{cat}]** {text}")
            if fix:
                lines.append(f"  - Fix: {fix}")
        lines.append("")  # blank line between agents

    if not found_any:
        lines.append("No high-severity issues found.\n")

    return "\n".join(lines)


def _append_review_details(
    lines: List[str],
    data: Dict[str, Any],
    max_issues: int,
    max_missing: int,
    max_questions: int
) -> None:
    """Append issue details to markdown lines."""
    issues = [i for i in data.get("issues", []) if i.get("severity") != "low"]
    if issues:
        lines.append("\n**Issues:**")
        for it in issues[:max_issues]:
            sev = it.get("severity", "medium")
            cat = it.get("category", "general")
            issue = it.get("issue", "")
            fix = it.get("suggested_fix", "")
            lines.append(f"- **[{sev}] {cat}**: {issue}")
            if fix:
                lines.append(f"  - fix: {fix}")

    missing = data.get("missing_sections", [])
    if missing:
        lines.append("\n**Missing Sections:**")
        for m in missing[:max_missing]:
            lines.append(f"- {m}")

    qs = data.get("questions", [])
    if qs:
        lines.append("\n**Questions:**")
        for q in qs[:max_questions]:
            lines.append(f"- {q}")


def build_combined_json(result: CombinedReviewResult) -> Dict[str, Any]:
    """Build combined JSON output structure."""
    output: Dict[str, Any] = {
        "metadata": {
            "timestamp": result.timestamp,
            "plan_hash": result.plan_hash,
        },
        "overall": {
            "verdict": result.overall_verdict,
        },
    }

    # CLI reviewers
    if result.cli_reviewers:
        output["cliReviewers"] = {}
        for name, r in result.cli_reviewers.items():
            output["cliReviewers"][name] = {
                "verdict": r.verdict,
                "summary": r.data.get("summary") if r.data else None,
                "summarySource": r.data.get("summary_source") if r.data else None,
                "issues": [i for i in r.data.get("issues", []) if i.get("severity") != "low"] if r.data else [],
                "ok": r.ok,
                "error": r.err if r.err else None,
            }

    # Orchestration
    if result.orchestration:
        output["orchestration"] = {
            "complexity": result.orchestration.complexity,
            "category": result.orchestration.category,
            "selectedAgents": result.orchestration.selected_agents,
            "reasoning": result.orchestration.reasoning,
            "skipReason": result.orchestration.skip_reason,
            "error": result.orchestration.error,
        }

    # Agents
    if result.agents:
        output["agents"] = {}
        for name, r in result.agents.items():
            output["agents"][name] = {
                "verdict": r.verdict,
                "summary": r.data.get("summary") if r.data else None,
                "summarySource": r.data.get("summary_source") if r.data else None,
                "issues": [i for i in r.data.get("issues", []) if i.get("severity") != "low"] if r.data else [],
                "missing_sections": r.data.get("missing_sections", []) if r.data else [],
                "questions": r.data.get("questions", []) if r.data else [],
                "ok": r.ok,
                "error": r.err if r.err else None,
            }

    return output


def generate_review_index(
    result: CombinedReviewResult,
    iteration: Optional[int] = None,
    settings: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate index.md for a review folder.

    Args:
        result: Combined review result
        iteration: Iteration number (1-based)
        settings: Display settings

    Returns:
        Markdown content for index.md
    """
    from datetime import datetime
    now = datetime.now()

    lines = [
        "---",
        "type: review",
        f"plan_hash: {result.plan_hash}",
        f"overall_verdict: {result.overall_verdict}",
        f"created_at: {result.timestamp}",
    ]
    if iteration:
        lines.append(f"iteration: {iteration}")
    lines.extend([
        "---",
        "",
        f"# Plan Review - {now.strftime('%Y-%m-%d %H:%M')}",
        "",
        f"**Overall Verdict:** `{result.overall_verdict.upper()}`",
    ])

    if iteration:
        lines.append(f"**Iteration:** {iteration}")

    lines.extend([
        f"**Plan Hash:** `{result.plan_hash}`",
        "",
    ])

    # Summary from orchestrator
    if result.orchestration:
        lines.extend([
            "## Analysis",
            f"- **Complexity:** `{result.orchestration.complexity}`",
            f"- **Category:** `{result.orchestration.category}`",
            f"- **Reasoning:** {result.orchestration.reasoning}",
            "",
        ])

    # Navigation table
    lines.extend([
        "## Review Files",
        "",
        "| File | Description |",
        "|------|-------------|",
        "| [combined.md](./combined.md) | Full review details |",
        "| [combined.json](./combined.json) | Structured review data |",
    ])

    # CLI reviewers
    for name in result.cli_reviewers.keys():
        lines.append(f"| [{name}.json](./{name}.json) | {name.title()} reviewer output |")

    # Agent reviewers
    for name in result.agents.keys():
        safe_name = sanitize_filename(name)
        lines.append(f"| [{safe_name}.json](./{safe_name}.json) | {name} agent output |")

    lines.extend([
        "",
        "## Verdicts Summary",
        "",
        "| Reviewer | Verdict |",
        "|----------|---------|",
    ])

    for name, r in result.cli_reviewers.items():
        lines.append(f"| {name.title()} | `{r.verdict}` |")
    for name, r in result.agents.items():
        lines.append(f"| {name} | `{r.verdict}` |")

    lines.append("")

    return '\n'.join(lines)


def write_combined_artifacts(
    base: Path,
    plan: str,
    result: CombinedReviewResult,
    payload: Dict[str, Any],
    settings: Optional[Dict[str, Any]] = None,
    context_reviews_dir: Optional[Path] = None,
    review_folder: Optional[Path] = None,
    iteration: Optional[int] = None,
) -> Path:
    """Write combined review artifacts to context reviews folder.

    Args:
        base: Project base directory
        plan: Plan content
        result: Combined review result
        payload: Hook payload
        settings: Display settings
        context_reviews_dir: Reviews directory from context system (deprecated, use review_folder)
        review_folder: Specific folder to write to (takes precedence)
        iteration: Iteration number for index generation

    Raises:
        ValueError: If neither context_reviews_dir nor review_folder is provided
    """
    # Support both old and new API
    out_dir = review_folder or context_reviews_dir
    if not out_dir:
        raise ValueError("Either context_reviews_dir or review_folder is required")

    log_debug("utils", f"Using review folder: {out_dir}")

    # Check directory creation explicitly
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except PermissionError as e:
        log_error("utils", f"Cannot create directory {out_dir}: {e}")
        raise

    # JSON write with atomic operation - use combined.json for folder-based
    json_filename = "combined.json" if review_folder else "review.json"
    json_path = out_dir / json_filename
    json_data = build_combined_json(result)
    try:
        if ENABLE_ROBUST_PLAN_WRITES:
            success, error = atomic_write(json_path, json.dumps(json_data, indent=2, ensure_ascii=False))
            if not success:
                raise IOError(f"Atomic write failed: {error}")
        else:
            json_path.write_text(json.dumps(json_data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        log_error("utils", f"Failed to write {json_path.name}: {e}")
        raise

    # Markdown write with atomic operation - use combined.md for folder-based
    md_filename = "combined.md" if review_folder else "review.md"
    md_path = out_dir / md_filename
    md_content = format_combined_markdown(result, settings)
    try:
        if ENABLE_ROBUST_PLAN_WRITES:
            success, error = atomic_write(md_path, md_content)
            if not success:
                raise IOError(f"Atomic write failed: {error}")
        else:
            md_path.write_text(md_content, encoding="utf-8")
    except Exception as e:
        log_error("utils", f"Failed to write {md_path.name}: {e}")
        raise

    # Individual reviewer writes (non-critical - continue on failure)
    for name, r in result.cli_reviewers.items():
        if r.data:
            reviewer_path = out_dir / f"{name}.json"
            try:
                content = json.dumps(r.data, indent=2, ensure_ascii=False)
                if ENABLE_ROBUST_PLAN_WRITES:
                    success, error = atomic_write(reviewer_path, content)
                    if not success:
                        log_warn("utils", f"Failed to write {reviewer_path.name}: {error}")
                else:
                    reviewer_path.write_text(content, encoding="utf-8")
            except Exception as e:
                log_warn("utils", f"Failed to write {reviewer_path.name}: {e}")
                # Continue - individual reviewer failures not critical
    for name, r in result.agents.items():
        if r.data:
            reviewer_path = out_dir / f"{sanitize_filename(name)}.json"
            try:
                content = json.dumps(r.data, indent=2, ensure_ascii=False)
                if ENABLE_ROBUST_PLAN_WRITES:
                    success, error = atomic_write(reviewer_path, content)
                    if not success:
                        log_warn("utils", f"Failed to write {reviewer_path.name}: {error}")
                else:
                    reviewer_path.write_text(content, encoding="utf-8")
            except Exception as e:
                log_warn("utils", f"Failed to write {reviewer_path.name}: {e}")
                # Continue - individual reviewer failures not critical

    # Generate index.md for folder-based reviews
    if review_folder:
        index_content = generate_review_index(result, iteration, settings)
        index_path = out_dir / "index.md"
        try:
            if ENABLE_ROBUST_PLAN_WRITES:
                success, error = atomic_write(index_path, index_content)
                if not success:
                    log_warn("utils", f"Failed to write index.md: {error}")
            else:
                index_path.write_text(index_content, encoding="utf-8")
        except Exception as e:
            log_warn("utils", f"Failed to write index.md: {e}")

        return index_path

    return md_path


# ---------------------------
# Settings loading
# ---------------------------

def load_config(project_dir: Path) -> Dict[str, Any]:
    """Load full CC-Native config from _cc-native/plan-review.config.json."""
    settings_path = project_dir / "_cc-native" / "plan-review.config.json"
    if not settings_path.exists():
        return {}
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log_warn("cc-native", f"Failed to load config: {e}")
        return {}


def get_display_settings(config: Dict[str, Any], section: str) -> Dict[str, int]:
    """Get display settings, checking section-specific first, then root."""
    section_display = config.get(section, {}).get("display", {})
    root_display = config.get("display", DEFAULT_DISPLAY)
    return {**DEFAULT_DISPLAY, **root_display, **section_display}
