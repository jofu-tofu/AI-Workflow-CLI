#!/usr/bin/env python3
"""PreCompact hook - saves auto-state before context compaction.

Critical: saves state before context compaction destroys token history.
After compaction, SessionStart fires with source="compact" and the
restored auto-state provides continuity context.

Hook input (from Claude Code):
{
    "hook_event_name": "PreCompact",
    "session_id": "abc123",
    "transcript_path": "/path/to/transcript.jsonl",
    "cwd": "/path/to/project",
    ...
}

Hook output:
- Silent (no stdout output needed)
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
from lib.context.event_log import EVENT_AUTO_STATE_SAVED, append_event
from lib.context.auto_state import save_auto_state


def main():
    """Save auto-state before compaction."""
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        session_id = hook_input.get("session_id", "")
        transcript_path = hook_input.get("transcript_path")
        project_root = project_dir(hook_input)

        if not session_id:
            eprint("[pre_compact] No session_id, skipping")
            return

        eprint(f"[pre_compact] Saving state before compaction: {session_id[:8]}...")

        # Find context bound to this session
        context = get_context_by_session_id(session_id, project_root)
        if not context:
            eprint("[pre_compact] No context bound to this session, skipping")
            return

        context_id = context.id
        in_flight_mode = context.in_flight.mode if context.in_flight else "none"
        plan_path = context.in_flight.artifact_path if context.in_flight else None
        handoff_path = context.in_flight.handoff_path if context.in_flight else None

        saved = save_auto_state(
            context_id=context_id,
            session_id=session_id,
            save_reason="pre_compact",
            project_root=project_root,
            in_flight_mode=in_flight_mode,
            plan_path=plan_path,
            handoff_path=handoff_path,
            transcript_path=transcript_path,
        )

        if saved:
            append_event(
                context_id, EVENT_AUTO_STATE_SAVED, project_root,
                session_id=session_id, save_reason="pre_compact",
            )
            eprint(f"[pre_compact] Auto-state saved for {context_id}")

    except Exception as e:
        eprint(f"[pre_compact] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
