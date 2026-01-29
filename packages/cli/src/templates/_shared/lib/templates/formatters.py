"""Formatters for context management templates.

Provides constants and helper functions for consistent formatting
across discovery, handoff, and hook output.
"""

from typing import Any, Dict, List, Optional, Union

# Mode display mapping for in-flight work states
MODE_DISPLAY_MAP = {
    "planning": "[Planning]",
    "pending_implementation": "[Plan Ready]",
    "implementing": "[Implementing]",
    "none": "",
}

# Status icon mapping for task states
STATUS_ICON_MAP = {
    "pending": "⬜",
    "in_progress": "🔄",
    "blocked": "🚫",
    "completed": "✅",
}


def get_mode_display(mode: str) -> str:
    """Get display string for in-flight mode.

    Args:
        mode: In-flight mode string (planning, implementing, etc.)

    Returns:
        Display string like "[Planning]" or empty string for "none"
    """
    return MODE_DISPLAY_MAP.get(mode, "")


def get_status_icon(status: str) -> str:
    """Get emoji icon for task status.

    Args:
        status: Task status (pending, in_progress, blocked, completed)

    Returns:
        Emoji icon like "⬜" or "✅"
    """
    return STATUS_ICON_MAP.get(status, "⬜")


def render_task_item(
    task: Union["Task", Dict[str, Any]],
    show_description: bool = True,
    max_description_length: int = 100
) -> str:
    """Render single task with status icon and subject.

    Args:
        task: Task object or dict with status, subject, description
        show_description: Whether to include description
        max_description_length: Maximum length for description before truncating

    Returns:
        Formatted string: "- {icon} [{STATUS}] {subject}"
    """
    # Handle both Task objects and dicts
    status = task.get("status") if isinstance(task, dict) else task.status
    subject = task.get("subject") if isinstance(task, dict) else task.subject
    description = task.get("description") if isinstance(task, dict) else task.description

    icon = get_status_icon(status)
    status_text = f"[{status.upper()}]"
    line = f"- {icon} {status_text} {subject}"

    if show_description and description:
        truncated = description[:max_description_length]
        if len(description) > max_description_length:
            truncated += "..."
        return f"{line}\n  - {truncated}"
    return line


def render_task_list(
    tasks: List[Union["Task", Dict[str, Any]]],
    header: Optional[str] = "Active Tasks",
    show_description: bool = True
) -> str:
    """Render list of tasks with header.

    Args:
        tasks: List of Task objects or dicts
        header: Section header text
        show_description: Whether to show task descriptions

    Returns:
        Formatted markdown section with task list
    """
    lines = [f"### {header}", ""]

    if not tasks:
        lines.append("No active tasks.")
    else:
        for task in tasks:
            lines.append(render_task_item(task, show_description))

    lines.append("")
    return "\n".join(lines)


def format_continuation_header(header_type: str, context_id: str) -> str:
    """Format continuation header for various scenarios.

    Args:
        header_type: Type of continuation (context, resuming, implementing, handoff)
        context_id: Context identifier

    Returns:
        Formatted markdown header
    """
    headers = {
        "context": f"## CONTINUING CONTEXT: {context_id}",
        "resuming": f"## RESUMING FROM HANDOFF: {context_id}",
        "implementing": f"## CONTINUING IMPLEMENTATION: {context_id}",
        "handoff": f"# Session Handoff: {context_id}",
    }
    return headers.get(header_type, f"## {context_id}")


# Handoff reason display mapping
REASON_MAP = {
    "low_context": "Context window running low",
    "user_requested": "User requested handoff",
    "error_recovery": "Error recovery",
    "session_end": "Session ending",
}


def format_reason(reason: str) -> str:
    """Format handoff reason code as human-readable string.

    Args:
        reason: Reason code (low_context, user_requested, etc.)

    Returns:
        Human-readable reason string
    """
    return REASON_MAP.get(reason, reason)
