#!/usr/bin/env python3
"""SessionStart hook for context discovery and plan handoff.

This hook runs at the start of every new session (including after /clear).
It discovers existing contexts and handles plan-to-implementation handoff.

Priority order:
1. Handoff pending -> resume from handoff document
2. Plan pending implementation -> auto-continue context
3. Active contexts exist -> show context picker
4. No contexts -> ready for new work

Hook output is displayed to Claude as a system reminder before the
user's first message.

Usage in .claude/settings.json:
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "python .aiwcli/_shared/hooks/session_start.py"
      }]
    }]
  }
}
"""
import json
import sys
from pathlib import Path

# Add parent directories to path for imports
script_dir = Path(__file__).resolve().parent
lib_dir = script_dir.parent / "lib"
sys.path.insert(0, str(lib_dir.parent))

from lib.context.discovery import (
    discover_contexts_for_session,
    get_in_flight_context,
    format_context_list,
    format_pending_plan_continuation,
    format_handoff_continuation,
    format_implementation_continuation,
    format_context_picker_prompt,
    format_ready_for_new_work,
)
from lib.context.task_sync import (
    generate_hydration_instructions,
    record_session_start,
)
from lib.context.plan_archive import mark_plan_implementation_started
from lib.context.context_manager import clear_handoff_status
from lib.base.utils import eprint, project_dir


def on_session_start():
    """
    SessionStart hook - runs on every new session.

    Priority order:
    1. Check for in-flight work (handoff, pending plan, implementing)
    2. Show active contexts if any exist
    3. Ready for new work if no contexts
    """
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        hook_input = {}

    # Get project root from hook input or environment
    project_root = project_dir(hook_input)

    # Check for in-flight work FIRST
    in_flight_ctx = get_in_flight_context(project_root)

    if in_flight_ctx:
        mode = in_flight_ctx.in_flight.mode

        if mode == "handoff_pending":
            # Handoff scenario - resume from handoff document
            output = format_handoff_continuation(in_flight_ctx)
            output += "\n\n" + generate_hydration_instructions(in_flight_ctx.id, project_root)
            record_session_start(in_flight_ctx.id, project_root=project_root)
            # Clear handoff status to prevent re-triggering on next /clear
            clear_handoff_status(in_flight_ctx.id, project_root)
            print(output)
            return

        elif mode == "pending_implementation":
            # Plan handoff scenario - auto-continue implementation
            output = format_pending_plan_continuation(in_flight_ctx)
            output += "\n\n" + generate_hydration_instructions(in_flight_ctx.id, project_root)

            # Mark as implementing to prevent re-trigger on next /clear
            mark_plan_implementation_started(in_flight_ctx.id, project_root)
            record_session_start(in_flight_ctx.id, project_root=project_root)

            print(output)
            return

        elif mode == "implementing":
            # Ongoing implementation - continue
            output = format_implementation_continuation(in_flight_ctx)
            output += "\n\n" + generate_hydration_instructions(in_flight_ctx.id, project_root)
            record_session_start(in_flight_ctx.id, project_root=project_root)
            print(output)
            return

        elif mode == "planning":
            # Continue planning session
            output = f"## CONTINUING PLANNING: {in_flight_ctx.id}\n\n"
            output += f"**Summary:** {in_flight_ctx.summary}\n\n"
            output += "You were in the middle of planning. Continue with the planning process."
            print(output)
            return

    # Normal flow - show context picker or ready message
    active_contexts, _ = discover_contexts_for_session(project_root)

    if not active_contexts:
        print(format_ready_for_new_work())
        return

    # Show active contexts and prompt for choice
    output = format_context_list(active_contexts)
    output += format_context_picker_prompt()
    print(output)


if __name__ == "__main__":
    try:
        on_session_start()
    except Exception as e:
        # Log errors to stderr (visible in hook debug output)
        eprint(f"[session_start] Error: {e}")
        import traceback
        eprint(traceback.format_exc())
        # Exit cleanly so hook doesn't block
        sys.exit(0)
