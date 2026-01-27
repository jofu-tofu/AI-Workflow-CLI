"""Cache rebuild utilities for context management.

These functions allow recovery from corrupted cache files
by rebuilding from the source of truth (events.jsonl).

Data hierarchy:
  events.jsonl (source of truth)
    → context.json (L1 cache) - can be rebuilt
      → index.json (L2 cache) - can be rebuilt
"""
import json
from pathlib import Path
from typing import Any, Dict, Optional

from ..base.atomic_write import atomic_write
from ..base.constants import (
    get_contexts_dir,
    get_context_file_path,
    get_events_file_path,
    get_index_path,
    get_archive_dir,
    get_archive_index_path,
    ARCHIVE_DIR,
)
from ..base.utils import eprint, now_iso
from .event_log import read_events


def rebuild_context_from_events(context_dir: Path, project_root: Path = None) -> Optional['Context']:
    """
    Rebuild context.json by replaying events.jsonl.

    This is the recovery mechanism when context.json is
    corrupted or out of sync.

    Args:
        context_dir: Path to context directory
        project_root: Project root directory (if known, avoids fragile path calculation)

    Returns:
        Rebuilt Context object, or None if events file doesn't exist
    """
    # Import here to avoid circular dependency
    from .context_manager import Context, InFlightState

    events_path = context_dir / "events.jsonl"
    if not events_path.exists():
        return None

    context_id = context_dir.name

    # Calculate project_root if not provided
    # Structure: project_root/_output/contexts/{id}
    if project_root is None:
        # Traverse up: context_dir -> contexts -> _output -> project_root
        project_root = context_dir.parent.parent.parent

    events = read_events(context_id, project_root)

    if not events:
        return None

    # Initialize context with defaults
    context = Context(
        id=context_id,
        status="active",
        folder=str(context_dir),
        in_flight=InFlightState()
    )

    # Replay events to derive current state
    for event in events:
        event_type = event.get("event")
        timestamp = event.get("timestamp")

        # Update last_active for any event
        context.last_active = timestamp

        if event_type == "context_created":
            context.summary = event.get("summary", "")
            context.method = event.get("method")
            context.tags = event.get("tags", [])
            context.created_at = timestamp

        elif event_type == "context_completed":
            context.status = "completed"

        elif event_type == "context_reopened":
            context.status = "active"

        elif event_type == "metadata_updated":
            if "summary" in event:
                context.summary = event["summary"]
            if "tags" in event:
                context.tags = event["tags"]
            if "method" in event:
                context.method = event["method"]

        elif event_type == "planning_started":
            context.in_flight.mode = "planning"

        elif event_type == "plan_created":
            context.in_flight.mode = "pending_implementation"
            context.in_flight.artifact_path = event.get("path")
            context.in_flight.artifact_hash = event.get("hash")
            context.in_flight.started_at = timestamp

        elif event_type == "plan_implementation_started":
            context.in_flight.mode = "implementing"

        elif event_type == "plan_completed":
            context.in_flight.mode = "none"
            context.in_flight.artifact_path = None
            context.in_flight.artifact_hash = None
            context.in_flight.started_at = None

        elif event_type == "handoff_created":
            context.in_flight.mode = "handoff_pending"
            context.in_flight.handoff_path = event.get("path")

        elif event_type == "handoff_cleared":
            # Restore to "implementing" if artifact exists, otherwise "none"
            restored_mode = event.get("restored_mode", "none")
            context.in_flight.mode = restored_mode
            context.in_flight.handoff_path = None

    return context


