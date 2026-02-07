"""Context store — 2-layer CRUD for context state management.

Replaces context_manager.py's 3-layer approach (events.jsonl + context.json + index.json)
with a simpler 2-layer model:

  state.json   (per context folder — SOURCE OF TRUTH)
  index.json   (at _output/ root — fast session->context lookup)

No event sourcing. No cache rebuilds. Direct read/write.
"""
import json
import shutil
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..base.atomic_write import atomic_write
from ..base.constants import (
    get_context_dir,
    get_contexts_dir,
    get_index_path,
    get_archive_dir,
    get_archive_context_dir,
    get_archive_index_path,
    validate_context_id,
)
from ..base.utils import eprint, now_iso, generate_context_id

# Mode mapping from old context_manager values to new values
_MODE_MIGRATION = {
    "none": "idle",
    "planning": "idle",               # Inferred at runtime, not stored
    "pending_implementation": "has_plan",
    "implementing": "active",
}

INDEX_VERSION = "3.0"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class ContextState:
    """Flat, self-contained state for one context.  Stored as state.json."""
    id: str
    status: str = "active"              # active | completed
    summary: str = ""
    method: str = ""                    # auto-created | caret_new
    tags: list = field(default_factory=list)
    created_at: str = ""
    last_active: str = ""
    mode: str = "idle"                  # idle | has_plan | active
    plan_path: str = None
    plan_hash: str = None               # Content hash for plan matching after /clear
    plan_signature: str = None          # First 200 chars for fallback matching
    handoff_path: str = None
    session_ids: list = field(default_factory=list)
    last_session: dict = None           # {session_id, git_branch, uncommitted_files, last_commit}
    tasks: list = field(default_factory=list)
    # Each task: {id, subject, status, description, active_form,
    #             created_at, completed_at, evidence, work_summary, files_changed}

    # -- serialisation helpers --

    def to_dict(self) -> Dict[str, Any]:
        """Serialise for state.json."""
        return {k: v for k, v in asdict(self).items() if v is not None}

    def to_index_entry(self) -> Dict[str, Any]:
        """Lightweight summary for the contexts section of index.json."""
        return {
            "summary": self.summary,
            "mode": self.mode,
            "last_active": self.last_active,
        }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _state_path(context_id: str, project_root: Path = None) -> Path:
    """Return path to _output/contexts/{context_id}/state.json."""
    return get_context_dir(context_id, project_root) / "state.json"


def _load_index(project_root: Path = None) -> Dict[str, Any]:
    """Load index.json or return a fresh skeleton."""
    index_path = get_index_path(project_root)
    if index_path.exists():
        try:
            return json.loads(index_path.read_text(encoding="utf-8"))
        except Exception as e:
            eprint(f"[context_store] WARNING: Failed to read index, recreating: {e}")
    return {"version": INDEX_VERSION, "updated_at": now_iso(), "sessions": {}, "contexts": {}}


def _save_index(index: Dict[str, Any], project_root: Path = None) -> bool:
    """Atomically write index.json."""
    index["updated_at"] = now_iso()
    content = json.dumps(index, indent=2, ensure_ascii=False)
    success, error = atomic_write(get_index_path(project_root), content)
    if not success:
        eprint(f"[context_store] WARNING: Failed to write index: {error}")
    return success


def _dict_to_state(data: Dict[str, Any]) -> ContextState:
    """Construct a ContextState from a dict, migrating old mode names."""
    mode = data.get("mode", "idle")
    mode = _MODE_MIGRATION.get(mode, mode)
    return ContextState(
        id=data["id"],
        status=data.get("status", "active"),
        summary=data.get("summary", ""),
        method=data.get("method", ""),
        tags=data.get("tags", []),
        created_at=data.get("created_at", ""),
        last_active=data.get("last_active", ""),
        mode=mode,
        plan_path=data.get("plan_path"),
        plan_hash=data.get("plan_hash"),
        plan_signature=data.get("plan_signature"),
        handoff_path=data.get("handoff_path"),
        session_ids=data.get("session_ids", []),
        last_session=data.get("last_session"),
        tasks=data.get("tasks", []),
    )


