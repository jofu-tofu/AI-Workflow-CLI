"""SessionStart discovery utilities for context management.

Provides functions for discovering contexts at session start and
formatting output for Claude to display context choices.

Used by:
- SessionStart hook to show available contexts
- Plan handoff flow to auto-continue implementation
"""
from pathlib import Path
from typing import List, Optional, Tuple

from datetime import datetime

from .context_manager import (
    Context,
    get_all_contexts,
    get_context_with_pending_plan,
    get_context_with_in_flight_work,
)
from .event_log import get_current_state, get_pending_tasks, Task
from ..base.utils import parse_iso_timestamp


def discover_contexts_for_session(
    project_root: Path = None
) -> Tuple[List[Context], Optional[Context]]:
    """
    SessionStart discovery.

    Returns:
        Tuple of:
        - List of active contexts sorted by last_active (recent first)
        - Context with pending plan implementation (if any)
    """
    active_contexts = get_all_contexts(status="active", project_root=project_root)
    pending_plan_context = get_context_with_pending_plan(project_root)

    return active_contexts, pending_plan_context


def get_in_flight_context(project_root: Path = None) -> Optional[Context]:
    """
    Get context with any in-flight work (plan, handoff, etc.).

    Priority order:
    1. handoff_pending - highest priority (user was interrupted)
    2. pending_implementation - plan ready for implementation
    3. implementing - implementation in progress
    4. planning - actively planning

    Args:
        project_root: Project root directory

    Returns:
        Context with in-flight work, or None
    """
    contexts = get_all_contexts(status="active", project_root=project_root)

    # Sort by in-flight priority
    priority_order = {
        "handoff_pending": 0,
        "pending_implementation": 1,
        "implementing": 2,
        "planning": 3,
        "none": 99,
    }

    in_flight_contexts = [
        c for c in contexts
        if c.in_flight and c.in_flight.mode != "none"
    ]

    if not in_flight_contexts:
        return None

    # Return highest priority, with secondary sort by last_active (most recent) for determinism
    in_flight_contexts.sort(
        key=lambda c: (
            priority_order.get(c.in_flight.mode, 99),
            -(parse_iso_timestamp(c.last_active) or datetime.min).timestamp() if c.last_active else 0
        )
    )
    return in_flight_contexts[0]


def format_context_list(contexts: List[Context]) -> str:
    """
    Format contexts for display to user in SessionStart.

    Shows context name, summary, status, and last activity time.

    Args:
        contexts: List of contexts to format

    Returns:
        Formatted markdown string for display
    """
    if not contexts:
        return "No active contexts found."

    lines = ["## Active Contexts\n"]

    for i, ctx in enumerate(contexts, 1):
        # Format last active time
        time_str = _format_relative_time(ctx.last_active)

        # Build status indicator
        status_indicator = ""
        if ctx.in_flight and ctx.in_flight.mode != "none":
            mode_display = {
                "planning": "[Planning]",
                "pending_implementation": "[Plan Ready]",
                "implementing": "[Implementing]",
                "handoff_pending": "[Handoff Pending]",
            }
            status_indicator = f" {mode_display.get(ctx.in_flight.mode, '')}"

        lines.append(f"**{i}. {ctx.id}**{status_indicator}")
        lines.append(f"   {ctx.summary}")
        if ctx.method:
            lines.append(f"   Method: {ctx.method} | Last active: {time_str}")
        else:
            lines.append(f"   Last active: {time_str}")
        lines.append("")

    return "\n".join(lines)


def format_pending_plan_continuation(context: Context) -> str:
    """
    Format output for plan handoff scenario.

    This is shown when SessionStart detects a context with
    plan.status = "pending_implementation". Provides Claude
    with instructions to continue implementation.

    Args:
        context: Context with pending plan implementation

    Returns:
        Formatted instructions for Claude
    """
    lines = [
        "## CONTINUING CONTEXT: " + context.id,
        "",
        f"**Summary:** {context.summary}",
        "",
    ]

    # Add plan info
    if context.in_flight and context.in_flight.artifact_path:
        lines.append(f"**Plan pending implementation:**")
        lines.append(f"`{context.in_flight.artifact_path}`")
        lines.append("")

    # Add pending tasks if any
    tasks = get_pending_tasks(context.id)
    if tasks:
        lines.append("**Previous tasks:**")
        for task in tasks:
            status_icon = {
                "pending": "⬜",
                "in_progress": "🔄",
                "blocked": "🚫",
            }.get(task.status, "⬜")
            lines.append(f"  {status_icon} {task.subject}")
        lines.append("")

    lines.extend([
        "---",
        "",
        "**Instructions:**",
        "1. Read the plan file above",
        "2. Use TaskCreate to restore any pending tasks from the plan",
        "3. Begin implementing the approved plan",
        "",
        "The context has been loaded. You may begin implementation.",
    ])

    return "\n".join(lines)


