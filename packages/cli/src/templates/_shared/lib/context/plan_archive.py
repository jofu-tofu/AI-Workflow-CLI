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


def get_active_context_for_plan(
    plan_path: str,
    project_root: Path = None
) -> Optional[str]:
    """
    Determine which context a plan belongs to.

    Logic:
    1. If exactly one active context exists -> use it
    2. Check if plan path contains context hints
    3. Return None if ambiguous

    Args:
        plan_path: Path to plan file
        project_root: Project root directory

    Returns:
        Context ID or None if cannot determine
    """
    active_contexts = get_all_contexts(status="active", project_root=project_root)

    # If exactly one active context, use it
    if len(active_contexts) == 1:
        return active_contexts[0].id

    # Check if plan path contains a context ID
    plan_path_lower = plan_path.lower()
    for ctx in active_contexts:
        if ctx.id.lower() in plan_path_lower:
            return ctx.id

    # Check plan filename for context hints
    plan_file = Path(plan_path)
    filename_lower = plan_file.stem.lower()
    for ctx in active_contexts:
        if ctx.id.lower() in filename_lower:
            return ctx.id

    # If no active contexts, return None (caller should create new context)
    if not active_contexts:
        return None

    # Multiple active contexts, cannot determine
    eprint(f"[plan_archive] Multiple active contexts, cannot determine target")
    return None


def create_context_from_plan(
    plan_path: str,
    project_root: Path = None
) -> Optional[str]:
    """
    Create a new context based on a plan file.

    Extracts context ID and summary from plan filename/content.

    Args:
        plan_path: Path to plan file
        project_root: Project root directory

    Returns:
        Created context ID or None on error
    """
    plan_file = Path(plan_path)
    if not plan_file.exists():
        eprint(f"[plan_archive] Plan file not found: {plan_path}")
        return None

    # Generate context ID from plan filename
    context_id = sanitize_title(plan_file.stem, max_len=50)

    # Try to extract summary from plan content
    try:
        content = plan_file.read_text(encoding='utf-8')
        # Look for first heading as summary
        for line in content.splitlines():
            line = line.strip()
            if line.startswith('#'):
                summary = line.lstrip('#').strip()[:100]
                break
        else:
            summary = f"Implementation of {plan_file.stem}"
    except Exception:
        summary = f"Implementation of {plan_file.stem}"

    # Create the context
    try:
        context = create_context(
            context_id=context_id,
            summary=summary,
            method="cc-native",
            project_root=project_root
        )
        return context.id
    except ValueError as e:
        eprint(f"[plan_archive] Failed to create context: {e}")
        return None


def mark_plan_implementation_started(
    context_id: str,
    project_root: Path = None
) -> bool:
    """
    Mark that plan implementation has started.

    Called by SessionStart after detecting pending_implementation.
    Prevents re-triggering on subsequent /clear commands.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        True if successful
    """
    context = update_plan_status(
        context_id,
        status="implementing",
        project_root=project_root
    )
    return context is not None


def mark_plan_completed(
    context_id: str,
    project_root: Path = None
) -> bool:
    """
    Mark that plan has been fully implemented.

    Called when all plan tasks are completed.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        True if successful
    """
    context = update_plan_status(
        context_id,
        status="none",
        project_root=project_root
    )
    return context is not None