def _migrate_context_json(context_id: str, project_root: Path = None) -> Optional[ContextState]:
    """Backward compat: read legacy context.json and convert to ContextState."""
    legacy_path = get_context_dir(context_id, project_root) / "context.json"
    if not legacy_path.exists():
        return None
    try:
        data = json.loads(legacy_path.read_text(encoding="utf-8"))
        in_flight = data.get("in_flight", {})
        old_mode = in_flight.get("mode", "none")
        mode = _MODE_MIGRATION.get(old_mode, "idle")
        return ContextState(
            id=data.get("id", context_id),
            status=data.get("status", "active"),
            summary=data.get("summary", ""),
            method=data.get("method", ""),
            tags=data.get("tags", []),
            created_at=data.get("created_at", ""),
            last_active=data.get("last_active", ""),
            mode=mode,
            plan_path=in_flight.get("artifact_path"),
            plan_hash=in_flight.get("artifact_hash"),
            plan_signature=None,
            handoff_path=in_flight.get("handoff_path"),
            session_ids=in_flight.get("session_ids") or (
                [in_flight["session_id"]] if in_flight.get("session_id") else []
            ),
            last_session=None,
            tasks=[],
        )
    except Exception as e:
        eprint(f"[context_store] WARNING: Failed to migrate context.json for '{context_id}': {e}")
        return None


# ---------------------------------------------------------------------------
# Core CRUD
# ---------------------------------------------------------------------------

def load_state(context_id: str, project_root: Path = None) -> Optional[ContextState]:
    """Read state.json for a context.  Falls back to context.json for migration."""
    sp = _state_path(context_id, project_root)
    if sp.exists():
        try:
            data = json.loads(sp.read_text(encoding="utf-8"))
            return _dict_to_state(data)
        except Exception as e:
            eprint(f"[context_store] WARNING: Failed to read state.json for '{context_id}': {e}")
            return None

    # Backward compat: migrate from legacy context.json
    return _migrate_context_json(context_id, project_root)


def save_state(state: ContextState, project_root: Path = None) -> bool:
    """Atomically write state.json AND update index.json."""
    # 1. Write state.json
    sp = _state_path(state.id, project_root)
    sp.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(state.to_dict(), indent=2, ensure_ascii=False)
    success, error = atomic_write(sp, content)
    if not success:
        eprint(f"[context_store] WARNING: Failed to write state.json for '{state.id}': {error}")
        return False

    # 2. Update index.json
    index = _load_index(project_root)
    index["contexts"][state.id] = state.to_index_entry()
    # Keep session mappings in sync
    for sid in state.session_ids:
        index.setdefault("sessions", {})[sid] = state.id
    return _save_index(index, project_root)


def create_context(
    context_id: Optional[str],
    summary: str,
    method: str = "",
    tags: Optional[List[str]] = None,
    project_root: Path = None,
) -> ContextState:
    """Create a new context folder + state.json + index entry.

    Raises:
        ValueError: If context already exists.
    """
    # Generate ID if needed
    if not context_id:
        existing_ids = set()
        contexts_dir = get_contexts_dir(project_root)
        if contexts_dir.exists():
            existing_ids = {d.name for d in contexts_dir.iterdir() if d.is_dir()}
        context_id = generate_context_id(summary, existing_ids)

    context_id = validate_context_id(context_id)
    context_dir = get_context_dir(context_id, project_root)

    if context_dir.exists():
        raise ValueError(f"Context '{context_id}' already exists")

    context_dir.mkdir(parents=True, exist_ok=True)

    now = now_iso()
    state = ContextState(
        id=context_id,
        status="active",
        summary=summary,
        method=method,
        tags=tags or [],
        created_at=now,
        last_active=now,
    )
    save_state(state, project_root)
    eprint(f"[context_store] Created context: {context_id}")
    return state


def get_context(context_id: str, project_root: Path = None) -> Optional[ContextState]:
    """Load a single context by ID."""
    try:
        context_id = validate_context_id(context_id)
    except ValueError:
        return None
    return load_state(context_id, project_root)


