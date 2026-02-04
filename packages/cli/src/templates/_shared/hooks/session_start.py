#!/usr/bin/env python3
"""SessionStart hook for mode transitions after /clear.

This hook fires when a new session starts. It handles the critical transition
from `pending_implementation` to `implementing` when a session starts after
/clear with bypass permissions.

The flow is:
1. User approves plan (ExitPlanMode) -> mode = pending_implementation
2. User clicks "yes and clear and bypass permissions"
3. SessionStart fires with source="clear" and permission_mode="bypassPermissions"
4. This hook transitions mode to "implementing"

Without this hook, the mode stays stuck at pending_implementation because
UserPromptSubmit may not receive the correct permission_mode after /clear.

Hook input:
{
    "hook_event_name": "SessionStart",
    "session_id": "abc123",
    "source": "clear",  # or "startup", "resume", "compact"
    "permission_mode": "bypassPermissions",
    "model": "...",
    ...
}
"""
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input
from lib.base.utils import eprint, project_dir
from lib.context.context_manager import (
    get_all_in_flight_contexts,
    update_plan_status,
    update_context_session_id,
)


def main():
    """
    Handle mode transitions on session start.

    When source is "clear" and permission_mode is "bypassPermissions" or "acceptEdits",
    transition any pending_implementation context to implementing.
    """
    try:
        # Read hook input using shared utility
        hook_input = load_hook_input()

        if not hook_input:
            return

        source = hook_input.get("source", "unknown")
        permission_mode = hook_input.get("permission_mode", "default")
        session_id = hook_input.get("session_id", "unknown")
        project_root = project_dir(hook_input)

        eprint(f"[session_start] source={source}, permission_mode={permission_mode}, session={session_id[:8]}...")

        # Only handle /clear with bypass/accept permissions
        if source != "clear":
            eprint(f"[session_start] Skipping: source is '{source}', not 'clear'")
            return

        if permission_mode == "plan":
            eprint(f"[session_start] Skipping: permission_mode is 'plan' (in planning mode)")
            return

        # Find contexts in pending_implementation mode
        in_flight_contexts = get_all_in_flight_contexts(project_root)
        pending_contexts = [
            ctx for ctx in in_flight_contexts
            if ctx.in_flight and ctx.in_flight.mode == "pending_implementation"
        ]

        if not pending_contexts:
            eprint("[session_start] No pending_implementation contexts found")
            return

        # Transition each pending context to implementing
        for ctx in pending_contexts:
            eprint(f"[session_start] Transitioning {ctx.id} from pending_implementation to implementing")
            update_plan_status(ctx.id, "implementing", project_root=project_root)

            # Also bind this session to the context
            update_context_session_id(ctx.id, session_id, project_root)
            eprint(f"[session_start] Bound session {session_id[:8]}... to context {ctx.id}")

        eprint(f"[session_start] Transitioned {len(pending_contexts)} context(s) to implementing")

    except Exception as e:
        eprint(f"[session_start] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
