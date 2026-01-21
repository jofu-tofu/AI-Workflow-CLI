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
# Core utilities
# ---------------------------

def eprint(*args: Any) -> None:
    """Print to stderr."""
    print(*args, file=sys.stderr)


def now_local() -> datetime:
    """Get current local datetime."""
    return datetime.now()


def project_dir(payload: Dict[str, Any]) -> Path:
    """Get project directory from payload or environment."""
    p = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    return Path(p)


def sanitize_filename(s: str, max_len: int = 32) -> str:
    """Sanitize string for use in filename."""
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    return s.strip("._-")[:max_len] or "unknown"


def sanitize_title(s: str, max_len: int = 50) -> str:
    """Sanitize title for use in filename (with space-to-dash conversion)."""
    s = s.replace(' ', '-')
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    s = re.sub(r"[-_]+", "-", s)
    return s.strip("._-")[:max_len] or "unknown"


def extract_plan_title(plan: str) -> Optional[str]:
    """Extract title from '# Plan: <title>' line in plan content."""
    for line in plan.split('\n'):
        line = line.strip()
        if line.startswith('# Plan:'):
            title = line[7:].strip()
            return title if title else None
    return None


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


def mark_plan_reviewed(
    session_id: str,
    plan_hash: str,
    hook_name: str = "cc-native",
    iteration_state: Optional[Dict[str, Any]] = None,
) -> None:
    """Mark this plan as reviewed (stores hash in marker file).

    Args:
        session_id: The session identifier
        plan_hash: Hash of the plan content
        hook_name: Name of the hook (for logging)
        iteration_state: Optional iteration state dict with current, max, verdict info
    """
    marker = get_review_marker_path(session_id)
    try:
        data: Dict[str, Any] = {
            "plan_hash": plan_hash,
            "reviewed_at": datetime.now().isoformat(),
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
        eprint(f"[{hook_name}] Created review marker: {marker} (hash: {plan_hash}){iter_info}")
    except Exception as e:
        eprint(f"[{hook_name}] Warning: failed to create review marker: {e}")


# ---------------------------
# Questions offered state
# ---------------------------

def get_questions_marker_path(session_id: str) -> Path:
    """Get path to questions-offered marker file for this session."""
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id)[:32]
    return Path(tempfile.gettempdir()) / f"cc-native-questions-offered-{safe_id}.json"


def was_questions_offered(session_id: str) -> bool:
    """Check if clarifying questions were already offered this session.

    Returns False on any error (fail-safe: allow feature to work).
    """
    try:
        marker = get_questions_marker_path(session_id)
        return marker.exists()
    except Exception:
        return False


def mark_questions_offered(session_id: str) -> bool:
    """Mark that questions were offered. Returns True on success.

    Only stores timestamp, no user data. Returns False on error.
    """
    try:
        marker = get_questions_marker_path(session_id)
        data = {"offered_at": datetime.now().isoformat()}
        marker.write_text(json.dumps(data), encoding="utf-8")
        return True
    except Exception as e:
        eprint(f"[utils] Failed to write questions marker: {e}")
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
                    eprint(f"[parse] Used heuristic extraction (chars {start}-{end})")
            except Exception:
                eprint(f"[parse] Heuristic extraction failed for candidate at chars {start}-{end}")
                return None

    # If we parsed something, validate required fields
    if obj and require_fields:
        missing = [f for f in require_fields if f not in obj or not obj[f]]
        if missing:
            eprint(f"[parse] WARNING: parsed JSON ({parse_method}) missing/empty fields: {missing}")
            eprint(f"[parse] Keys present: {list(obj.keys())}")

    return obj


def coerce_to_review(obj: Optional[Dict[str, Any]], default_fix_msg: str = "Retry or check configuration.") -> Tuple[bool, str, Dict[str, Any]]:
    """Validate/normalize to our expected structure.

    Returns:
        Tuple of (ok, verdict, normalized_data).
        normalized_data includes 'summary_source' field: 'reviewer' if summary was provided,
        'default' if it was defaulted due to missing/empty summary.
    """
    if not obj:
        eprint("[coerce] WARNING: No object provided to coerce_to_review")
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
        eprint(f"[coerce] WARNING: Invalid or missing verdict '{verdict}', defaulting to 'warn'")
        verdict = "warn"

    # Log when fields are being defaulted
    summary_raw = str(obj.get("summary", "")).strip()
    if not summary_raw:
        eprint("[coerce] WARNING: summary missing or empty from parsed output, using default")
        # Add diagnostic output
        eprint(f"[coerce] Raw object keys: {list(obj.keys()) if obj else 'None'}")
        if obj:
            eprint(f"[coerce] verdict={obj.get('verdict')}, issues_count={len(obj.get('issues', []))}")
    if not obj.get("issues"):
        eprint("[coerce] INFO: issues array empty or missing")

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