def rebuild_index_from_folders(project_root: Path = None) -> Dict[str, Any]:
    """
    Rebuild index.json by scanning context folders.

    This is the recovery mechanism when index.json is
    corrupted or out of sync.

    Note: Skips the archive/ folder - archived contexts are not included
    in the main index.

    Args:
        project_root: Project root directory

    Returns:
        Rebuilt index dictionary
    """
    index = {
        "version": "2.0",
        "updated_at": now_iso(),
        "contexts": {}
    }

    contexts_dir = get_contexts_dir(project_root)
    if not contexts_dir.exists():
        return index

    for ctx_dir in contexts_dir.iterdir():
        if not ctx_dir.is_dir():
            continue

        # Skip archive folder - archived contexts have their own index
        if ctx_dir.name == ARCHIVE_DIR:
            continue

        # Try to read context.json first
        context_file = ctx_dir / "context.json"
        if context_file.exists():
            try:
                ctx_data = json.loads(context_file.read_text(encoding='utf-8'))
                in_flight = ctx_data.get("in_flight", {})
                index["contexts"][ctx_data["id"]] = {
                    "id": ctx_data["id"],
                    "status": ctx_data.get("status", "active"),
                    "method": ctx_data.get("method"),
                    "summary": ctx_data.get("summary", ""),
                    "created_at": ctx_data.get("created_at"),
                    "last_active": ctx_data.get("last_active"),
                    "folder": str(ctx_dir),
                    "in_flight_mode": in_flight.get("mode", "none")
                }
                continue
            except Exception as e:
                eprint(f"[cache] Failed to read {context_file}, rebuilding from events: {e}")

        # Fallback: rebuild from events
        context = rebuild_context_from_events(ctx_dir)
        if context:
            index["contexts"][context.id] = context.to_index_entry()

    return index


def rebuild_archive_index(project_root: Path = None) -> Dict[str, Any]:
    """
    Rebuild archive/index.json by scanning archive folder.

    This is the recovery mechanism when archive index is
    corrupted or out of sync.

    Args:
        project_root: Project root directory

    Returns:
        Rebuilt archive index dictionary
    """
    archive_index = {
        "version": "2.0",
        "updated_at": now_iso(),
        "contexts": {}
    }

    archive_dir = get_archive_dir(project_root)
    if not archive_dir.exists():
        return archive_index

    for ctx_dir in archive_dir.iterdir():
        if not ctx_dir.is_dir():
            continue

        # Skip index.json file itself
        if ctx_dir.name == "index.json":
            continue

        # Try to read context.json first
        context_file = ctx_dir / "context.json"
        if context_file.exists():
            try:
                ctx_data = json.loads(context_file.read_text(encoding='utf-8'))
                in_flight = ctx_data.get("in_flight", {})
                archive_index["contexts"][ctx_data["id"]] = {
                    "id": ctx_data["id"],
                    "status": ctx_data.get("status", "completed"),
                    "method": ctx_data.get("method"),
                    "summary": ctx_data.get("summary", ""),
                    "created_at": ctx_data.get("created_at"),
                    "last_active": ctx_data.get("last_active"),
                    "folder": str(ctx_dir),
                    "in_flight_mode": in_flight.get("mode", "none")
                }
                continue
            except Exception as e:
                eprint(f"[cache] Failed to read {context_file}, rebuilding from events: {e}")

        # Fallback: rebuild from events
        context = rebuild_context_from_events(ctx_dir)
        if context:
            archive_index["contexts"][context.id] = context.to_index_entry()

    return archive_index


