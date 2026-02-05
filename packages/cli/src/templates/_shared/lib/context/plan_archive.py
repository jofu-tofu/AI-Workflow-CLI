"""Plan archive utilities for context management.

Provides functions for archiving plans to context folders and
managing plan lifecycle.

Used by:
- ExitPlanMode hook to archive approved plans
- SessionStart to detect pending implementations
"""
import hashlib
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

from .context_manager import (
    Context,
    create_context,
    get_context,
    get_all_contexts,
    update_plan_status,
)
from .event_log import append_event, EVENT_PLAN_CREATED
from ..base.atomic_write import atomic_write
from ..base.constants import get_context_plans_dir
from ..base.utils import eprint, now_iso, sanitize_title


def archive_plan_to_context(
    plan_path: str,
    context_id: str,
    project_root: Path = None
) -> Tuple[Optional[str], Optional[str]]:
    """
    Archive plan to context's plans folder.

    Actions:
    1. Copy plan to _output/contexts/<context_id>/plans/<date>-<slug>.md
    2. Compute plan hash for change detection
    3. Update context.json: in_flight.mode = "pending_implementation"
    4. Update context.json: in_flight.artifact_path = archived path

    Args:
        plan_path: Path to the plan file to archive
        context_id: Target context ID
        project_root: Project root directory

    Returns:
        Tuple of (archived_path, plan_hash) or (None, None) on error
    """
    plan_file = Path(plan_path)
    if not plan_file.exists():
        eprint(f"[plan_archive] Plan file not found: {plan_path}")
        return None, None

    # Read plan content
    try:
        plan_content = plan_file.read_text(encoding='utf-8')
    except Exception as e:
        eprint(f"[plan_archive] Failed to read plan: {e}")
        return None, None

    # Compute hash for change detection
    plan_hash = hashlib.sha256(plan_content.encode('utf-8')).hexdigest()[:12]

    # Create plans directory
    plans_dir = get_context_plans_dir(context_id, project_root)
    plans_dir.mkdir(parents=True, exist_ok=True)

    # Generate archive filename: YYYY-MM-DD-<slug>.md
    date_str = datetime.now().strftime("%Y-%m-%d")
    slug = sanitize_title(plan_file.stem, max_len=30)
    archive_name = f"{date_str}-{slug}.md"
    archive_path = plans_dir / archive_name

    # Handle name collision
    counter = 2
    while archive_path.exists():
        archive_name = f"{date_str}-{slug}-{counter}.md"
        archive_path = plans_dir / archive_name
        counter += 1

    # Write archived plan
    success, error = atomic_write(archive_path, plan_content)
    if not success:
        eprint(f"[plan_archive] Failed to write archive: {error}")
        return None, None

    # Update context plan status
    update_plan_status(
        context_id,
        status="pending_implementation",
        path=str(archive_path),
        hash=plan_hash,
        project_root=project_root
    )

    eprint(f"[plan_archive] Archived plan to: {archive_path}")
    return str(archive_path), plan_hash


