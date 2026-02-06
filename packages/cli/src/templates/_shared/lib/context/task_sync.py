"""Task synchronization utilities for Claude native task integration.

Provides persistence for Claude Code native tasks:
- Claude Code native TaskCreate/TaskUpdate/TaskList tools (ephemeral)
- Persistent events.jsonl storage (source of truth)

DURING SESSION (Persist):
1. Claude uses native TaskCreate/TaskUpdate
2. PostToolUse hooks capture events to events.jsonl
3. Task state preserved for future reference

SESSION END:
- events.jsonl has complete task history
- Can be queried for context summaries
"""
from pathlib import Path
from typing import List, Optional

from .event_log import (
    get_current_state,
    get_pending_tasks,
    append_event,
    read_events,
    Task,
    EVENT_TASK_ADDED,
    EVENT_TASK_STARTED,
    EVENT_TASK_COMPLETED,
    EVENT_TASK_BLOCKED,
    EVENT_TASK_DELETED,
    EVENT_SESSION_STARTED,
    EVENT_SESSION_ENDED,
)
from ..base.utils import eprint


def generate_task_summary(context_id: str, project_root: Path = None) -> str:
    """
    Generate a session-aware summary of all tasks in a context.

    Includes session boundary awareness: tasks left in_progress when a session
    ended are marked as "interrupted" to distinguish from actively worked tasks.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Formatted task summary with session context
    """
    state = get_current_state(context_id, project_root)

    if not state.tasks:
        return "No tasks in this context."

    # Find the latest session_ended event to detect interrupted tasks
    events = read_events(context_id, project_root)
    interrupted_task_ids = set()
    for event in reversed(events):
        if event.get("event") == EVENT_SESSION_ENDED:
            interrupted_task_ids = set(event.get("active_tasks", []))
            break

    completed = [t for t in state.tasks if t.status == "completed"]
    interrupted = [t for t in state.tasks if t.status == "in_progress" and t.id in interrupted_task_ids]
    in_progress = [t for t in state.tasks if t.status == "in_progress" and t.id not in interrupted_task_ids]
    pending = [t for t in state.tasks if t.status == "pending"]
    blocked = [t for t in state.tasks if t.status == "blocked"]

    # Count sessions from session_ended events
    session_count = sum(1 for e in events if e.get("event") == EVENT_SESSION_ENDED)

    parts = []
    if completed:
        parts.append(f"{len(completed)} completed")
    if interrupted:
        parts.append(f"{len(interrupted)} interrupted")
    if in_progress:
        parts.append(f"{len(in_progress)} in progress")
    if pending:
        parts.append(f"{len(pending)} pending")
    if blocked:
        parts.append(f"{len(blocked)} blocked")

    session_info = f" across {session_count} session{'s' if session_count != 1 else ''}" if session_count > 0 else ""

    lines = [
        f"### Previous Work ({len(state.tasks)} tasks{session_info})",
        "",
    ]

    for t in completed:
        work_info = ""
        if t.work_summary:
            work_info = f"\n  Work: {t.work_summary}"
        lines.append(f"- [x] {t.id}: {t.subject}{work_info}")

    for t in interrupted:
        lines.append(f"- [~] {t.id}: {t.subject} (in progress when session ended)")

    for t in in_progress:
        lines.append(f"- [~] {t.id}: {t.subject}")

    for t in pending:
        lines.append(f"- [ ] {t.id}: {t.subject}")

    for t in blocked:
        lines.append(f"- [!] {t.id}: {t.subject}: {t.blocked_reason}")

    return "\n".join(lines)


def record_session_start(
    context_id: str,
    tasks_hydrated: Optional[List[str]] = None,
    project_root: Path = None
) -> bool:
    """
    Record a session_started event in the context's event log.

    Called after SessionStart hook loads a context.

    Args:
        context_id: Context identifier
        tasks_hydrated: List of task IDs that were restored
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    event_data = {}
    if tasks_hydrated:
        event_data["tasks_hydrated"] = tasks_hydrated

    return append_event(
        context_id,
        EVENT_SESSION_STARTED,
        project_root,
        **event_data
    )


def record_task_created(
    context_id: str,
    task_id: str,
    subject: str,
    description: str = "",
    active_form: str = "",
    session_id: str = "",
    project_root: Path = None
) -> bool:
    """
    Record a task_added event in the context's event log.

    Called when Claude creates a new task via TaskCreate.

    Args:
        context_id: Context identifier
        task_id: Persistent task ID (e.g., "aiw-1")
        subject: Task subject (required)
        description: Task description (optional)
        active_form: Spinner text for in_progress status (optional)
        session_id: Session ID where task was created (optional)
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    event_data = {
        "task_id": task_id,
        "subject": subject,
    }
    if description:
        event_data["description"] = description
    if active_form:
        event_data["activeForm"] = active_form
    if session_id:
        event_data["session_id"] = session_id

    return append_event(
        context_id,
        EVENT_TASK_ADDED,
        project_root,
        **event_data
    )


