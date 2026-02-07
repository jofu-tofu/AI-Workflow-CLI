#!/usr/bin/env python3
"""SessionStart hook for post-compaction restore.

This hook fires when a new session starts. It handles:

1. Post-compaction restore: when source="compact", the session is already
   bound to a context. Load state and inject rich restoration context
   so Claude can continue seamlessly after compaction.

Plan transitions after /clear are handled by user_prompt_submit.py via
plan content matching — NOT here.

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
from lib.context.context_store import get_context_by_session_id
from lib.context.context_formatter import _build_restore_sections


def _handle_compact_restore(hook_input, session_id, project_root):
    """
    Handle post-compaction restore.

    After compaction, the session is already bound to a context.
    Load state and inject rich restoration context via additionalContext.
    """
    state = get_context_by_session_id(session_id, project_root)
    if not state:
        eprint("[session_start] No context bound to session after compact")
        return

    eprint(f"[session_start] Post-compaction restore for context: {state.id}")

    # Build restoration context
    mode_display = state.mode.replace("_", " ").title() if state.mode != "idle" else "Active"

    lines = [
        f"## Resuming Context After Compaction: {state.id}",
        "",
        f"**Summary:** {state.summary}",
        f"**Mode:** {mode_display}",
    ]

    # Add restore sections (tasks, git state, plan path)
    restore = _build_restore_sections(state, project_root)
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
    emit_context(restore_context)
    eprint(f"[session_start] Injected post-compaction restore context for {state.id}")


def main():
    """Handle post-compaction restore on session start."""
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        source = hook_input.get("source", "unknown")
        permission_mode = hook_input.get("permission_mode", "default")
        session_id = hook_input.get("session_id", "unknown")
        project_root = project_dir(hook_input)

        eprint(f"[session_start] source={source}, permission_mode={permission_mode}, session={session_id[:8]}...")

        if source == "compact":
            _handle_compact_restore(hook_input, session_id, project_root)
        else:
            eprint(f"[session_start] No action for source='{source}'")

    except Exception as e:
        from lib.base.hook_utils import log_hook_error
        log_hook_error("session_start", e, "SessionStart")
        eprint(f"[session_start] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
