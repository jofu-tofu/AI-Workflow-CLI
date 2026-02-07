"""Plan lifecycle management — archival, lookup, and path extraction.

Provides pure-data operations on plan files:
- archive_plan: copy plan to context plans/ folder, compute hash + signature
- find_latest_plan: locate the most relevant plan for a context
- extract_plan_path_from_result: parse plan path from ExitPlanMode output

This module does NOT modify mode or state.json.  The calling hook
(e.g. archive_plan.py) is responsible for updating mode via
context_store.update_mode() after archival succeeds.
"""
import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

from ..base.atomic_write import atomic_write
from ..base.constants import get_context_dir, get_context_plans_dir
from ..base.utils import eprint, sanitize_title


# ---------------------------------------------------------------------------
# Plan archival
# ---------------------------------------------------------------------------

def archive_plan(
    plan_path: str,
    context_id: str,
    project_root: Path = None,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Archive a plan file to the context's plans/ folder.

    Copies the plan content to:
        _output/contexts/{context_id}/plans/{date}-{slug}.md

    Computes a content hash and signature for change detection and
    fallback matching after /clear.

    Does NOT modify state.json or mode — the calling hook handles that
    via context_store.update_mode().

    Args:
        plan_path: Path to the source plan file.
        context_id: Target context identifier.
        project_root: Project root directory (default: from env / cwd).

    Returns:
        (archived_path, plan_hash, plan_signature) on success.
        (None, None, None) on any error.
    """
    plan_file = Path(plan_path)
    if not plan_file.exists():
        eprint(f"[plan_manager] Plan file not found: {plan_path}")
        return None, None, None

    # Read plan content
    try:
        content = plan_file.read_text(encoding="utf-8")
    except Exception as e:
        eprint(f"[plan_manager] Failed to read plan: {e}")
        return None, None, None

    # Compute hash and signature
    plan_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:12]
    plan_signature = content[:200]

    # Ensure plans directory exists
    plans_dir = get_context_plans_dir(context_id, project_root)
    plans_dir.mkdir(parents=True, exist_ok=True)

    # Generate archive filename: YYYY-MM-DD-<slug>.md
    date_str = datetime.now().strftime("%Y-%m-%d")
    slug = sanitize_title(plan_file.stem, max_len=30)
    archive_name = f"{date_str}-{slug}.md"
    archive_path = plans_dir / archive_name

    # Handle filename collisions with counter suffix
    counter = 2
    while archive_path.exists():
        archive_name = f"{date_str}-{slug}-{counter}.md"
        archive_path = plans_dir / archive_name
        counter += 1

    # Write archived plan atomically
    success, error = atomic_write(archive_path, content)
    if not success:
        eprint(f"[plan_manager] Failed to write archive: {error}")
        return None, None, None

    eprint(f"[plan_manager] Archived plan to: {archive_path}")
    return str(archive_path), plan_hash, plan_signature


# ---------------------------------------------------------------------------
# Plan lookup
# ---------------------------------------------------------------------------

def find_latest_plan(
    context_id: str,
    project_root: Path = None,
) -> Optional[str]:
    """Find the most relevant plan file for a context.

    Priority:
    1. state.json plan_path — if the file still exists on disk.
    2. Most recent .md in plans/ directory by modification time.
    3. None if no plans found.

    Args:
        context_id: Context identifier.
        project_root: Project root directory (default: from env / cwd).

    Returns:
        Absolute path string to the plan file, or None.
    """
    # 1. Check state.json plan_path first
    try:
        from .context_store import load_state
        state = load_state(context_id, project_root)
        if state and state.plan_path:
            plan_path = Path(state.plan_path)
            if plan_path.exists():
                return str(plan_path)
    except Exception as e:
        eprint(f"[plan_manager] Failed to check state.json plan_path: {e}")

    # 2. Fall back to most recent .md in plans/ dir by mtime
    plans_dir = get_context_plans_dir(context_id, project_root)
    if plans_dir.exists():
        plans = sorted(
            plans_dir.glob("*.md"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if plans:
            return str(plans[0])

    # 3. No plan found
    return None


# ---------------------------------------------------------------------------
# Path extraction from tool output
# ---------------------------------------------------------------------------

def extract_plan_path_from_result(tool_result: str) -> Optional[str]:
    """Extract plan file path from ExitPlanMode tool result.

    Parses the pattern: "Your plan has been saved to: <path>"
    from the tool_result string returned by ExitPlanMode.

    Args:
        tool_result: Raw text output from the ExitPlanMode tool.

    Returns:
        Plan file path string (stripped), or None if not found.
    """
    if not tool_result:
        return None
    match = re.search(r"Your plan has been saved to:\s*(.+\.md)", tool_result)
    if match:
        return match.group(1).strip()
    return None
