"""Event log utilities for context management.

events.jsonl is the SOURCE OF TRUTH for each context.
All state is derived by replaying these events.

Event format (one JSON object per line):
{"event": "event_type", "timestamp": "ISO8601", ...event-specific fields}

Crash safety:
- Append-only file
- Each line is independent JSON
- Corrupted lines are skipped with warning
- Valid events before corruption are preserved
"""
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..base.atomic_write import atomic_append
from ..base.constants import get_events_file_path
from ..base.utils import eprint, now_iso


# Event type constants
EVENT_CONTEXT_CREATED = "context_created"
EVENT_CONTEXT_COMPLETED = "context_completed"
EVENT_CONTEXT_REOPENED = "context_reopened"
EVENT_CONTEXT_ARCHIVED = "context_archived"
EVENT_METADATA_UPDATED = "metadata_updated"
EVENT_TASK_ADDED = "task_added"
EVENT_TASK_STARTED = "task_started"
EVENT_TASK_COMPLETED = "task_completed"
EVENT_TASK_BLOCKED = "task_blocked"
EVENT_NOTE_ADDED = "note_added"
EVENT_SESSION_STARTED = "session_started"
EVENT_PLANNING_STARTED = "planning_started"
EVENT_PLAN_CREATED = "plan_created"
EVENT_PLAN_IMPLEMENTATION_STARTED = "plan_implementation_started"
EVENT_PLAN_COMPLETED = "plan_completed"
EVENT_HANDOFF_CREATED = "handoff_created"
EVENT_HANDOFF_CLEARED = "handoff_cleared"


@dataclass
class Task:
    """Task state derived from events."""
    id: str
    subject: str
    description: str = ""
    active_form: str = ""
    status: str = "pending"  # pending, in_progress, completed, blocked
    evidence: str = ""
    work_summary: str = ""
    files_changed: List[str] = field(default_factory=list)
    blocked_reason: str = ""


@dataclass
class ContextState:
    """Current state of a context, derived from events."""
    id: str
    status: str = "active"  # active, completed
    summary: str = ""
    method: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    created_at: Optional[str] = None
    last_active: Optional[str] = None
    tasks: List[Task] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    plan_status: str = "none"  # none, planning, pending_implementation, implementing
    plan_path: Optional[str] = None
    plan_hash: Optional[str] = None


def read_events(context_id: str, project_root: Path = None) -> List[Dict[str, Any]]:
    """
    Read all events from a context's events.jsonl file.

    Handles corrupted lines gracefully by skipping them with a warning.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        List of event dictionaries, in chronological order
    """
    events_path = get_events_file_path(context_id, project_root)

    if not events_path.exists():
        return []

    events = []
    try:
        content = events_path.read_text(encoding='utf-8')
        for line_num, line in enumerate(content.splitlines(), 1):
            line = line.strip()
            if not line:
                continue

            try:
                event = json.loads(line)
                events.append(event)
            except json.JSONDecodeError:
                eprint(f"[event_log] WARNING: Skipping corrupted line {line_num} in {events_path}")

    except UnicodeDecodeError as e:
        eprint(f"[event_log] WARNING: Invalid UTF-8 in events file {events_path}, attempting fallback read")
        # Try reading with error handling to salvage what we can
        try:
            content = events_path.read_text(encoding='utf-8', errors='replace')
            for line_num, line in enumerate(content.splitlines(), 1):
                line = line.strip()
                if not line:
                    continue

                try:
                    event = json.loads(line)
                    events.append(event)
                except json.JSONDecodeError:
                    eprint(f"[event_log] WARNING: Skipping corrupted line {line_num} in {events_path}")
        except Exception as fallback_error:
            eprint(f"[event_log] ERROR: Fallback read failed: {fallback_error}")

    except Exception as e:
        eprint(f"[event_log] ERROR reading events file: {e}")

    return events


