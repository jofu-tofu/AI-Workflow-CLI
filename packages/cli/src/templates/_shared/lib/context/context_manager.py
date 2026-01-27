"""Context manager for AIW CLI templates.

Provides CRUD operations for contexts with event sourcing.
All operations append events to events.jsonl (source of truth)
and update cache files (context.json, index.json).

Data hierarchy:
  events.jsonl (source of truth) - append only
    → context.json (L1 cache) - updated in place
      → index.json (L2 cache) - updated in place
"""
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

import shutil

from ..base.atomic_write import atomic_write
from ..base.constants import (
    get_context_dir,
    get_contexts_dir,
    get_context_file_path,
    get_events_file_path,
    get_index_path,
    get_archive_dir,
    get_archive_context_dir,
    get_archive_index_path,
    validate_context_id,
)
from ..base.utils import eprint, now_iso, generate_context_id
from .event_log import (
    append_event,
    get_current_state,
    EVENT_CONTEXT_CREATED,
    EVENT_CONTEXT_COMPLETED,
    EVENT_CONTEXT_REOPENED,
    EVENT_CONTEXT_ARCHIVED,
    EVENT_METADATA_UPDATED,
    EVENT_PLANNING_STARTED,
    EVENT_PLAN_CREATED,
    EVENT_PLAN_IMPLEMENTATION_STARTED,
    EVENT_PLAN_COMPLETED,
    EVENT_HANDOFF_CREATED,
    EVENT_HANDOFF_CLEARED,
)


@dataclass
class InFlightState:
    """In-flight work state (plan, research, etc.)."""
    mode: str = "none"  # none, planning, pending_implementation, implementing
    artifact_path: Optional[str] = None
    artifact_hash: Optional[str] = None
    started_at: Optional[str] = None
    session_ids: Optional[List[str]] = None  # Set-like list of session IDs (no duplicates)
    handoff_path: Optional[str] = None


@dataclass
class Context:
    """Context metadata for display and indexing."""
    id: str
    status: str = "active"  # active, completed
    summary: str = ""
    method: Optional[str] = None
    tags: List[str] = None
    created_at: Optional[str] = None
    last_active: Optional[str] = None
    folder: Optional[str] = None
    in_flight: InFlightState = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        if self.in_flight is None:
            self.in_flight = InFlightState()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "status": self.status,
            "summary": self.summary,
            "method": self.method,
            "tags": self.tags or [],
            "created_at": self.created_at,
            "last_active": self.last_active,
            "in_flight": asdict(self.in_flight) if self.in_flight else {"mode": "none"}
        }

    def to_index_entry(self) -> Dict[str, Any]:
        """Convert to index.json entry format."""
        return {
            "id": self.id,
            "status": self.status,
            "method": self.method,
            "summary": self.summary,
            "created_at": self.created_at,
            "last_active": self.last_active,
            "folder": self.folder,
            "in_flight_mode": self.in_flight.mode if self.in_flight else "none"
        }


def _write_context_cache(context: Context, project_root: Path = None) -> bool:
    """
    Write context.json cache file.

    Args:
        context: Context to write
        project_root: Project root directory

    Returns:
        True if successful
    """
    context_file = get_context_file_path(context.id, project_root)
    content = json.dumps(context.to_dict(), indent=2, ensure_ascii=False)
    success, error = atomic_write(context_file, content)

    if not success:
        eprint(f"[context_manager] WARNING: Failed to write context cache: {error}")

    return success


def _update_index_cache(context: Context, project_root: Path = None) -> bool:
    """
    Update index.json with context entry.

    Args:
        context: Context to add/update in index
        project_root: Project root directory

    Returns:
        True if successful
    """
    index_path = get_index_path(project_root)

    # Load existing index or create new
    index = {"version": "2.0", "updated_at": now_iso(), "contexts": {}}

    if index_path.exists():
        try:
            index = json.loads(index_path.read_text(encoding='utf-8'))
        except Exception as e:
            eprint(f"[context_manager] WARNING: Failed to read index, recreating: {e}")

    # Update context entry
    index["contexts"][context.id] = context.to_index_entry()
    index["updated_at"] = now_iso()

    # Write index
    content = json.dumps(index, indent=2, ensure_ascii=False)
    success, error = atomic_write(index_path, content)

    if not success:
        eprint(f"[context_manager] WARNING: Failed to write index cache: {error}")

    return success