def load_state(plan_path: str) -> Optional[Dict[str, Any]]:
    """Load state file for this plan if it exists."""
    state_file = get_state_path_from_plan(plan_path)

    if not state_file.exists():
        return None

    try:
        return json.loads(state_file.read_text(encoding="utf-8"))
    except Exception as e:
        eprint(f"[utils] Failed to read state file: {e}")
        return None


def save_state(plan_path: str, state: Dict[str, Any]) -> bool:
    """Save state file for this plan.

    Returns True on success, False on failure.
    """
    state_file = get_state_path_from_plan(plan_path)
    try:
        state_file.write_text(json.dumps(state, indent=2), encoding="utf-8")
        return True
    except Exception as e:
        eprint(f"[utils] Failed to save state file: {e}")
        return False


def delete_state(plan_path: str) -> bool:
    """Delete state file after successful archive.

    Returns True if deleted or didn't exist, False on error.
    """
    state_file = get_state_path_from_plan(plan_path)
    try:
        if state_file.exists():
            state_file.unlink()
            eprint(f"[utils] Deleted state file: {state_file}")
        return True
    except Exception as e:
        eprint(f"[utils] Warning: failed to delete state file: {e}")
        return False


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


def _append_review_details(
    lines: List[str],
    data: Dict[str, Any],
    max_issues: int,
    max_missing: int,
    max_questions: int
) -> None:
    """Append issue details to markdown lines."""
    issues = data.get("issues", [])
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
                "issues": r.data.get("issues", []) if r.data else [],
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
                "issues": r.data.get("issues", []) if r.data else [],
                "missing_sections": r.data.get("missing_sections", []) if r.data else [],
                "questions": r.data.get("questions", []) if r.data else [],
                "ok": r.ok,
                "error": r.err if r.err else None,
            }

    return output


def write_combined_artifacts(
    base: Path,
    plan: str,
    result: CombinedReviewResult,
    payload: Dict[str, Any],
    settings: Optional[Dict[str, Any]] = None,
    task_folder: Optional[str] = None,
) -> Path:
    """Write combined review artifacts to task-centric folder structure.

    Output: {task_folder}/reviews/ (if task_folder provided)
            or _output/cc-native/plans/{YYYY-MM-DD}/{slug}/reviews/ (fallback)

    Args:
        base: Project base directory
        plan: Plan content
        result: Combined review result
        payload: Hook payload
        settings: Display settings
        task_folder: Optional explicit task folder path from state file
    """
    if task_folder:
        # Use provided task folder (ensures review and archive use same location)
        out_dir = Path(task_folder) / "reviews"
        eprint(f"[utils] Using task_folder from state: {out_dir}")
    else:
        # Fallback: generate folder (backwards compatibility)
        ts = now_local()
        date_folder = ts.strftime("%Y-%m-%d")

        # Extract task slug from plan title
        title = extract_plan_title(plan)
        if title:
            slug = sanitize_title(title.lower())
        else:
            sid = sanitize_filename(str(payload.get("session_id", "unknown")))
            slug = f"session-{sid}"

        # Build task-centric path: plans/{date}/{slug}/reviews/
        out_dir = base / "_output" / "cc-native" / "plans" / date_folder / slug / "reviews"
        eprint(f"[utils] Generated task folder: {out_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)

    # Write combined JSON (simplified filename since folder provides context)
    json_path = out_dir / "review.json"
    json_data = build_combined_json(result)
    json_path.write_text(json.dumps(json_data, indent=2, ensure_ascii=False), encoding="utf-8")

    # Write combined Markdown
    md_path = out_dir / "review.md"
    md_content = format_combined_markdown(result, settings)
    md_path.write_text(md_content, encoding="utf-8")

    # Write individual reviewer results
    for name, r in result.cli_reviewers.items():
        if r.data:
            reviewer_path = out_dir / f"{name}.json"
            reviewer_path.write_text(
                json.dumps(r.data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
    for name, r in result.agents.items():
        if r.data:
            reviewer_path = out_dir / f"{sanitize_filename(name)}.json"
            reviewer_path.write_text(
                json.dumps(r.data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    return md_path


# ---------------------------
# Settings loading
# ---------------------------

def load_config(project_dir: Path) -> Dict[str, Any]:
    """Load full CC-Native config from _cc-native/config.json."""
    settings_path = project_dir / "_cc-native" / "config.json"
    if not settings_path.exists():
        return {}
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        eprint(f"[cc-native] Failed to load config: {e}")
        return {}


def get_display_settings(config: Dict[str, Any], section: str) -> Dict[str, int]:
    """Get display settings, checking section-specific first, then root."""
    section_display = config.get(section, {}).get("display", {})
    root_display = config.get("display", DEFAULT_DISPLAY)
    return {**DEFAULT_DISPLAY, **root_display, **section_display}