def get_all_contexts(
    status: Optional[str] = None,
    project_root: Path = None,
) -> List[ContextState]:
    """List contexts from index.json, loading each state.json.

    Falls back to scanning context folders if the index is missing or corrupt.
    Results are sorted by last_active descending (most recent first).
    """
    results: List[ContextState] = []
    contexts_dir = get_contexts_dir(project_root)
    if not contexts_dir.exists():
        return []

    # Try index-driven path first
    index = _load_index(project_root)
    ctx_map = index.get("contexts", {})

    if isinstance(ctx_map, dict) and ctx_map:
        for cid, entry in ctx_map.items():
            if status and entry.get("status") and entry["status"] != status:
                # Index may not store status; always load for definitive check
                pass
            state = load_state(cid, project_root)
            if state and (not status or state.status == status):
                results.append(state)
    else:
        # Fallback: scan folders
        for ctx_dir in contexts_dir.iterdir():
            if not ctx_dir.is_dir() or ctx_dir.name.startswith("_"):
                continue
            state = load_state(ctx_dir.name, project_root)
            if state and (not status or state.status == status):
                results.append(state)

    results.sort(key=lambda s: s.last_active or "", reverse=True)
    return results


def update_context(
    context_id: str,
    project_root: Path = None,
    **updates,
) -> Optional[ContextState]:
    """Update allowed metadata fields (summary, tags, method) on a context."""
    state = get_context(context_id, project_root)
    if not state:
        return None

    allowed = {"summary", "tags", "method"}
    changed = False
    for key, value in updates.items():
        if key in allowed and value is not None:
            setattr(state, key, value)
            changed = True

    if not changed:
        return state

    state.last_active = now_iso()
    save_state(state, project_root)
    return state


def complete_context(context_id: str, project_root: Path = None) -> Optional[ContextState]:
    """Mark context completed and archive it."""
    state = get_context(context_id, project_root)
    if not state:
        return None

    if state.status == "completed":
        eprint(f"[context_store] Context '{context_id}' already completed")
        return state

    state.status = "completed"
    state.last_active = now_iso()
    save_state(state, project_root)
    eprint(f"[context_store] Completed context: {context_id}")

    archived = archive_context(context_id, project_root)
    return archived if archived else state


def archive_context(context_id: str, project_root: Path = None) -> Optional[ContextState]:
    """Move completed context folder to _archive/, update indices."""
    state = get_context(context_id, project_root)
    if not state:
        eprint(f"[context_store] Cannot archive: context '{context_id}' not found")
        return None
    if state.status != "completed":
        eprint(f"[context_store] Cannot archive: context '{context_id}' not completed")
        return None

    source_dir = get_context_dir(context_id, project_root)
    archive_dest = get_archive_context_dir(context_id, project_root)

    if archive_dest.exists():
        eprint(f"[context_store] Cannot archive: archive folder already exists for '{context_id}'")
        return None

    archive_dest.parent.mkdir(parents=True, exist_ok=True)

    try:
        shutil.move(str(source_dir), str(archive_dest))
    except Exception as e:
        eprint(f"[context_store] ERROR: Failed to move context to archive: {e}")
        return None

    # Remove from main index (entry + session mappings)
    index = _load_index(project_root)
    index.get("contexts", {}).pop(context_id, None)
    sessions = index.get("sessions", {})
    stale_sids = [sid for sid, cid in sessions.items() if cid == context_id]
    for sid in stale_sids:
        del sessions[sid]
    _save_index(index, project_root)

    # Add to archive index
    _update_archive_index(state, project_root)

    eprint(f"[context_store] Archived context: {context_id}")
    return state


def reopen_context(context_id: str, project_root: Path = None) -> Optional[ContextState]:
    """Reopen a completed/archived context."""
    # Try active location first
    state = get_context(context_id, project_root)

    # If not found, check archive and restore
    if not state:
        state = _restore_from_archive(context_id, project_root)
    if not state:
        return None

    if state.status == "active":
        eprint(f"[context_store] Context '{context_id}' already active")
        return state

    state.status = "active"
    state.last_active = now_iso()
    save_state(state, project_root)
    eprint(f"[context_store] Reopened context: {context_id}")
    return state


# ---------------------------------------------------------------------------
# Session binding & mode updates
# ---------------------------------------------------------------------------

def get_context_by_session_id(
    session_id: str,
    project_root: Path = None,
) -> Optional[ContextState]:
    """O(1) lookup: check index.json sessions map first."""
    if not session_id or session_id == "unknown":
        return None

    index = _load_index(project_root)
    cid = index.get("sessions", {}).get(session_id)
    if cid:
        return load_state(cid, project_root)

    # Fallback: scan all contexts (handles un-indexed sessions)
    for state in get_all_contexts(status="active", project_root=project_root):
        if session_id in state.session_ids:
            return state
    return None


