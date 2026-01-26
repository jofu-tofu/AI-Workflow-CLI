#!/usr/bin/env python3
"""Context enforcer hook - ensures all work happens within a named context.

This hook runs on UserPromptSubmit to determine the active context.
It enforces that every user interaction happens within a tracked context.

Context selection priority:
1. Session already in context -> Continue in that context (highest priority - prevents switching)
2. In-flight work -> Auto-continue (handoff_pending > pending_impl > implementing > planning)
3. No contexts -> Auto-create from prompt (or require ^0 if prompt has ^ prefix)
4. One or more contexts -> Require ^N prefix to select

Prefix syntax:
- ^0 <description>: Create new context (description requires 10+ chars)
- ^1, ^2, etc: Select existing context by number (shorthand for ^S1, ^S2)
- ^E<N>: End/complete context N (removes from active list)
- ^S<N>: Select context N for this session
- Chaining: ^E1E2S3 means end contexts 1 and 2, then select context 3

Hook input (from Claude Code):
{
    "hook_type": "UserPromptSubmit",
    "prompt": "user's message text",
    "session_id": "abc123",
    ...
}

Hook output:
- Exit 0 + stdout: Context selected, continues with system reminder
- Exit 2 + stderr: Block request, show context picker to user
"""
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.context.context_manager import (
    Context,
    get_all_contexts,
    create_context_from_prompt,
    get_context_by_session_id,
    complete_context,
    update_plan_status,
)
from lib.context.discovery import (
    get_in_flight_context,
    format_active_context_reminder,
    format_context_created,
    format_handoff_continuation,
    format_pending_plan_continuation,
    format_implementation_continuation,
    _format_relative_time,
)
from lib.templates.formatters import get_mode_display
from lib.base.utils import eprint, project_dir

# Minimum characters required for new context description
MIN_NEW_CONTEXT_CHARS = 10


@dataclass
class CaretCommand:
    """Parsed caret command result."""
    ends: List[int]  # Context numbers to end (1-indexed)
    select: Optional[int]  # Context number to select (1-indexed), None if not specified
    new_context_desc: Optional[str]  # Description for new context (^0)
    remaining_prompt: str  # The remaining prompt after the command


