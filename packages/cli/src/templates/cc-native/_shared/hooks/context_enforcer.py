#!/usr/bin/env python3
"""Context enforcer hook - ensures all work happens within a named context.

This hook runs on UserPromptSubmit BEFORE context_aware_handoff.py.
It enforces that every user interaction happens within a tracked context.

Context selection priority:
1. In-flight work -> Auto-continue (handoff_pending > pending_impl > implementing > planning)
2. Single active context -> Auto-continue
3. Multiple active contexts -> Check prompt for hints, else inject picker
4. No contexts -> Auto-create from prompt

Hook input (from Claude Code):
{
    "hook_type": "UserPromptSubmit",
    "prompt": "user's message text",
    "session_id": "abc123",
    ...
}

Hook output:
- Prints system reminder to stdout with active context info
- Or prints context picker if selection needed
- Or prints new context notification if auto-created
"""
import json
import sys
from pathlib import Path
from typing import Optional, Tuple

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.context.context_manager import (
    get_all_contexts,
    create_context_from_prompt,
)
from lib.context.discovery import (
    get_in_flight_context,
    parse_context_choice_from_prompt,
    format_context_selection_required,
    format_active_context_reminder,
    format_context_created,
)
from lib.base.utils import eprint, project_dir


def determine_context(
    user_prompt: str,
    project_root: Path = None
) -> Tuple[Optional[str], str, Optional[str]]:
    """
    Determine which context this prompt belongs to.

    Returns:
        Tuple of:
        - context_id: Context ID or None if selection needed
        - method: How context was determined (in_flight, single_active, user_indicated,
                  auto_created, user_choice_needed)
        - output: System reminder to inject, or None
    """
    # 1. Check for in-flight work (highest priority)
    in_flight = get_in_flight_context(project_root)
    if in_flight:
        return (
            in_flight.id,
            "in_flight",
            format_active_context_reminder(in_flight)
        )

    # 2. Get active contexts
    contexts = get_all_contexts(status="active", project_root=project_root)

    # 3. No contexts -> auto-create
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

        # Auto-create context from prompt
        try:
            new_context = create_context_from_prompt(user_prompt, project_root)
            return (
                new_context.id,
                "auto_created",
                format_context_created(new_context)
            )
        except Exception as e:
            eprint(f"[context_enforcer] Failed to create context: {e}")
            return (None, "creation_failed", None)

    # 4. Single context -> auto-continue
    if len(contexts) == 1:
        return (
            contexts[0].id,
            "single_active",
            format_active_context_reminder(contexts[0])
        )

    # 5. Multiple contexts -> check for hint in prompt
    choice = parse_context_choice_from_prompt(user_prompt, contexts)
    if choice:
        # Find the matched context
        matched_ctx = next((c for c in contexts if c.id == choice), None)
        if matched_ctx:
            return (
                choice,
                "user_indicated",
                format_active_context_reminder(matched_ctx)
            )

    # 6. Multiple contexts, no clear choice -> require selection
    return (
        None,
        "user_choice_needed",
        format_context_selection_required(contexts)
    )


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
        context_id, method, output = determine_context(user_prompt, project_root)
        eprint(f"[context_enforcer] Method: {method}, Context: {context_id}")

        if output:
            print(output)

    except Exception as e:
        eprint(f"[context_enforcer] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()


# Export for use by unified hook
__all__ = ["determine_context"]