def record_task_started(
    context_id: str,
    task_id: str,
    session_id: str = "",
    project_root: Path = None
) -> bool:
    """
    Record a task_started event in the context's event log.

    Called when Claude starts working on a task.

    Args:
        context_id: Context identifier
        task_id: Persistent task ID
        session_id: Session ID where task was started (optional)
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    event_data = {"task_id": task_id}
    if session_id:
        event_data["session_id"] = session_id

    return append_event(
        context_id,
        EVENT_TASK_STARTED,
        project_root,
        **event_data
    )


def record_task_completed(
    context_id: str,
    task_id: str,
    evidence: str,
    work_summary: str = "",
    files_changed: Optional[List[str]] = None,
    commit_ref: str = "",
    session_id: str = "",
    project_root: Path = None
) -> bool:
    """
    Record a task_completed event in the context's event log.

    Called when Claude completes a task.

    Args:
        context_id: Context identifier
        task_id: Persistent task ID
        evidence: Verification evidence (required)
        work_summary: Summary of work done (optional)
        files_changed: List of files modified (optional)
        commit_ref: Git commit reference (optional)
        session_id: Session ID where task was completed (optional)
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    event_data = {
        "task_id": task_id,
        "evidence": evidence,
    }
    if work_summary:
        event_data["work_summary"] = work_summary
    if files_changed:
        event_data["files_changed"] = files_changed
    if commit_ref:
        event_data["commit_ref"] = commit_ref
    if session_id:
        event_data["session_id"] = session_id

    return append_event(
        context_id,
        EVENT_TASK_COMPLETED,
        project_root,
        **event_data
    )


def record_task_blocked(
    context_id: str,
    task_id: str,
    reason: str,
    session_id: str = "",
    project_root: Path = None
) -> bool:
    """
    Record a task_blocked event in the context's event log.

    Called when a task becomes blocked.

    Args:
        context_id: Context identifier
        task_id: Persistent task ID
        reason: Reason for being blocked
        session_id: Session ID where task was blocked (optional)
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    event_data = {
        "task_id": task_id,
        "reason": reason,
    }
    if session_id:
        event_data["session_id"] = session_id

    return append_event(
        context_id,
        EVENT_TASK_BLOCKED,
        project_root,
        **event_data
    )


def record_task_deleted(
    context_id: str,
    task_id: str,
    session_id: str = "",
    project_root: Path = None
) -> bool:
    """
    Record a task_deleted event in the context's event log.

    Called when Claude deletes a task via TaskUpdate with status="deleted".

    Args:
        context_id: Context identifier
        task_id: Persistent task ID
        session_id: Session ID where task was deleted (optional)
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    event_data = {"task_id": task_id}
    if session_id:
        event_data["session_id"] = session_id

    return append_event(
        context_id,
        EVENT_TASK_DELETED,
        project_root,
        **event_data
    )


def record_session_ended(
    context_id: str,
    session_id: str,
    reason: str = "other",
    active_tasks: Optional[List[str]] = None,
    pending_tasks: Optional[List[str]] = None,
    project_root: Path = None
) -> bool:
    """
    Record a session_ended event in the context's event log.

    Creates a session boundary marker. Tasks left in_progress at session end
    are recorded so they can be identified as "interrupted" during restore.

    Args:
        context_id: Context identifier
        session_id: Session ID that ended
        reason: Why session ended (prompt_input_exit, clear, logout, other)
        active_tasks: Task IDs that were in_progress at session end
        pending_tasks: Task IDs still pending at session end
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    event_data = {
        "session_id": session_id,
        "reason": reason,
    }
    if active_tasks:
        event_data["active_tasks"] = active_tasks
    if pending_tasks:
        event_data["pending_tasks"] = pending_tasks

    return append_event(
        context_id,
        EVENT_SESSION_ENDED,
        project_root,
        **event_data
    )


def generate_next_task_id(context_id: str, project_root: Path = None) -> str:
    """
    Generate the next sequential task ID for a context.

    Task IDs follow the pattern: aiw-{n} where n starts at 1.
    Accounts for deleted tasks by scanning all events, not just current state.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Next available task ID (e.g., "aiw-3")
    """
    # Scan all events to find highest task ID ever used (including deleted)
    events = read_events(context_id, project_root)

    max_num = 0
    for event in events:
        if event.get("event") == EVENT_TASK_ADDED:
            task_id = event.get("task_id", "")
            if task_id.startswith("aiw-"):
                try:
                    num = int(task_id.split("-")[1])
                    max_num = max(max_num, num)
                except (IndexError, ValueError):
                    pass

    return f"aiw-{max_num + 1}"