def _remove_from_index_cache(context_id: str, project_root: Path = None) -> bool:
    """
    Remove context from main index.json.

    Args:
        context_id: Context identifier to remove
        project_root: Project root directory

    Returns:
        True if successful (or entry didn't exist)
    """
    index_path = get_index_path(project_root)

    if not index_path.exists():
        return True  # Nothing to remove

    try:
        index = json.loads(index_path.read_text(encoding='utf-8'))
    except Exception as e:
        eprint(f"[context_manager] WARNING: Failed to read index: {e}")
        return False

    # Remove entry if exists
    if context_id in index.get("contexts", {}):
        del index["contexts"][context_id]
        index["updated_at"] = now_iso()

        # Write index
        content = json.dumps(index, indent=2, ensure_ascii=False)
        success, error = atomic_write(index_path, content)

        if not success:
            eprint(f"[context_manager] WARNING: Failed to write index: {error}")
            return False

    return True


def _update_archive_index_cache(context: Context, project_root: Path = None) -> bool:
    """
    Add context to archive/index.json.

    Args:
        context: Context to add to archive index
        project_root: Project root directory

    Returns:
        True if successful
    """
    archive_dir = get_archive_dir(project_root)
    archive_index_path = get_archive_index_path(project_root)

    # Create archive dir if needed
    archive_dir.mkdir(parents=True, exist_ok=True)

    # Load existing archive index or create new
    archive_index = {"version": "2.0", "updated_at": now_iso(), "contexts": {}}

    if archive_index_path.exists():
        try:
            archive_index = json.loads(archive_index_path.read_text(encoding='utf-8'))
        except Exception as e:
            eprint(f"[context_manager] WARNING: Failed to read archive index, recreating: {e}")

    # Add context entry
    archive_index["contexts"][context.id] = context.to_index_entry()
    archive_index["updated_at"] = now_iso()

    # Write archive index
    content = json.dumps(archive_index, indent=2, ensure_ascii=False)
    success, error = atomic_write(archive_index_path, content)

    if not success:
        eprint(f"[context_manager] WARNING: Failed to write archive index: {error}")

    return success


def _remove_from_archive_index_cache(context_id: str, project_root: Path = None) -> bool:
    """
    Remove context from archive/index.json.

    Args:
        context_id: Context identifier to remove
        project_root: Project root directory

    Returns:
        True if successful (or entry didn't exist)
    """
    archive_index_path = get_archive_index_path(project_root)

    if not archive_index_path.exists():
        return True  # Nothing to remove

    try:
        archive_index = json.loads(archive_index_path.read_text(encoding='utf-8'))
    except Exception as e:
        eprint(f"[context_manager] WARNING: Failed to read archive index: {e}")
        return False

    # Remove entry if exists
    if context_id in archive_index.get("contexts", {}):
        del archive_index["contexts"][context_id]
        archive_index["updated_at"] = now_iso()

        # Write archive index
        content = json.dumps(archive_index, indent=2, ensure_ascii=False)
        success, error = atomic_write(archive_index_path, content)

        if not success:
            eprint(f"[context_manager] WARNING: Failed to write archive index: {error}")
            return False

    return True


