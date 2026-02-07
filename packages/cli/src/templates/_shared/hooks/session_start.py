#!/usr/bin/env python3
"""SessionStart hook for mode transitions and post-compaction restore.

This hook fires when a new session starts. It handles:

1. Mode transition from `pending_implementation` to `implementing` when
   a session starts after /clear with bypass permissions.

2. Post-compaction restore: when source="compact", the session is already
   bound to a context. Load auto-state and inject rich restoration context
   so Claude can continue seamlessly after compaction.

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

from lib.base.hook_utils import emit_context, load_hook_input
from lib.base.utils import eprint, project_dir
from lib.context.context_manager import (
    get_all_in_flight_contexts,
    get_context_by_session_id,
    update_plan_status,
    update_context_session_id,
)
from lib.context.auto_state import load_auto_state
from lib.context.discovery import (
    _build_restore_sections,
    find_plan_path,
    format_relative_time,
)
from lib.context.task_sync import generate_task_summary


def _handle_clear_transition(hook_input, session_id, project_root):
    """Handle /clear mode transitions (existing behavior)."""
    permission_mode = hook_input.get("permission_mode", "default")

    if permission_mode == "plan":
        eprint("[session_start] Skipping: permission_mode is 'plan' (in planning mode)")
        return

    in_flight_contexts = get_all_in_flight_contexts(project_root)
    if not in_flight_contexts:
        eprint("[session_start] No in-flight contexts found")
        return

    pending_contexts = [
        ctx for ctx in in_flight_contexts
        if ctx.in_flight and ctx.in_flight.mode == "pending_implementation"
    ]
    for ctx in pending_contexts:
        eprint(f"[session_start] Transitioning {ctx.id} from pending_implementation to implementing")
        update_plan_status(ctx.id, "implementing", project_root=project_root)
        update_context_session_id(ctx.id, session_id, project_root)
        eprint(f"[session_start] Bound session {session_id[:8]}... to context {ctx.id}")

    if pending_contexts:
        eprint(f"[session_start] Transitioned {len(pending_contexts)} context(s) to implementing")


def _handle_compact_restore(hook_input, session_id, project_root):
    """
    Handle post-compaction restore.

    After compaction, the session is already bound to a context.
    Load auto-state and inject rich restoration context via additionalContext.
    """
    context = get_context_by_session_id(session_id, project_root)
    if not context:
        eprint("[session_start] No context bound to session after compact")
        return

    context_id = context.id
    eprint(f"[session_start] Post-compaction restore for context: {context_id}")

    # Build restoration context
    mode_display = "Active"
    if context.in_flight and context.in_flight.mode != "none":
        mode_display = context.in_flight.mode.replace("_", " ").title()

    lines = [
        f"## Resuming Context After Compaction: {context_id}",
        "",
        f"**Summary:** {context.summary}",
        f"**Mode:** {mode_display}",
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
        "Context was compacted to free memory. Your previous conversation has been summarized.",
        "1. Review the previous work above",
        "2. Continue from where you left off",
    ])

    restore_context = "\n".join(lines)

    # Emit via utility so Claude sees it
    emit_context(restore_context)
    eprint(f"[session_start] Injected post-compaction restore context for {context_id}")


def main():
    """
    Handle mode transitions and post-compaction restore on session start.
    """
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        source = hook_input.get("source", "unknown")
        permission_mode = hook_input.get("permission_mode", "default")
        session_id = hook_input.get("session_id", "unknown")
        project_root = project_dir(hook_input)

        eprint(f"[session_start] source={source}, permission_mode={permission_mode}, session={session_id[:8]}...")

        if source == "clear":
            _handle_clear_transition(hook_input, session_id, project_root)
        elif source == "compact":
            _handle_compact_restore(hook_input, session_id, project_root)
        else:
            eprint(f"[session_start] No action for source='{source}'")

    except Exception as e:
        eprint(f"[session_start] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
