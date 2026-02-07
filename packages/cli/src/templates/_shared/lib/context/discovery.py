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
from .auto_state import load_auto_state
from .task_sync import generate_task_summary
from ..base.utils import eprint, parse_iso_timestamp
from ..base.constants import get_context_dir
from ..templates.formatters import get_status_icon, format_continuation_header, get_mode_display


def find_plan_path(context: Context, project_root: Path = None) -> Optional[str]:
    """
    Find the most relevant plan path for a context.

    Priority:
    1. Active plan (in_flight.artifact_path) if file exists
    2. Most recent archived plan by mtime
    3. None if no plans found

    Args:
        context: Context to find plan for
        project_root: Project root directory

    Returns:
        Plan file path string or None
    """
    # 1. Active plan (in_flight.artifact_path)
    if context.in_flight and context.in_flight.artifact_path:
        plan_path = Path(context.in_flight.artifact_path)
        if plan_path.exists():
            return str(plan_path)

    # 2. Archived plans (most recent by mtime)
    plans_dir = get_context_dir(context.id, project_root) / "plans"
    if plans_dir.exists():
        plans = sorted(plans_dir.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
        if plans:
            return str(plans[0])

    # 3. No plan found
    return None


def _build_restore_sections(
    context: Context,
    project_root: Path = None
) -> str:
    """
    Build restoration context sections from auto-state and task history.

    Used by formatters to inject richer context when resuming work.
    Returns empty string if no restoration data is available (fresh context).

    Args:
        context: Context being restored
        project_root: Project root directory

    Returns:
        Formatted markdown sections (may be empty)
    """
    sections = []

    # Load auto-state for git info and session end metadata
    auto_state = load_auto_state(context.id, project_root)

    # Add session end info if available
    if auto_state:
        saved_at = auto_state.get("saved_at", "")
        save_reason = auto_state.get("save_reason", "")
        if saved_at:
            time_str = format_relative_time(saved_at)
            reason_display = save_reason.replace("_", " ") if save_reason else "unknown"
            sections.append(f"**Last session ended:** {time_str} ({reason_display})")

    # Task summary (session-aware)
    task_summary = generate_task_summary(context.id, project_root)
    if task_summary and task_summary != "No tasks in this context.":
        sections.append("")
        sections.append(task_summary)

    # Plan path
    plan_path = find_plan_path(context, project_root)
    if plan_path:
        sections.append("")
        sections.append("### Plan")
        sections.append(f"Read the plan at: `{plan_path}`")

    # Git state from auto-state
    if auto_state:
        git_state = auto_state.get("git_state", {})
        if git_state:
            branch = git_state.get("branch", "unknown")
            uncommitted = git_state.get("uncommitted_files", [])
            last_commit = git_state.get("last_commit_short", "")

            sections.append("")
            sections.append("### Git State")
            uncommitted_str = ", ".join(uncommitted[:5]) if uncommitted else "none"
            if len(uncommitted) > 5:
                uncommitted_str += f" (+{len(uncommitted) - 5} more)"
            sections.append(f"Branch: {branch} | Uncommitted: {uncommitted_str}")
            if last_commit:
                sections.append(f"Last commit: {last_commit}")

    return "\n".join(sections)


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
        time_str = format_relative_time(ctx.last_active)

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


def format_pending_plan_continuation(context: Context, project_root: Path = None) -> str:
    """
    Format output for plan handoff scenario.

    This is shown when SessionStart detects a context with
    plan.status = "pending_implementation". Provides Claude
    with instructions to continue implementation.

    Args:
        context: Context with pending plan implementation
        project_root: Project root directory

    Returns:
        Formatted instructions for Claude
    """
    lines = [
        f"## Resuming Context: {context.id}",
        "",
        f"**Summary:** {context.summary}",
        f"**Mode:** Pending Implementation",
    ]

    # Add restore sections (auto-state, tasks, git)
    restore = _build_restore_sections(context, project_root)
    if restore:
        lines.append(restore)

    lines.extend([
        "",
        "---",
        "",
        "**Instructions:**",
        "1. Review the plan and previous work above",
        "2. Continue from where the previous session left off",
    ])

    return "\n".join(lines)


def format_implementation_continuation(context: Context, project_root: Path = None) -> str:
    """
    Format output for ongoing implementation scenario.

    This is shown when SessionStart detects a context with
    in_flight.mode = "implementing".

    Args:
        context: Context with implementation in progress
        project_root: Project root directory

    Returns:
        Formatted instructions for Claude
    """
    lines = [
        f"## Resuming Context: {context.id}",
        "",
        f"**Summary:** {context.summary}",
        f"**Mode:** Implementing",
    ]

    # Add restore sections (auto-state, tasks, git)
    restore = _build_restore_sections(context, project_root)
    if restore:
        lines.append(restore)

    lines.extend([
        "",
        "---",
        "",
        "**Instructions:**",
        "1. Review the plan and previous work above",
        "2. Continue from where the previous session left off",
    ])

    return "\n".join(lines)


def format_handoff_continuation(context: Context, project_root: Path = None) -> str:
    """
    Format output when resuming a context with a pending handoff.

    Reads the handoff index.md and injects its content so the agent
    has full continuity without needing to Read the file.

    Args:
        context: Context with in_flight.handoff_path set
        project_root: Project root directory

    Returns:
        Formatted instructions with handoff content for Claude
    """
    handoff_path = context.in_flight.handoff_path

    lines = [
        f"## Resuming Context: {context.id} (Handoff Available)",
        "",
        f"**Summary:** {context.summary}",
        f"**Mode:** Implementing (handoff from previous session)",
        "",
    ]

    # Read and inject handoff index.md content
    try:
        handoff_file = Path(handoff_path)
        if handoff_file.exists():
            content = handoff_file.read_text(encoding="utf-8")
            lines.extend([
                "### Previous Session Handoff",
                "",
                content,
                "",
            ])
        else:
            lines.append(f"*Handoff document not found at `{handoff_path}`*")
            lines.append("")
    except Exception as e:
        lines.append(f"*Handoff document at `{handoff_path}` could not be read: {e}*")
        lines.append("")

    # Add restore sections (auto-state, tasks, git, plan path)
    restore = _build_restore_sections(context, project_root)
    if restore:
        lines.append(restore)

    lines.extend([
        "",
        "---",
        "",
        "**Instructions:**",
        "1. Review the handoff document above - especially dead ends",
        "2. Check the plan file for remaining tasks",
        "3. Continue implementation from where the previous session left off",
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
        time_str = format_relative_time(ctx.last_active)

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


def format_active_context_reminder(
    context: Context,
    project_root: Path = None,
    include_restore: bool = False
) -> str:
    """
    Format system reminder for active context.

    Called in two situations:
    1. session_match (every prompt): include_restore=False → lightweight
    2. auto_selected first bind: include_restore=True → rich restore context

    Args:
        context: Active context
        project_root: Project root directory
        include_restore: If True, include auto-state/tasks/git restore sections.
                        Only set True on first bind to avoid per-prompt overhead.

    Returns:
        Formatted system reminder
    """
    time_str = format_relative_time(context.last_active)

    # Build mode display
    mode_display = "Active"
    if context.in_flight and context.in_flight.mode != "none":
        # Get mode display and strip brackets for this usage
        mode_str = get_mode_display(context.in_flight.mode)
        if mode_str:
            # Remove brackets from "[Planning]" to get "Planning"
            mode_display = mode_str.strip("[]")

    if include_restore:
        # Rich restore: first bind to existing context in new session
        lines = [
            f"## Resuming Context: {context.id}",
            "",
            f"**Summary:** {context.summary}",
            f"**Mode:** {mode_display}",
        ]

        restore = _build_restore_sections(context, project_root)
        if restore:
            lines.append(restore)

        lines.extend([
            "",
            "---",
            "",
            "**Instructions:**",
            "1. Review the previous work above",
            "2. Continue from where the previous session left off",
        ])
    else:
        # Lightweight: subsequent prompts in same session
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


def format_relative_time(iso_timestamp: Optional[str]) -> str:
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