def archive_context(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Move completed context to archive.

    1. Verify context exists and is completed
    2. Move folder to archive location
    3. Update context.folder to new path
    4. Append context_archived event
    5. Remove from main index
    6. Add to archive index

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Archived Context or None if archiving failed
    """
    # Get context (try active location first)
    context = get_context(context_id, project_root)
    if not context:
        eprint(f"[context_manager] Cannot archive: context '{context_id}' not found")
        return None

    if context.status != "completed":
        eprint(f"[context_manager] Cannot archive: context '{context_id}' not completed")
        return None

    # Get source and destination paths
    source_dir = get_context_dir(context_id, project_root)
    archive_dest = get_archive_context_dir(context_id, project_root)

    # Check if already archived
    if archive_dest.exists():
        eprint(f"[context_manager] Cannot archive: archive folder already exists for '{context_id}'")
        return None

    # Create archive parent directory
    archive_dest.parent.mkdir(parents=True, exist_ok=True)

    # Move folder to archive
    try:
        shutil.move(str(source_dir), str(archive_dest))
    except Exception as e:
        eprint(f"[context_manager] ERROR: Failed to move context to archive: {e}")
        return None

    # Update context folder path
    context.folder = str(archive_dest)

    # Append context_archived event (to the new location)
    append_event(
        context_id,
        EVENT_CONTEXT_ARCHIVED,
        project_root,
        archived_from=str(source_dir),
        archived_to=str(archive_dest)
    )

    # Update cache in new location
    _write_context_cache(context, project_root)

    # Remove from main index, add to archive index
    _remove_from_index_cache(context_id, project_root)
    _update_archive_index_cache(context, project_root)

    eprint(f"[context_manager] Archived context: {context_id}")
    return context


def _load_context_from_cache(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Load context from context.json cache file.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Context or None if not found
    """
    context_file = get_context_file_path(context_id, project_root)

    if not context_file.exists():
        return None

    try:
        data = json.loads(context_file.read_text(encoding='utf-8'))
        in_flight_data = data.get("in_flight", {})
        return Context(
            id=data["id"],
            status=data.get("status", "active"),
            summary=data.get("summary", ""),
            method=data.get("method"),
            tags=data.get("tags", []),
            created_at=data.get("created_at"),
            last_active=data.get("last_active"),
            folder=str(get_context_dir(context_id, project_root)),
            in_flight=InFlightState(
                mode=in_flight_data.get("mode", "none"),
                artifact_path=in_flight_data.get("artifact_path"),
                artifact_hash=in_flight_data.get("artifact_hash"),
                started_at=in_flight_data.get("started_at"),
                session_ids=in_flight_data.get("session_ids") or (
                    [in_flight_data["session_id"]] if in_flight_data.get("session_id") else None
                ),  # Migrate from old session_id to session_ids
                handoff_path=in_flight_data.get("handoff_path"),
            )
        )
    except Exception as e:
        eprint(f"[context_manager] WARNING: Failed to load context cache: {e}")
        return None


def create_context(
    context_id: Optional[str],
    summary: str,
    method: Optional[str] = None,
    tags: Optional[List[str]] = None,
    project_root: Path = None
) -> Context:
    """
    Create a new context.

    Actions:
    1. Validate/generate context ID
    2. Create folder: _output/contexts/{context_id}/
    3. Append context_created event to events.jsonl
    4. Write context.json cache
    5. Update index.json cache

    Args:
        context_id: Optional context ID (generated from summary if not provided)
        summary: Context summary/description
        method: Optional method that created this context (e.g., "cc-native")
        tags: Optional list of tags
        project_root: Project root directory

    Returns:
        Created Context object

    Raises:
        ValueError: If context already exists
    """
    # Generate context ID if not provided
    if not context_id:
        existing_ids = set()
        contexts_dir = get_contexts_dir(project_root)
        if contexts_dir.exists():
            existing_ids = {d.name for d in contexts_dir.iterdir() if d.is_dir()}
        context_id = generate_context_id(summary, existing_ids)

    # Validate context ID
    context_id = validate_context_id(context_id)

    # Check if context already exists
    context_dir = get_context_dir(context_id, project_root)
    if context_dir.exists():
        raise ValueError(f"Context '{context_id}' already exists")

    # Create directory
    context_dir.mkdir(parents=True, exist_ok=True)

    # Create context object
    now = now_iso()
    context = Context(
        id=context_id,
        status="active",
        summary=summary,
        method=method,
        tags=tags or [],
        created_at=now,
        last_active=now,
        folder=str(context_dir),
        in_flight=InFlightState()
    )

    # Append creation event (source of truth)
    append_event(
        context_id,
        EVENT_CONTEXT_CREATED,
        project_root,
        summary=summary,
        method=method,
        tags=tags or []
    )

    # Write cache files
    _write_context_cache(context, project_root)
    _update_index_cache(context, project_root)

    eprint(f"[context_manager] Created context: {context_id}")
    return context


def get_context(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Get a single context by ID.

    Reads from cache file (context.json) for performance.
    Falls back to rebuilding from events if cache is missing.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Context or None if not found
    """
    try:
        context_id = validate_context_id(context_id)
    except ValueError:
        return None

    # Try cache first
    context = _load_context_from_cache(context_id, project_root)
    if context:
        return context

    # Check if events file exists (context exists but cache is missing)
    events_path = get_events_file_path(context_id, project_root)
    if not events_path.exists():
        return None

    # Rebuild from events
    from .cache import rebuild_context_from_events
    context_dir = get_context_dir(context_id, project_root)
    context = rebuild_context_from_events(context_dir)

    if context:
        # Restore cache
        _write_context_cache(context, project_root)
        _update_index_cache(context, project_root)

    return context


def get_all_contexts(
    method: Optional[str] = None,
    status: Optional[str] = None,
    project_root: Path = None
) -> List[Context]:
    """
    Get all contexts, optionally filtered.

    Reads from index.json cache for performance.

    Args:
        method: Filter by method (e.g., "cc-native")
        status: Filter by status ("active" or "completed")
        project_root: Project root directory

    Returns:
        List of Context objects, sorted by last_active (most recent first)
    """
    contexts = []
    contexts_dir = get_contexts_dir(project_root)

    if not contexts_dir.exists():
        return []

    # Read from index cache if available
    index_path = get_index_path(project_root)
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text(encoding='utf-8'))

            # Validate contexts is a dict before iterating
            contexts_data = index.get("contexts", {})
            if not isinstance(contexts_data, dict):
                eprint(f"[context_manager] WARNING: index['contexts'] is not a dict (type: {type(contexts_data).__name__}), treating as empty")
                contexts_data = {}

            for ctx_id, entry in contexts_data.items():
                # Apply filters
                if status and entry.get("status") != status:
                    continue
                if method and entry.get("method") != method:
                    continue

                # Load full context
                context = get_context(ctx_id, project_root)
                if context:
                    contexts.append(context)

        except Exception as e:
            eprint(f"[context_manager] WARNING: Index read failed, scanning folders: {e}")
            # Fall through to folder scan

    # Fallback: scan context folders if index failed or is missing
    if not contexts:
        for ctx_dir in contexts_dir.iterdir():
            if not ctx_dir.is_dir():
                continue

            context = get_context(ctx_dir.name, project_root)
            if not context:
                continue

            # Apply filters
            if status and context.status != status:
                continue
            if method and context.method != method:
                continue

            contexts.append(context)

    # Sort by last_active (most recent first)
    contexts.sort(key=lambda c: c.last_active or "", reverse=True)

    return contexts


def update_context(
    context_id: str,
    project_root: Path = None,
    **updates
) -> Optional[Context]:
    """
    Update context metadata.

    Allowed updates: summary, tags, method

    Args:
        context_id: Context identifier
        project_root: Project root directory
        **updates: Fields to update

    Returns:
        Updated Context or None if not found
    """
    context = get_context(context_id, project_root)
    if not context:
        return None

    # Filter to allowed update fields
    allowed = {"summary", "tags", "method"}
    event_updates = {k: v for k, v in updates.items() if k in allowed and v is not None}

    if not event_updates:
        return context  # No valid updates

    # Apply updates
    if "summary" in event_updates:
        context.summary = event_updates["summary"]
    if "tags" in event_updates:
        context.tags = event_updates["tags"]
    if "method" in event_updates:
        context.method = event_updates["method"]

    context.last_active = now_iso()

    # Append event
    append_event(context_id, EVENT_METADATA_UPDATED, project_root, **event_updates)

    # Update caches
    _write_context_cache(context, project_root)
    _update_index_cache(context, project_root)

    return context


def complete_context(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Mark a context as completed and archive it.

    User-driven completion - AI should not auto-complete.
    After marking completed, automatically archives to _output/contexts/archive/.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Updated Context or None if not found
    """
    context = get_context(context_id, project_root)
    if not context:
        return None

    if context.status == "completed":
        eprint(f"[context_manager] Context '{context_id}' already completed")
        return context

    context.status = "completed"
    context.last_active = now_iso()

    # Append event
    append_event(context_id, EVENT_CONTEXT_COMPLETED, project_root)

    # Update caches
    _write_context_cache(context, project_root)
    _update_index_cache(context, project_root)

    eprint(f"[context_manager] Completed context: {context_id}")

    # Archive the completed context
    archived = archive_context(context_id, project_root)
    return archived if archived else context


def reopen_context(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Reopen a completed context.

    Rare operation - usually for fixing mistakes.
    If context is archived, moves it back from archive to active location.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Updated Context or None if not found
    """
    # First try to get from active location
    context = get_context(context_id, project_root)

    # If not found, check archive
    if not context:
        context = _get_archived_context(context_id, project_root)
        if context:
            # Restore from archive
            context = _restore_from_archive(context_id, project_root)
            if not context:
                return None

    if not context:
        return None

    if context.status == "active":
        eprint(f"[context_manager] Context '{context_id}' already active")
        return context

    context.status = "active"
    context.last_active = now_iso()

    # Append event
    append_event(context_id, EVENT_CONTEXT_REOPENED, project_root)

    # Update caches
    _write_context_cache(context, project_root)
    _update_index_cache(context, project_root)

    eprint(f"[context_manager] Reopened context: {context_id}")
    return context


def _get_archived_context(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Load context from archive location.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Context or None if not found in archive
    """
    archive_dir = get_archive_context_dir(context_id, project_root)
    context_file = archive_dir / "context.json"

    if not context_file.exists():
        return None

    try:
        data = json.loads(context_file.read_text(encoding='utf-8'))
        in_flight_data = data.get("in_flight", {})
        return Context(
            id=data["id"],
            status=data.get("status", "completed"),
            summary=data.get("summary", ""),
            method=data.get("method"),
            tags=data.get("tags", []),
            created_at=data.get("created_at"),
            last_active=data.get("last_active"),
            folder=str(archive_dir),
            in_flight=InFlightState(
                mode=in_flight_data.get("mode", "none"),
                artifact_path=in_flight_data.get("artifact_path"),
                artifact_hash=in_flight_data.get("artifact_hash"),
                started_at=in_flight_data.get("started_at"),
                session_ids=in_flight_data.get("session_ids"),
                handoff_path=in_flight_data.get("handoff_path"),
            )
        )
    except Exception as e:
        eprint(f"[context_manager] WARNING: Failed to load archived context: {e}")
        return None


def _restore_from_archive(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Move context from archive back to active location.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Restored Context or None if restore failed
    """
    archive_dir = get_archive_context_dir(context_id, project_root)
    active_dir = get_context_dir(context_id, project_root)

    if not archive_dir.exists():
        eprint(f"[context_manager] Cannot restore: archive folder not found for '{context_id}'")
        return None

    if active_dir.exists():
        eprint(f"[context_manager] Cannot restore: active folder already exists for '{context_id}'")
        return None

    # Move folder back to active location
    try:
        shutil.move(str(archive_dir), str(active_dir))
    except Exception as e:
        eprint(f"[context_manager] ERROR: Failed to restore context from archive: {e}")
        return None

    # Load context from new location
    context = _load_context_from_cache(context_id, project_root)
    if context:
        context.folder = str(active_dir)

        # Remove from archive index
        _remove_from_archive_index_cache(context_id, project_root)

    eprint(f"[context_manager] Restored context from archive: {context_id}")
    return context


def update_plan_status(
    context_id: str,
    status: str,
    path: Optional[str] = None,
    hash: Optional[str] = None,
    project_root: Path = None
) -> Optional[Context]:
    """
    Update plan status in context's in_flight state.

    Called by:
    - archive_plan hook: status="pending_implementation"
    - SessionStart hook: status="implementing"
    - Plan completion: status="none"

    Args:
        context_id: Context identifier
        status: Plan status (none, planning, pending_implementation, implementing)
        path: Path to plan file (for pending_implementation)
        hash: Plan content hash (for pending_implementation)
        project_root: Project root directory

    Returns:
        Updated Context or None if not found
    """
    context = get_context(context_id, project_root)
    if not context:
        return None

    now = now_iso()

    # Update in_flight state
    context.in_flight.mode = status
    if status == "planning":
        context.in_flight.started_at = now
        # Append event
        append_event(context_id, EVENT_PLANNING_STARTED, project_root)

    elif status == "pending_implementation":
        context.in_flight.artifact_path = path
        context.in_flight.artifact_hash = hash
        context.in_flight.started_at = now

        # Append event
        append_event(
            context_id,
            EVENT_PLAN_CREATED,
            project_root,
            path=path,
            hash=hash
        )

    elif status == "implementing":
        # Append event
        append_event(context_id, EVENT_PLAN_IMPLEMENTATION_STARTED, project_root)

    elif status == "none":
        context.in_flight.artifact_path = None
        context.in_flight.artifact_hash = None
        context.in_flight.started_at = None

        # Append event
        append_event(context_id, EVENT_PLAN_COMPLETED, project_root)

    context.last_active = now

    # Update caches
    _write_context_cache(context, project_root)
    _update_index_cache(context, project_root)

    return context


def get_context_with_pending_plan(project_root: Path = None) -> Optional[Context]:
    """
    Find context with plan.status = "pending_implementation".

    Used by SessionStart to detect plan handoff scenario.

    Args:
        project_root: Project root directory

    Returns:
        Context with pending plan, or None if not found
    """
    contexts = get_all_contexts(status="active", project_root=project_root)

    for context in contexts:
        if context.in_flight and context.in_flight.mode == "pending_implementation":
            return context

    return None


def get_context_with_in_flight_work(project_root: Path = None) -> Optional[Context]:
    """
    Find context with any in-flight work (plan, handoff, etc.).

    Used by SessionStart to detect if continuation is needed.

    Args:
        project_root: Project root directory

    Returns:
        Context with in-flight work, or None if not found
    """
    contexts = get_all_contexts(status="active", project_root=project_root)

    for context in contexts:
        if context.in_flight and context.in_flight.mode != "none":
            return context

    return None


def update_handoff_status(
    context_id: str,
    handoff_path: str,
    project_root: Path = None
) -> Optional[Context]:
    """
    Update context to indicate a handoff is pending.

    Called by handoff document generator after creating handoff document.
    Sets in_flight.mode = "handoff_pending" and in_flight.handoff_path.

    Args:
        context_id: Context identifier
        handoff_path: Path to the handoff document
        project_root: Project root directory

    Returns:
        Updated Context or None if not found
    """
    context = get_context(context_id, project_root)
    if not context:
        return None

    now = now_iso()

    # Update in_flight state
    context.in_flight.mode = "handoff_pending"
    context.in_flight.handoff_path = handoff_path
    context.in_flight.started_at = now
    context.last_active = now

    # Append event (source of truth) - MUST happen before cache updates
    append_event(
        context_id,
        EVENT_HANDOFF_CREATED,
        project_root,
        path=handoff_path
    )

    # Update caches
    _write_context_cache(context, project_root)
    _update_index_cache(context, project_root)

    eprint(f"[context_manager] Set handoff pending for: {context_id}")
    return context


def clear_handoff_status(context_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Clear handoff pending status after resumption.

    Called by SessionStart after successfully resuming from handoff.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Updated Context or None if not found
    """
    context = get_context(context_id, project_root)
    if not context:
        return None

    if context.in_flight.mode != "handoff_pending":
        return context  # Nothing to clear

    now = now_iso()

    # Clear handoff state but preserve any artifact path (plan being implemented)
    # If artifact_path exists, restore to "implementing" mode; otherwise "none"
    if context.in_flight.artifact_path:
        context.in_flight.mode = "implementing"
    else:
        context.in_flight.mode = "none"
    context.in_flight.handoff_path = None
    # Don't clear started_at if we're still implementing
    if not context.in_flight.artifact_path:
        context.in_flight.started_at = None
    context.last_active = now

    # Append event (source of truth) - MUST happen before cache updates
    append_event(
        context_id,
        EVENT_HANDOFF_CLEARED,
        project_root,
        restored_mode=context.in_flight.mode
    )

    # Update caches
    _write_context_cache(context, project_root)
    _update_index_cache(context, project_root)

    eprint(f"[context_manager] Cleared handoff status for: {context_id}")
    return context


def get_context_with_handoff_pending(project_root: Path = None) -> Optional[Context]:
    """
    Find context with handoff pending (highest priority for SessionStart).

    Args:
        project_root: Project root directory

    Returns:
        Context with handoff pending, or None if not found
    """
    contexts = get_all_contexts(status="active", project_root=project_root)

    for context in contexts:
        if context.in_flight and context.in_flight.mode == "handoff_pending":
            return context

    return None


def get_all_in_flight_contexts(project_root: Path = None) -> List[Context]:
    """
    Return all contexts with truly in-flight work requiring attention.

    In-flight modes (require continuation/action):
    - planning: Active planning session
    - pending_implementation: Plan created, awaiting implementation
    - handoff_pending: Handoff document created, awaiting pickup

    NOT in-flight (normal working state):
    - implementing: Active work, but doesn't block new context creation
    - none: No active work

    Used by context enforcer to determine auto-selection behavior:
    - 0 in-flight: auto-create new context
    - 1 in-flight: auto-select that context
    - Multiple: show picker

    Args:
        project_root: Project root directory

    Returns:
        List of contexts with in-flight work requiring attention
    """
    IN_FLIGHT_MODES = {"planning", "pending_implementation", "handoff_pending"}
    contexts = get_all_contexts(status="active", project_root=project_root)
    return [c for c in contexts if c.in_flight and c.in_flight.mode in IN_FLIGHT_MODES]


def get_context_by_session_id(session_id: str, project_root: Path = None) -> Optional[Context]:
    """
    Find context that contains this session_id in its session_ids list.

    Used by context enforcer to detect if current session already belongs
    to a context (session continuity across /clear).

    Args:
        session_id: Session ID to search for
        project_root: Project root directory

    Returns:
        Context containing this session_id, or None if not found
    """
    if not session_id or session_id == "unknown":
        return None

    contexts = get_all_contexts(status="active", project_root=project_root)

    for context in contexts:
        if context.in_flight and context.in_flight.session_ids:
            if session_id in context.in_flight.session_ids:
                return context

    return None


def create_context_from_prompt(user_prompt: str, project_root: Path = None) -> Context:
    """
    Auto-create a context from the user's prompt.

    Used by the context enforcer hook when no context exists.
    Creates a context with the prompt as summary (truncated to 100 chars).

    Args:
        user_prompt: The user's prompt text
        project_root: Project root directory

    Returns:
        Newly created Context object
    """
    # Truncate prompt to first 100 chars for summary
    summary = user_prompt.strip()[:100]
    if len(user_prompt.strip()) > 100:
        summary += "..."

    return create_context(
        context_id=None,  # Auto-generate from summary
        summary=summary,
        method="auto-created",
        tags=["auto-created"],
        project_root=project_root
    )


def update_context_session_id(
    context_id: str,
    session_id: str,
    project_root: Path = None
) -> Optional[Context]:
    """
    Update only the session_id in context's in_flight state.

    Args:
        context_id: Context identifier
        session_id: Session ID to store
        project_root: Project root directory

    Returns:
        Updated Context or None if not found
    """
    context = get_context(context_id, project_root)
    if not context:
        return None

    # Update in_flight.session_ids (set-like behavior - no duplicates)
    if not context.in_flight:
        context.in_flight = InFlightState()
    if context.in_flight.session_ids is None:
        context.in_flight.session_ids = []
    if session_id not in context.in_flight.session_ids:
        context.in_flight.session_ids.append(session_id)

    # Write updated context
    context_file = get_context_file_path(context_id, project_root)
    content = json.dumps(context.to_dict(), indent=2, ensure_ascii=False)
    success, _ = atomic_write(context_file, content)

    return context if success else None