def parse_chained_caret(prompt: str, contexts: List["Context"]) -> Tuple[Optional[CaretCommand], Optional[str]]:
    """
    Parse chained caret commands from user prompt.

    Syntax:
    - ^E<N>: End context N
    - ^S<N>: Select context N
    - ^0 <desc>: Create new context (special case)
    - ^<N>: Shorthand for ^S<N> (backwards compat)
    - Chain: ^E1E2S3 means end 1, end 2, select 3

    Returns:
        Tuple of:
        - CaretCommand with parsed actions, or None if no caret prefix
        - Error message if syntax is invalid, or None
    """
    if not prompt.startswith("^"):
        return None, None

    # Find where the command ends and the remaining prompt begins
    # Command is everything until first whitespace after ^
    match = re.match(r'^\^(\S+)(?:\s+(.*))?$', prompt, re.DOTALL)
    if not match:
        return None, "Invalid prefix. Use ^E<N> to end, ^S<N> to select, or ^0 <desc> for new context."

    command_str = match.group(1)
    remaining = (match.group(2) or "").strip()

    # Handle backwards compat: ^N where N is just a number (shorthand for ^SN)
    if command_str.isdigit():
        num = int(command_str)
        if num == 0:
            # ^0 <description> - create new context
            if len(remaining) < MIN_NEW_CONTEXT_CHARS:
                return None, (
                    f"Please provide a longer description for your new context.\n"
                    f"Your description '{remaining}' is only {len(remaining)} characters.\n"
                    f"Minimum required: {MIN_NEW_CONTEXT_CHARS} characters.\n"
                    f"Example: ^0 implement user authentication with JWT tokens"
                )
            return CaretCommand(ends=[], select=None, new_context_desc=remaining, remaining_prompt=""), None
        else:
            # ^N - shorthand for select context N
            if num < 1 or num > len(contexts):
                if len(contexts) == 0:
                    return None, "No existing contexts. Use ^0 <description> to create a new one."
                return None, f"Invalid selection. Choose 1-{len(contexts)} for existing contexts, or ^0 for new."
            # Validate context is in "implementing" mode
            ctx = contexts[num - 1]
            if not ctx.in_flight or ctx.in_flight.mode != "implementing":
                mode = ctx.in_flight.mode if ctx.in_flight else "none"
                return None, (
                    f"Cannot select context {num} ({ctx.id}) - mode is '{mode}'.\n"
                    f"Only contexts in 'implementing' mode can be selected.\n"
                    f"Use ^E{num} to end this context, or ^0 <desc> to create a new one."
                )
            return CaretCommand(ends=[], select=num, new_context_desc=None, remaining_prompt=remaining), None

    # Parse chained commands: E<N>, S<N>, etc.
    ends = []
    select = None
    pos = 0

    while pos < len(command_str):
        if command_str[pos].upper() == 'E':
            # End command
            pos += 1
            # Read number
            num_start = pos
            while pos < len(command_str) and command_str[pos].isdigit():
                pos += 1
            if num_start == pos:
                return None, f"Expected number after 'E' at position {num_start + 1}"
            num = int(command_str[num_start:pos])
            if num < 1 or num > len(contexts):
                if len(contexts) == 0:
                    return None, "No contexts to end."
                return None, f"Context ^E{num} invalid. Choose 1-{len(contexts)}."
            ends.append(num)

        elif command_str[pos].upper() == 'S':
            # Select command
            pos += 1
            # Read number
            num_start = pos
            while pos < len(command_str) and command_str[pos].isdigit():
                pos += 1
            if num_start == pos:
                return None, f"Expected number after 'S' at position {num_start + 1}"
            num = int(command_str[num_start:pos])
            if num < 1 or num > len(contexts):
                if len(contexts) == 0:
                    return None, "No contexts to select."
                return None, f"Context ^S{num} invalid. Choose 1-{len(contexts)}."
            # Validate context is in "implementing" mode
            ctx = contexts[num - 1]
            if not ctx.in_flight or ctx.in_flight.mode != "implementing":
                mode = ctx.in_flight.mode if ctx.in_flight else "none"
                return None, (
                    f"Cannot select context {num} ({ctx.id}) - mode is '{mode}'.\n"
                    f"Only contexts in 'implementing' mode can be selected.\n"
                    f"Use ^E{num} to end this context, or ^0 <desc> to create a new one."
                )
            # Only first S counts
            if select is None:
                select = num

        else:
            return None, (
                f"Invalid command '{command_str[pos]}' at position {pos + 1}.\n"
                f"Use E<N> to end, S<N> to select, or just a number to select.\n"
                f"Example: ^E1S2 (end context 1, select context 2)"
            )

    # Validate: can't select a context that's being ended
    if select is not None and select in ends:
        return None, f"Cannot select context {select} because it's being ended."

    return CaretCommand(ends=ends, select=select, new_context_desc=None, remaining_prompt=remaining), None


