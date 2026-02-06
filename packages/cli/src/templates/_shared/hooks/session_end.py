#!/usr/bin/env python3
"""SessionEnd hook - records session boundary and saves auto-state.

Fires when session terminates (quit, /clear, logout). Creates a session
boundary marker in events.jsonl and writes auto-state.json for restoration.

Hook input (from Claude Code):
{
    "hook_event_name": "SessionEnd",
    "session_id": "abc123",
    "source": "prompt_input_exit",  # or "clear", "logout", "compact"
    "transcript_path": "/path/to/transcript.jsonl",
    "cwd": "/path/to/project",
    ...
}

Hook output:
- Silent (no stdout output needed for SessionEnd)
- Logs to stderr for debugging
"""
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input
from lib.base.utils import eprint, project_dir
from lib.context.context_manager import get_context_by_session_id
from lib.context.event_log import get_current_state, EVENT_AUTO_STATE_SAVED, append_event
from lib.context.task_sync import record_session_ended
from lib.context.auto_state import save_auto_state


def main():
    """Record session boundary and save auto-state."""
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        session_id = hook_input.get("session_id", "")
        source = hook_input.get("source", "other")
        transcript_path = hook_input.get("transcript_path")
        project_root = project_dir(hook_input)

        if not session_id:
            eprint("[session_end] No session_id, skipping")
            return

        eprint(f"[session_end] Session ending: {session_id[:8]}... reason={source}")

        # Find context bound to this session
        context = get_context_by_session_id(session_id, project_root)
        if not context:
            eprint("[session_end] No context bound to this session, skipping")
            return

        context_id = context.id
        eprint(f"[session_end] Found context: {context_id}")

        # Get current task state for the session boundary marker
        state = get_current_state(context_id, project_root)
        active_tasks = [t.id for t in state.tasks if t.status == "in_progress"]
        pending_tasks = [t.id for t in state.tasks if t.status == "pending"]

        # Record session_ended event in events.jsonl
        record_session_ended(
            context_id=context_id,
            session_id=session_id,
            reason=source,
            active_tasks=active_tasks,
            pending_tasks=pending_tasks,
            project_root=project_root,
        )
        eprint(f"[session_end] Recorded session_ended: active={len(active_tasks)}, pending={len(pending_tasks)}")

        # Save auto-state.json
        in_flight_mode = context.in_flight.mode if context.in_flight else "none"
        plan_path = context.in_flight.artifact_path if context.in_flight else None
        handoff_path = context.in_flight.handoff_path if context.in_flight else None

        saved = save_auto_state(
            context_id=context_id,
            session_id=session_id,
            save_reason=source,
            project_root=project_root,
            in_flight_mode=in_flight_mode,
            plan_path=plan_path,
            handoff_path=handoff_path,
            transcript_path=transcript_path,
        )

        if saved:
            # Record auto_state_saved event
            append_event(
                context_id, EVENT_AUTO_STATE_SAVED, project_root,
                session_id=session_id, save_reason=source,
            )
            eprint(f"[session_end] Auto-state saved for {context_id}")

    except Exception as e:
        eprint(f"[session_end] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
