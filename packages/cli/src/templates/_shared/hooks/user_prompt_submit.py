#!/usr/bin/env python3
"""Unified UserPromptSubmit hook entry point.

This hook runs on every UserPromptSubmit and handles:
- Context enforcement - ensures all work happens in a tracked context

Note: Context monitoring (handoff warnings) is handled separately by
context_monitor.py on PostToolUse events, which fires during Claude's
work rather than waiting for user input.

Hook input (from Claude Code):
{
    "hook_type": "UserPromptSubmit",
    "prompt": "user's message text",
    "session_id": "abc123",
    ...
}

Hook output:
- Prints system reminders to stdout for context enforcement
"""
import json
import sys
from pathlib import Path
from typing import List

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.utils import eprint, project_dir
from lib.context.context_manager import (
    update_context_session_id,
    update_plan_status,
    get_context,
    get_context_by_session_id,
)
from lib.context.task_sync import generate_hydration_instructions

# Import the enforcement module
from hooks.context_enforcer import determine_context, BlockRequest


def _update_in_flight_status(context_id: str, hook_input: dict, project_root: Path) -> None:
    """
    Update context in-flight status based on permission mode.

    - If permission_mode == "plan": set to "planning"
    - If permission_mode in ["acceptEdits", "bypassPermissions"]: set to "implementing"
    """
    context = get_context(context_id, project_root)
    if not context or not context.in_flight:
        return

    current_mode = context.in_flight.mode
    permission_mode = hook_input.get("permission_mode", "default")
    eprint(f"[user_prompt_submit] Current mode: {current_mode}, permission_mode: {permission_mode}")

    # Set status based on permission mode
    if permission_mode == "plan":
        if current_mode != "planning":
            update_plan_status(context_id, "planning", project_root=project_root)
            eprint(f"[user_prompt_submit] Set status to 'planning'")
    elif permission_mode in ["acceptEdits", "bypassPermissions"]:
        # Only transition to implementing if we have pending work
        if current_mode in ["pending_implementation", "planning"]:
            update_plan_status(context_id, "implementing", project_root=project_root)
            eprint(f"[user_prompt_submit] Set status to 'implementing'")


def main():
    """
    Main entry point for UserPromptSubmit hook.

    Handles context enforcement for all user prompts.
    Uses session_id to detect first prompt vs subsequent prompts.
    """
    try:
        # Read hook input from stdin
        input_data = sys.stdin.read().strip()

        if not input_data:
            return

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            return

        # Get user prompt and project root
        user_prompt = hook_input.get("prompt", "")
        project_root = project_dir(hook_input)
        session_id = hook_input.get("session_id", "unknown")

        outputs: List[str] = []

        # First-prompt detection: check if session_id is already bound to a context
        existing_context = get_context_by_session_id(session_id, project_root)

        if existing_context:
            # NOT first prompt - session already bound to context
            # Skip expensive context detection and task hydration
            eprint(f"[user_prompt_submit] Session {session_id[:8]}... already bound to {existing_context.id}")
            # Still update in-flight status based on permission mode
            _update_in_flight_status(existing_context.id, hook_input, project_root)
        elif user_prompt:
            # FIRST prompt - need context detection and potentially task hydration
            try:
                context_id, method, context_output = determine_context(user_prompt, project_root, session_id)
                eprint(f"[user_prompt_submit] Context: {method} -> {context_id}")

                if context_id:
                    # Bind session to context
                    update_context_session_id(context_id, session_id, project_root)
                    eprint(f"[user_prompt_submit] Bound session {session_id[:8]}... to context '{context_id}'")

                    # Update in-flight status based on permission mode
                    _update_in_flight_status(context_id, hook_input, project_root)

                    # Task hydration - restore pending tasks from events.jsonl
                    hydration_instructions = generate_hydration_instructions(context_id, project_root)
                    if hydration_instructions and "No pending tasks" not in hydration_instructions:
                        outputs.append(hydration_instructions)
                        eprint(f"[user_prompt_submit] Generated task hydration instructions")

                if context_output:
                    outputs.append(context_output)

            except BlockRequest as e:
                # Block the request - print to stderr and exit with code 2
                # This shows the context picker to the user
                print(e.message, file=sys.stderr)
                sys.exit(2)

        # Print output
        if outputs:
            print("\n\n".join(outputs))

    except Exception as e:
        eprint(f"[user_prompt_submit] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