class BlockRequest(Exception):
    """Raised when the request should be blocked with a message to the user."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def format_context_picker_stderr(contexts: List[Context]) -> str:
    """
    Format context picker for stderr output (visible to user when blocking).

    Args:
        contexts: Available contexts to choose from

    Returns:
        Formatted picker message
    """
    lines = [
        "",
        "+----------------------------------------------------------------+",
        "|                   CONTEXT SELECTION REQUIRED                   |",
        "+----------------------------------------------------------------+",
    ]

    implementing_count = 0
    for i, ctx in enumerate(contexts, 1):
        time_str = _format_relative_time(ctx.last_active)

        # Check if context is in implementing mode (selectable)
        is_implementing = ctx.in_flight and ctx.in_flight.mode == "implementing"
        if is_implementing:
            implementing_count += 1

        # Add status indicator for in-flight work
        status = ""
        if ctx.in_flight and ctx.in_flight.mode != "none":
            mode_display = get_mode_display(ctx.in_flight.mode)
            if mode_display:
                status = f" {mode_display}"

        # Truncate summary for display
        summary = ctx.summary[:45] + "..." if len(ctx.summary) > 48 else ctx.summary

        # Show selectable indicator
        selectable = " [selectable]" if is_implementing else " [end only]"
        lines.append(f"|  ^{i}  {ctx.id}{status}{selectable}")
        lines.append(f"|       {summary}")
        lines.append(f"|       [{time_str}]")
        lines.append("|")

    lines.extend([
        "+----------------------------------------------------------------+",
        "|  Usage:                                                        |",
        "|    ^S<N>                 - Select context (implementing only) |",
        "|    ^E<N>                 - End/complete context               |",
        "|    ^E1E2S3               - End #1 and #2, select #3           |",
        "|    ^0 work description   - Create new context (10+ chars)     |",
        "+----------------------------------------------------------------+",
    ])

    if implementing_count == 0:
        lines.extend([
            "|  NOTE: No contexts in 'implementing' mode.                    |",
            "|        Use ^E<N> to end old contexts, then ^0 to create new.  |",
            "+----------------------------------------------------------------+",
        ])

    lines.append("")

    return "\n".join(lines)


def format_command_feedback(ended_contexts: List[Context], selected_context: Optional[Context]) -> str:
    """
    Format feedback about what context operations were performed.

    Args:
        ended_contexts: Contexts that were ended/completed
        selected_context: Context that was selected (if any)

    Returns:
        Formatted feedback message
    """
    lines = []

    if ended_contexts:
        lines.append("## Contexts Ended")
        lines.append("")
        for ctx in ended_contexts:
            lines.append(f"- **{ctx.id}**: {ctx.summary[:50]}{'...' if len(ctx.summary) > 50 else ''}")
        lines.append("")

    if selected_context:
        lines.append(f"## Active Context: {selected_context.id}")
        lines.append("")
        lines.append(f"**Summary:** {selected_context.summary}")

        # Build mode display
        mode_display = "Active"
        if selected_context.in_flight and selected_context.in_flight.mode != "none":
            mode_str = get_mode_display(selected_context.in_flight.mode)
            if mode_str:
                mode_display = mode_str.strip("[]")

        time_str = _format_relative_time(selected_context.last_active)
        lines.append(f"**Mode:** {mode_display}")
        lines.append(f"**Last Active:** {time_str}")
        lines.append("")
        lines.append(f'All work belongs to context "{selected_context.id}".')
        lines.append("Tasks created with TaskCreate will be persisted to this context.")

    return "\n".join(lines)


def determine_context(
    user_prompt: str,
    project_root: Path = None,
    session_id: str = None
) -> Tuple[Optional[str], str, Optional[str]]:
    """
    Determine which context this prompt belongs to.

    Returns:
        Tuple of:
        - context_id: Context ID or None if selection needed
        - method: How context was determined (session_match, in_flight, caret_select,
                  auto_created, single_context, blocked)
        - output: System reminder to inject, or None

    Raises:
        BlockRequest: When request should be blocked to show picker to user
    """
    # 1. Check if session already belongs to a context (HIGHEST PRIORITY)
    # This prevents context switching on subsequent prompts - one context per session
    if session_id:
        session_context = get_context_by_session_id(session_id, project_root)
        if session_context:
            eprint(f"[context_enforcer] Session already in context: {session_context.id}")
            return (
                session_context.id,
                "session_match",
                format_active_context_reminder(session_context)
            )

    # 2. Check for in-flight work (for new sessions without context assignment)
    in_flight = get_in_flight_context(project_root)
    if in_flight:
        # Use mode-specific formatter for better continuation context
        mode = in_flight.in_flight.mode if in_flight.in_flight else "none"
        if mode == "handoff_pending":
            output = format_handoff_continuation(in_flight)
        elif mode == "pending_implementation":
            output = format_pending_plan_continuation(in_flight)
        elif mode == "implementing":
            output = format_implementation_continuation(in_flight)
        else:
            output = format_active_context_reminder(in_flight)
        return (in_flight.id, "in_flight", output)

    # 3. Get active contexts
    contexts = get_all_contexts(status="active", project_root=project_root)

    # 4. No contexts -> auto-create from prompt
    if not contexts:
        # Skip auto-creation for certain prompts that don't represent work
        skip_patterns = [
            "/help", "/clear", "/status", "hello", "hi", "hey",
            "thanks", "thank you", "bye", "goodbye"
        ]
        prompt_lower = user_prompt.lower().strip()

        # Don't auto-create for greetings or help commands
        if any(prompt_lower.startswith(p) or prompt_lower == p for p in skip_patterns):
            return (None, "no_context_needed", None)

        # Handle ^ prefix for new context (even when no contexts exist)
        if user_prompt.startswith("^"):
            # Parse ^0 syntax
            match = re.match(r'^\^(\S+)(?:\s+(.*))?$', user_prompt, re.DOTALL)
            if not match:
                raise BlockRequest(
                    "Invalid prefix. Use ^0 <description> to create a new context.\n"
                    "Example: ^0 implement user authentication system"
                )

            prefix_value = match.group(1)
            remaining = match.group(2) or ""

            # Must be ^0 for new context
            if not prefix_value.isdigit() or int(prefix_value) != 0:
                raise BlockRequest(
                    f"No existing contexts to select. Use ^0 <description> to create a new context.\n"
                    f"Example: ^0 implement user authentication system"
                )

            description = remaining.strip()
            if len(description) < MIN_NEW_CONTEXT_CHARS:
                raise BlockRequest(
                    f"Please provide a longer description for your new context.\n"
                    f"Your description '{description}' is only {len(description)} characters.\n"
                    f"Minimum required: {MIN_NEW_CONTEXT_CHARS} characters.\n"
                    f"Example: ^0 implement user authentication with JWT tokens"
                )
            try:
                new_context = create_context_from_prompt(description, project_root)
                # Set to implementing mode so it can be selected
                update_plan_status(new_context.id, "implementing", project_root=project_root)
                new_context.in_flight.mode = "implementing"  # Update local copy for display
                eprint(f"[context_enforcer] Set new context to implementing mode")
                return (
                    new_context.id,
                    "auto_created",
                    format_context_created(new_context)
                )
            except Exception as e:
                eprint(f"[context_enforcer] Failed to create context: {e}")
                raise BlockRequest(f"Failed to create context: {e}")

        # Auto-create context from prompt
        try:
            new_context = create_context_from_prompt(user_prompt, project_root)
            # Set to implementing mode so it can be selected
            update_plan_status(new_context.id, "implementing", project_root=project_root)
            new_context.in_flight.mode = "implementing"  # Update local copy for display
            eprint(f"[context_enforcer] Set new context to implementing mode")
            return (
                new_context.id,
                "auto_created",
                format_context_created(new_context)
            )
        except Exception as e:
            eprint(f"[context_enforcer] Failed to create context: {e}")
            return (None, "creation_failed", None)

    # 5. One or more contexts -> parse caret commands
    cmd, error = parse_chained_caret(user_prompt, contexts)

    if error:
        # Invalid prefix syntax
        raise BlockRequest(error + "\n" + format_context_picker_stderr(contexts))

    if cmd:
        # Process chained commands
        ended_contexts = []

        # End specified contexts
        for end_num in cmd.ends:
            ctx_to_end = contexts[end_num - 1]  # 1-indexed
            complete_context(ctx_to_end.id, project_root)
            ended_contexts.append(ctx_to_end)
            eprint(f"[context_enforcer] Ended context: {ctx_to_end.id}")

        # Handle new context creation
        if cmd.new_context_desc:
            try:
                new_context = create_context_from_prompt(cmd.new_context_desc, project_root)
                # Set to implementing mode so it can be selected
                update_plan_status(new_context.id, "implementing", project_root=project_root)
                new_context.in_flight.mode = "implementing"  # Update local copy for display
                eprint(f"[context_enforcer] Set new context to implementing mode")
                output = format_command_feedback(ended_contexts, new_context)
                return (
                    new_context.id,
                    "caret_new",
                    output
                )
            except Exception as e:
                eprint(f"[context_enforcer] Failed to create context: {e}")
                raise BlockRequest(f"Failed to create context: {e}")

        # Handle context selection
        if cmd.select:
            selected_ctx = contexts[cmd.select - 1]  # 1-indexed
            eprint(f"[context_enforcer] Caret-selected context: {selected_ctx.id}")
            output = format_command_feedback(ended_contexts, selected_ctx)
            return (
                selected_ctx.id,
                "caret_select",
                output
            )

        # Only ended contexts, no selection - refresh context list and block
        if ended_contexts:
            # Refresh contexts list after ending some
            remaining_contexts = get_all_contexts(status="active", project_root=project_root)
            feedback = format_command_feedback(ended_contexts, None)
            if not remaining_contexts:
                # All contexts ended, need to create new one
                raise BlockRequest(
                    feedback + "\n" +
                    "All contexts have been ended. No context selected.\n\n"
                    "Use ^0 <description> to create a new context.\n"
                    "Example: ^0 implement user authentication system"
                )
            # Still have contexts, show picker
            raise BlockRequest(
                feedback + "\n" +
                "No context selected.\n\n" +
                "Select a context to continue:\n" +
                format_context_picker_stderr(remaining_contexts)
            )

    # No ^ prefix with multiple contexts -> block and show picker
    raise BlockRequest(format_context_picker_stderr(contexts))


def main():
    """
    Standalone entry point for testing.

    In production, use user_prompt_submit.py as the unified entry point.
    """
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            return

        hook_input = json.loads(input_data)
        user_prompt = hook_input.get("prompt", "")
        if not user_prompt:
            return

        project_root = project_dir(hook_input)

        try:
            context_id, method, output = determine_context(user_prompt, project_root)
            eprint(f"[context_enforcer] Method: {method}, Context: {context_id}")

            if output:
                print(output)

        except BlockRequest as e:
            # Block the request - print to stderr and exit with code 2
            print(e.message, file=sys.stderr)
            sys.exit(2)

    except Exception as e:
        eprint(f"[context_enforcer] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()


# Export for use by unified hook
__all__ = ["determine_context", "BlockRequest"]
