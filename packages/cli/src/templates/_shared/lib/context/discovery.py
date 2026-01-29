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
from ..templates.formatters import get_status_icon, format_continuation_header, get_mode_display


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
    Get context with any in-flight work (plan, etc.).

    Priority order:
    1. pending_implementation - plan ready for implementation
    2. implementing - implementation in progress
    3. planning - actively planning

    Args:
        project_root: Project root directory

    Returns:
        Context with in-flight work, or None
    """
    contexts = get_all_contexts(status="active", project_root=project_root)

    # Sort by in-flight priority
    priority_order = {
        "pending_implementation": 0,
        "implementing": 1,
        "planning": 2,
        "none": 99,
    }

    # Only auto-continue for high-priority modes (not "implementing", "planning" or "none")
    actionable_modes = {"pending_implementation"}

    in_flight_contexts = [
        c for c in contexts
        if c.in_flight and c.in_flight.mode in actionable_modes
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
            mode_display = get_mode_display(ctx.in_flight.mode)
            if mode_display:
                status_indicator = f" {mode_display}"

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
        format_continuation_header("context", context.id),
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
            status_icon = get_status_icon(task.status)
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
        format_continuation_header("implementing", context.id),
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
            status_icon = get_status_icon(task.status)
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


def parse_context_choice_from_prompt(prompt: str, contexts: List[Context]) -> Optional[str]:
    """
    Parse context selection from user prompt.

    Looks for patterns like:
    - "continue feature-auth" or "resume feature-auth"
    - "1" or "2" (number selection)
    - Context ID mentioned in prompt

    Args:
        prompt: User's prompt text
        contexts: Available contexts to match against

    Returns:
        Context ID if match found, None otherwise
    """
    if not prompt or not contexts:
        return None

    prompt_lower = prompt.lower().strip()

    # Check for number selection (1, 2, 3, etc.)
    # Match single digit at start or "option 1", "number 1", etc.
    import re
    number_match = re.match(r'^(\d+)$', prompt_lower)
    if number_match:
        idx = int(number_match.group(1)) - 1  # 1-indexed
        if 0 <= idx < len(contexts):
            return contexts[idx].id

    # Check for "continue X" or "resume X" patterns
    continue_match = re.match(r'^(?:continue|resume|work on|back to)\s+(.+)$', prompt_lower)
    if continue_match:
        target = continue_match.group(1).strip()
        # Try to match against context IDs
        for ctx in contexts:
            if ctx.id.lower() == target or target in ctx.id.lower():
                return ctx.id

    # Check if any context ID appears in the prompt
    for ctx in contexts:
        if ctx.id.lower() in prompt_lower:
            return ctx.id

    return None


def format_context_selection_required(contexts: List[Context]) -> str:
    """
    Format urgent picker prompt when multiple contexts require selection.

    Used by context enforcer hook when context cannot be auto-determined.

    Args:
        contexts: Available contexts to choose from

    Returns:
        Formatted system reminder with context choices
    """
    lines = [
        "## Context Selection Required",
        "",
        "Multiple active contexts exist. Please indicate which to continue:",
        "",
    ]

    for i, ctx in enumerate(contexts, 1):
        time_str = _format_relative_time(ctx.last_active)

        # Add status indicator for in-flight work
        status = ""
        if ctx.in_flight and ctx.in_flight.mode != "none":
            mode_display = get_mode_display(ctx.in_flight.mode)
            if mode_display:
                status = f" {mode_display}"

        lines.append(f"{i}. **{ctx.id}**{status} - {ctx.summary} [{time_str}]")

    lines.extend([
        "",
        "Say the number/name, or describe your new work (a context will be created).",
    ])

    return "\n".join(lines)


def format_active_context_reminder(context: Context) -> str:
    """
    Format system reminder for active context.

    Used by context enforcer hook to inject context awareness.

    Args:
        context: Active context

    Returns:
        Formatted system reminder
    """
    time_str = _format_relative_time(context.last_active)

    # Build mode display
    mode_display = "Active"
    if context.in_flight and context.in_flight.mode != "none":
        # Get mode display and strip brackets for this usage
        mode_str = get_mode_display(context.in_flight.mode)
        if mode_str:
            # Remove brackets from "[Planning]" to get "Planning"
            mode_display = mode_str.strip("[]")

    lines = [
        f"## Active Context: {context.id}",
        "",
        f"**Summary:** {context.summary}",
        f"**Mode:** {mode_display}",
        f"**Last Active:** {time_str}",
        "",
        f'All work belongs to context "{context.id}".',
        "Tasks created with TaskCreate will be persisted to this context.",
    ]

    return "\n".join(lines)


def format_context_created(context: Context) -> str:
    """
    Format notification that a new context was auto-created.

    Args:
        context: Newly created context

    Returns:
        Formatted system reminder
    """
    lines = [
        f"## Context Created: {context.id}",
        "",
        f"**Summary:** {context.summary}",
        "",
        "A new context has been created for this work.",
        "Tasks created with TaskCreate will be persisted to this context.",
    ]

    return "\n".join(lines)


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
