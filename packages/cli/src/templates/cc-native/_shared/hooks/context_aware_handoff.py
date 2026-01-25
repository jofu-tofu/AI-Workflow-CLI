#!/usr/bin/env python3
"""Context-aware handoff hook for graceful context degradation.

This hook runs on UserPromptSubmit and checks the remaining context
window. When context drops below a threshold, it injects a system
reminder instructing Claude to create a handoff document.

Hook input (from Claude Code):
{
    "hook_type": "UserPromptSubmit",
    "context_remaining_percent": 18,  // May not be available
    "session_id": "abc123",
    ...
}

Hook output:
- Prints system reminder to stdout if context is low
- Reminder instructs Claude to create handoff document
"""
import json
import os
import sys
from pathlib import Path
from typing import Optional

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.context.context_manager import get_all_contexts
from lib.context.discovery import get_in_flight_context
from lib.handoff.document_generator import get_low_context_warning


# Threshold for low context warning (percentage)
LOW_CONTEXT_THRESHOLD = 20


def get_current_context_id() -> Optional[str]:
    """
    Determine the current active context.

    Looks for context with in-flight work (implementing, planning, etc.)
    or falls back to most recently active context.

    Returns:
        Context ID or None if no active context
    """
    # Check for in-flight work first
    in_flight = get_in_flight_context()
    if in_flight:
        return in_flight.id

    # Fall back to most recently active
    contexts = get_all_contexts(status="active")
    if contexts:
        return contexts[0].id  # Sorted by last_active desc

    return None


def check_context_level(hook_input: dict) -> Optional[str]:
    """
    Check context level and return warning if low.

    Args:
        hook_input: Hook input data from Claude Code

    Returns:
        System reminder string if context is low, None otherwise
    """
    # Get context remaining percentage
    # Note: This may not be available in all Claude Code versions
    context_remaining = hook_input.get("context_remaining_percent")

    if context_remaining is None:
        # Can't determine context level - no action
        return None

    if context_remaining > LOW_CONTEXT_THRESHOLD:
        # Context is fine - no action
        return None

    # Context is low - get current context
    context_id = get_current_context_id()
    if not context_id:
        # No active context - no handoff needed
        return None

    # Return warning
    return get_low_context_warning(context_remaining, context_id)


def main():
    """
    Main entry point for UserPromptSubmit hook.

    Reads hook input from stdin, checks context level,
    and prints system reminder if needed.
    """
    try:
        # Read hook input from stdin
        input_data = sys.stdin.read().strip()

        if not input_data:
            # No input - this might be a test run
            return

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            # Invalid JSON - ignore silently
            return

        # Check context level
        warning = check_context_level(hook_input)

        if warning:
            # Print warning to stdout (will be injected into Claude's context)
            print(warning)

    except Exception as e:
        # Log errors to stderr (won't affect Claude)
        print(f"[context_aware_handoff] ERROR: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