def format_handoff_continuation(context: Context) -> str:
    """
    Format output for handoff continuation scenario.

    This is shown when SessionStart detects a context with
    in_flight.mode = "handoff_pending".

    Args:
        context: Context with handoff pending

    Returns:
        Formatted instructions for Claude
    """
    lines = [
        "## RESUMING FROM HANDOFF: " + context.id,
        "",
        f"**Summary:** {context.summary}",
        "",
    ]

    # Add handoff document link
    if context.in_flight and context.in_flight.handoff_path:
        lines.append(f"**Handoff document:**")
        lines.append(f"`{context.in_flight.handoff_path}`")
        lines.append("")

    lines.extend([
        "---",
        "",
        "**Instructions:**",
        "1. Read the handoff document above",
        "2. Use TaskCreate to restore pending tasks",
        "3. Continue where the previous session left off",
        "",
        "The context has been loaded. You may continue.",
    ])

    return "\n".join(lines)


def format_implementation_continuation(context: Context) -> str:
    """
    Format output for ongoing implementation scenario.

    This is shown when SessionStart detects a context with
    in_flight.mode = "implementing".

    Args:
        context: Context with implementation in progress

    Returns:
        Formatted instructions for Claude
    """
    lines = [
        "## CONTINUING IMPLEMENTATION: " + context.id,
        "",
        f"**Summary:** {context.summary}",
        "",
    ]

    # Add plan info
    if context.in_flight and context.in_flight.artifact_path:
        lines.append(f"**Plan being implemented:**")
        lines.append(f"`{context.in_flight.artifact_path}`")
        lines.append("")

    # Add pending tasks
    tasks = get_pending_tasks(context.id)
    if tasks:
        lines.append("**Pending tasks:**")
        for task in tasks:
            status_icon = {
                "pending": "⬜",
                "in_progress": "🔄",
                "blocked": "🚫",
            }.get(task.status, "⬜")
            lines.append(f"  {status_icon} {task.subject}")
        lines.append("")

    lines.extend([
        "---",
        "",
        "**Instructions:**",
        "1. Review the plan and pending tasks above",
        "2. Use TaskCreate to restore pending tasks",
        "3. Continue implementing",
        "",
        "The context has been loaded. You may continue.",
    ])

    return "\n".join(lines)


def format_context_picker_prompt() -> str:
    """
    Format the prompt asking user which context to continue.

    Returns:
        Prompt string for user
    """
    return (
        "\nWhich context would you like to continue?\n"
        "(Say the name/number, or 'new' to start fresh)"
    )


def format_ready_for_new_work() -> str:
    """
    Format output when no active contexts exist.

    Returns:
        Ready message for user
    """
    return "No active contexts. Ready for new work."


def _format_relative_time(iso_timestamp: Optional[str]) -> str:
    """
    Format ISO timestamp as relative time string.

    Args:
        iso_timestamp: ISO format timestamp string

    Returns:
        Relative time string like "2 hours ago" or "yesterday"
    """
    if not iso_timestamp:
        return "unknown"

    dt = parse_iso_timestamp(iso_timestamp)
    if not dt:
        return iso_timestamp[:16]  # Fallback: show date/time portion

    now = datetime.now()

    # Handle timezone-aware vs naive datetime comparison
    # If dt is timezone-aware, convert to naive for comparison
    if dt.tzinfo is not None:
        try:
            # Convert to local time and strip timezone
            dt = dt.replace(tzinfo=None)
        except Exception:
            return iso_timestamp[:16]  # Fallback on error

    diff = now - dt

    if diff.days == 0:
        hours = diff.seconds // 3600
        if hours == 0:
            minutes = diff.seconds // 60
            if minutes == 0:
                return "just now"
            elif minutes == 1:
                return "1 minute ago"
            else:
                return f"{minutes} minutes ago"
        elif hours == 1:
            return "1 hour ago"
        else:
            return f"{hours} hours ago"
    elif diff.days == 1:
        return "yesterday"
    elif diff.days < 7:
        return f"{diff.days} days ago"
    else:
        return dt.strftime("%Y-%m-%d")