def rebuild_all_caches(project_root: Path = None) -> bool:
    """
    Rebuild all cache files from events.jsonl files.

    Useful for recovery after corruption or version migration.
    Rebuilds both active context caches and archive index.

    Args:
        project_root: Project root directory

    Returns:
        True if all caches were rebuilt successfully
    """
    success = True
    contexts_dir = get_contexts_dir(project_root)

    if not contexts_dir.exists():
        eprint("[cache] No contexts directory found, nothing to rebuild")
        return True

    # Rebuild each active context's cache (skip archive folder)
    for ctx_dir in contexts_dir.iterdir():
        if not ctx_dir.is_dir():
            continue

        # Skip archive folder - handled separately
        if ctx_dir.name == ARCHIVE_DIR:
            continue

        events_path = ctx_dir / "events.jsonl"
        if not events_path.exists():
            continue

        eprint(f"[cache] Rebuilding context: {ctx_dir.name}")
        context = rebuild_context_from_events(ctx_dir)

        if context:
            context_file = ctx_dir / "context.json"
            content = json.dumps(context.to_dict(), indent=2, ensure_ascii=False)
            ok, error = atomic_write(context_file, content)
            if not ok:
                eprint(f"[cache] Failed to write {context_file}: {error}")
                success = False
        else:
            eprint(f"[cache] Failed to rebuild context: {ctx_dir.name}")
            success = False

    # Rebuild archived context caches
    archive_dir = get_archive_dir(project_root)
    if archive_dir.exists():
        for ctx_dir in archive_dir.iterdir():
            if not ctx_dir.is_dir():
                continue

            events_path = ctx_dir / "events.jsonl"
            if not events_path.exists():
                continue

            eprint(f"[cache] Rebuilding archived context: {ctx_dir.name}")
            context = rebuild_context_from_events(ctx_dir)

            if context:
                context_file = ctx_dir / "context.json"
                content = json.dumps(context.to_dict(), indent=2, ensure_ascii=False)
                ok, error = atomic_write(context_file, content)
                if not ok:
                    eprint(f"[cache] Failed to write {context_file}: {error}")
                    success = False
            else:
                eprint(f"[cache] Failed to rebuild archived context: {ctx_dir.name}")
                success = False

    # Rebuild global index
    eprint("[cache] Rebuilding global index")
    index = rebuild_index_from_folders(project_root)
    index_path = get_index_path(project_root)

    content = json.dumps(index, indent=2, ensure_ascii=False)
    ok, error = atomic_write(index_path, content)
    if not ok:
        eprint(f"[cache] Failed to write index: {error}")
        success = False

    # Rebuild archive index
    eprint("[cache] Rebuilding archive index")
    archive_index = rebuild_archive_index(project_root)
    archive_index_path = get_archive_index_path(project_root)

    if archive_index["contexts"]:  # Only write if there are archived contexts
        content = json.dumps(archive_index, indent=2, ensure_ascii=False)
        ok, error = atomic_write(archive_index_path, content)
        if not ok:
            eprint(f"[cache] Failed to write archive index: {error}")
            success = False

    total_contexts = len(index['contexts']) + len(archive_index['contexts'])
    eprint(f"[cache] Rebuild complete. {len(index['contexts'])} active, {len(archive_index['contexts'])} archived contexts indexed.")
    return success


def verify_cache_integrity(project_root: Path = None) -> Dict[str, Any]:
    """
    Verify integrity of cache files against events.

    Returns a report of any discrepancies found.

    Args:
        project_root: Project root directory

    Returns:
        Dictionary with verification results
    """
    report = {
        "ok": True,
        "issues": [],
        "contexts_checked": 0,
        "contexts_with_issues": 0
    }

    contexts_dir = get_contexts_dir(project_root)
    if not contexts_dir.exists():
        return report

    for ctx_dir in contexts_dir.iterdir():
        if not ctx_dir.is_dir():
            continue

        # Skip archive folder - archived contexts verified separately
        if ctx_dir.name == ARCHIVE_DIR:
            continue

        report["contexts_checked"] += 1
        context_id = ctx_dir.name

        # Check events.jsonl exists
        events_path = ctx_dir / "events.jsonl"
        if not events_path.exists():
            report["issues"].append({
                "context": context_id,
                "issue": "Missing events.jsonl (source of truth)",
                "severity": "critical"
            })
            report["contexts_with_issues"] += 1
            report["ok"] = False
            continue

        # Check context.json exists
        context_file = ctx_dir / "context.json"
        if not context_file.exists():
            report["issues"].append({
                "context": context_id,
                "issue": "Missing context.json (cache)",
                "severity": "warning",
                "action": "Run rebuild_all_caches()"
            })
            report["contexts_with_issues"] += 1
            continue

        # Compare cache with events-derived state
        try:
            cached = json.loads(context_file.read_text(encoding='utf-8'))
            derived = rebuild_context_from_events(ctx_dir)

            if derived:
                has_issue = False
                if cached.get("status") != derived.status:
                    report["issues"].append({
                        "context": context_id,
                        "issue": f"Status mismatch: cache={cached.get('status')}, events={derived.status}",
                        "severity": "warning"
                    })
                    has_issue = True

                cached_mode = cached.get("in_flight", {}).get("mode", "none")
                if cached_mode != derived.in_flight.mode:
                    report["issues"].append({
                        "context": context_id,
                        "issue": f"in_flight.mode mismatch: cache={cached_mode}, events={derived.in_flight.mode}",
                        "severity": "warning"
                    })
                    has_issue = True

                if has_issue:
                    report["contexts_with_issues"] += 1
                    report["ok"] = False

        except Exception as e:
            report["issues"].append({
                "context": context_id,
                "issue": f"Verification error: {e}",
                "severity": "error"
            })
            report["contexts_with_issues"] += 1
            report["ok"] = False

    return report
