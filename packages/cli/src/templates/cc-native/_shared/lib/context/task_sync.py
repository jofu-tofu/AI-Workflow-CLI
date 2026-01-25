"""Task synchronization utilities for Claude native task integration.

Provides bi-directional sync between:
- Claude Code native TaskCreate/TaskUpdate/TaskList tools (ephemeral)
- Persistent events.jsonl storage (source of truth)

SESSION START (Hydrate):
1. Read events.jsonl -> compute pending tasks
2. Output instructions for Claude to recreate tasks via TaskCreate
3. Claude's native TaskList now populated with persistent state

DURING SESSION (Persist):
1. Claude uses native TaskCreate/TaskUpdate
2. CLAUDE.md instructs: after TaskUpdate, call append_event()
3. Both systems stay in sync

SESSION END:
- events.jsonl already has everything
- Next session will hydrate from it
"""
from pathlib import Path
from typing import List, Optional

from .event_log import (
    get_current_state,
    get_pending_tasks,
    append_event,
    Task,
    EVENT_TASK_ADDED,
    EVENT_TASK_STARTED,
    EVENT_TASK_COMPLETED,
    EVENT_TASK_BLOCKED,
    EVENT_SESSION_STARTED,
)
from ..base.utils import eprint


def generate_hydration_instructions(
    context_id: str,
    project_root: Path = None
) -> str:
    """
    Generate instructions for Claude to recreate tasks from persistent storage.

    Called by SessionStart hook when resuming a context.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Formatted instructions for Claude to restore tasks
    """
    pending_tasks = get_pending_tasks(context_id, project_root)

    if not pending_tasks:
        return "No pending tasks to restore."

    lines = [
        "## Restoring Tasks from Previous Session",
        "",
        "Please recreate these tasks using TaskCreate:",
        "",
    ]

    for task in pending_tasks:
        lines.append(f"### Task: {task.subject}")
        lines.append("")
        lines.append("```")
        lines.append("TaskCreate:")
        lines.append(f'  subject: "{task.subject}"')
        if task.description:
            # Escape quotes in description
            desc = task.description.replace('"', '\\"')
            lines.append(f'  description: "{desc}"')
        if task.active_form:
            lines.append(f'  activeForm: "{task.active_form}"')
        lines.append(f'  metadata: {{"persistent_id": "{task.id}", "context": "{context_id}"}}')
        lines.append("```")
        lines.append("")

    return "\n".join(lines)


def generate_task_summary(context_id: str, project_root: Path = None) -> str:
    """
    Generate a summary of all tasks in a context.

    Useful for status checks and completion suggestions.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Formatted task summary
    """
    state = get_current_state(context_id, project_root)

    if not state.tasks:
        return "No tasks in this context."

    completed = [t for t in state.tasks if t.status == "completed"]
    pending = [t for t in state.tasks if t.status == "pending"]
    in_progress = [t for t in state.tasks if t.status == "in_progress"]
    blocked = [t for t in state.tasks if t.status == "blocked"]

    lines = [
        f"## Task Summary for: {context_id}",
        "",
        f"**Total:** {len(state.tasks)} tasks",
        f"**Completed:** {len(completed)} | **In Progress:** {len(in_progress)} | **Pending:** {len(pending)} | **Blocked:** {len(blocked)}",
        "",
    ]

    if completed:
        lines.append("### Completed")
        for t in completed:
            lines.append(f"- [x] {t.subject}")
        lines.append("")

    if in_progress:
        lines.append("### In Progress")
        for t in in_progress:
            lines.append(f"- [~] {t.subject}")
        lines.append("")

    if pending:
        lines.append("### Pending")
        for t in pending:
            lines.append(f"- [ ] {t.subject}")
        lines.append("")

    if blocked:
        lines.append("### Blocked")
        for t in blocked:
            lines.append(f"- [!] {t.subject}: {t.blocked_reason}")
        lines.append("")

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

    return append_event(
        context_id,
        EVENT_TASK_ADDED,
        project_root,
        **event_data
    )


def record_task_started(
    context_id: str,
    task_id: str,
    project_root: Path = None
) -> bool:
    """
    Record a task_started event in the context's event log.

    Called when Claude starts working on a task.

    Args:
        context_id: Context identifier
        task_id: Persistent task ID
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    return append_event(
        context_id,
        EVENT_TASK_STARTED,
        project_root,
        task_id=task_id
    )


def record_task_completed(
    context_id: str,
    task_id: str,
    evidence: str,
    work_summary: str = "",
    files_changed: Optional[List[str]] = None,
    commit_ref: str = "",
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
    project_root: Path = None
) -> bool:
    """
    Record a task_blocked event in the context's event log.

    Called when a task becomes blocked.

    Args:
        context_id: Context identifier
        task_id: Persistent task ID
        reason: Reason for being blocked
        project_root: Project root directory

    Returns:
        True if event was recorded successfully
    """
    return append_event(
        context_id,
        EVENT_TASK_BLOCKED,
        project_root,
        task_id=task_id,
        reason=reason
    )


def generate_next_task_id(context_id: str, project_root: Path = None) -> str:
    """
    Generate the next sequential task ID for a context.

    Task IDs follow the pattern: aiw-{n} where n starts at 1.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Next available task ID (e.g., "aiw-3")
    """
    state = get_current_state(context_id, project_root)

    if not state.tasks:
        return "aiw-1"

    # Find highest existing task number
    max_num = 0
    for task in state.tasks:
        if task.id.startswith("aiw-"):
            try:
                num = int(task.id.split("-")[1])
                max_num = max(max_num, num)
            except (IndexError, ValueError):
                pass

    return f"aiw-{max_num + 1}"