def bind_session(
    context_id: str,
    session_id: str,
    project_root: Path = None,
) -> bool:
    """Add session_id to both index.json sessions map and state.json session_ids."""
    if not session_id or session_id == "unknown":
        return False

    state = get_context(context_id, project_root)
    if not state:
        return False

    # Update state.json session_ids (set-like, no dupes)
    if session_id not in state.session_ids:
        state.session_ids.append(session_id)
    state.last_active = now_iso()

    return save_state(state, project_root)


def update_mode(
    context_id: str,
    mode: str,
    project_root: Path = None,
    plan_path: str = None,
    plan_hash: str = None,
    plan_signature: str = None,
) -> Optional[ContextState]:
    """Change the mode field (idle | has_plan | active), optionally setting plan fields."""
    state = get_context(context_id, project_root)
    if not state:
        return None

    state.mode = mode
    state.last_active = now_iso()

    if plan_path is not None:
        state.plan_path = plan_path
    if plan_hash is not None:
        state.plan_hash = plan_hash
    if plan_signature is not None:
        state.plan_signature = plan_signature

    # Clear plan fields when returning to idle
    if mode == "idle":
        state.plan_path = None
        state.plan_hash = None
        state.plan_signature = None

    save_state(state, project_root)
    return state


# ---------------------------------------------------------------------------
# Auto-creation from prompt
# ---------------------------------------------------------------------------

def create_context_from_prompt(
    user_prompt: str,
    project_root: Path = None,
) -> ContextState:
    """Auto-create a context from the user's prompt with an AI-generated slug."""
    summary = user_prompt.strip()[:2000]
    if len(user_prompt.strip()) > 2000:
        summary += "..."

    return create_context(
        context_id=None,
        summary=summary,
        method="auto-created",
        tags=["auto-created"],
        project_root=project_root,
    )


# ---------------------------------------------------------------------------
# Archive helpers
# ---------------------------------------------------------------------------

def _update_archive_index(state: ContextState, project_root: Path = None) -> bool:
    """Add context to archive/index.json."""
    archive_dir = get_archive_dir(project_root)
    archive_index_path = get_archive_index_path(project_root)
    archive_dir.mkdir(parents=True, exist_ok=True)

    archive_index = {"version": INDEX_VERSION, "updated_at": now_iso(), "contexts": {}}
    if archive_index_path.exists():
        try:
            archive_index = json.loads(archive_index_path.read_text(encoding="utf-8"))
        except Exception as e:
            eprint(f"[context_store] WARNING: Failed to read archive index, recreating: {e}")

    archive_index["contexts"][state.id] = state.to_index_entry()
    archive_index["updated_at"] = now_iso()

    content = json.dumps(archive_index, indent=2, ensure_ascii=False)
    success, error = atomic_write(archive_index_path, content)
    if not success:
        eprint(f"[context_store] WARNING: Failed to write archive index: {error}")
    return success


def _restore_from_archive(context_id: str, project_root: Path = None) -> Optional[ContextState]:
    """Move context from archive back to active location and return its state."""
    archive_dir = get_archive_context_dir(context_id, project_root)
    active_dir = get_context_dir(context_id, project_root)

    if not archive_dir.exists():
        return None
    if active_dir.exists():
        eprint(f"[context_store] Cannot restore: active folder already exists for '{context_id}'")
        return None

    try:
        shutil.move(str(archive_dir), str(active_dir))
    except Exception as e:
        eprint(f"[context_store] ERROR: Failed to restore context from archive: {e}")
        return None

    # Remove from archive index
    _remove_from_archive_index(context_id, project_root)

    state = load_state(context_id, project_root)
    eprint(f"[context_store] Restored context from archive: {context_id}")
    return state


def _remove_from_archive_index(context_id: str, project_root: Path = None) -> bool:
    """Remove context from archive/index.json."""
    archive_index_path = get_archive_index_path(project_root)
    if not archive_index_path.exists():
        return True

    try:
        archive_index = json.loads(archive_index_path.read_text(encoding="utf-8"))
    except Exception as e:
        eprint(f"[context_store] WARNING: Failed to read archive index: {e}")
        return False

    if context_id in archive_index.get("contexts", {}):
        del archive_index["contexts"][context_id]
        archive_index["updated_at"] = now_iso()
        content = json.dumps(archive_index, indent=2, ensure_ascii=False)
        success, error = atomic_write(archive_index_path, content)
        if not success:
            eprint(f"[context_store] WARNING: Failed to write archive index: {error}")
            return False
    return True