def append_event(
    context_id: str,
    event_type: str,
    project_root: Path = None,
    **event_data
) -> bool:
    """
    Append an event to a context's events.jsonl file.

    Args:
        context_id: Context identifier
        event_type: Type of event (e.g., "task_added", "context_completed")
        project_root: Project root directory (default: cwd)
        **event_data: Additional event-specific data

    Returns:
        True if event was successfully appended
    """
    events_path = get_events_file_path(context_id, project_root)

    event = {
        "event": event_type,
        "timestamp": now_iso(),
        **event_data
    }

    try:
        event_json = json.dumps(event, ensure_ascii=False)
        success, error = atomic_append(events_path, event_json + "\n")

        if not success:
            eprint(f"[event_log] ERROR appending event: {error}")
            return False

        return True

    except Exception as e:
        eprint(f"[event_log] ERROR serializing event: {e}")
        return False


def get_current_state(context_id: str, project_root: Path = None) -> ContextState:
    """
    Compute current context state by replaying events.

    This is the canonical way to determine current state -
    everything is derived from events.jsonl.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        ContextState representing current state
    """
    events = read_events(context_id, project_root)

    state = ContextState(id=context_id)
    tasks_map: Dict[str, Task] = {}

    for event in events:
        event_type = event.get("event")
        timestamp = event.get("timestamp")

        # Update last_active for any event
        state.last_active = timestamp

        if event_type == EVENT_CONTEXT_CREATED:
            state.summary = event.get("summary", "")
            state.method = event.get("method")
            state.tags = event.get("tags", [])
            state.created_at = timestamp

        elif event_type == EVENT_CONTEXT_COMPLETED:
            state.status = "completed"

        elif event_type == EVENT_CONTEXT_REOPENED:
            state.status = "active"

        elif event_type == EVENT_METADATA_UPDATED:
            if "summary" in event:
                state.summary = event["summary"]
            if "tags" in event:
                state.tags = event["tags"]
            if "method" in event:
                state.method = event["method"]

        elif event_type == EVENT_TASK_ADDED:
            task_id = event.get("task_id")
            if task_id:
                tasks_map[task_id] = Task(
                    id=task_id,
                    subject=event.get("subject", ""),
                    description=event.get("description", ""),
                    active_form=event.get("activeForm", ""),
                    status="pending"
                )

        elif event_type == EVENT_TASK_STARTED:
            task_id = event.get("task_id")
            if task_id and task_id in tasks_map:
                tasks_map[task_id].status = "in_progress"

        elif event_type == EVENT_TASK_COMPLETED:
            task_id = event.get("task_id")
            if task_id and task_id in tasks_map:
                task = tasks_map[task_id]
                task.status = "completed"
                task.evidence = event.get("evidence", "")
                task.work_summary = event.get("work_summary", "")
                task.files_changed = event.get("files_changed", [])

        elif event_type == EVENT_TASK_BLOCKED:
            task_id = event.get("task_id")
            if task_id and task_id in tasks_map:
                tasks_map[task_id].status = "blocked"
                tasks_map[task_id].blocked_reason = event.get("reason", "")

        elif event_type == EVENT_NOTE_ADDED:
            note = event.get("content", "")
            if note:
                state.notes.append(note)

        elif event_type == EVENT_PLAN_CREATED:
            state.plan_status = "pending_implementation"
            state.plan_path = event.get("path")
            state.plan_hash = event.get("hash")

        elif event_type == EVENT_PLAN_IMPLEMENTATION_STARTED:
            state.plan_status = "implementing"

        elif event_type == EVENT_PLAN_COMPLETED:
            state.plan_status = "none"
            state.plan_path = None
            state.plan_hash = None

    # Convert tasks map to list
    state.tasks = list(tasks_map.values())

    return state


def are_all_tasks_completed(context_id: str, project_root: Path = None) -> bool:
    """
    Check if all tasks in a context are completed.

    Useful for suggesting context completion to user.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        True if all tasks are completed (or no tasks exist)
    """
    state = get_current_state(context_id, project_root)

    if not state.tasks:
        return True  # No tasks = trivially complete

    return all(task.status == "completed" for task in state.tasks)


def get_pending_tasks(context_id: str, project_root: Path = None) -> List[Task]:
    """
    Get all non-completed tasks from a context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        List of tasks that are not completed
    """
    state = get_current_state(context_id, project_root)
    return [t for t in state.tasks if t.status != "completed"]
