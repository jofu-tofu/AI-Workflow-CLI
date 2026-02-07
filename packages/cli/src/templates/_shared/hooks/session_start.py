#!/usr/bin/env python3
"""SessionStart hook for post-compaction and post-clear restore.

This hook fires when a new session starts. It handles:

1. Post-clear restore (source="clear"): After ExitPlanMode "clear context",
   Claude Code runs /clear and auto-pastes the plan. The auto-paste bypasses
   all hooks (UserPromptSubmit never fires), so this hook bridges the gap:
   find the has_plan context (set by session_end moments ago), bind the new
   session, transition has_plan → active, and inject restoration context.

2. Post-compaction restore (source="compact"): The session is already bound
   to a context. Load state and inject rich restoration context so Claude
   can continue seamlessly after compaction.

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

from lib.base.hook_utils import emit_context, load_hook_input, log_debug, log_info, log_error
from lib.base.utils import project_dir
from lib.context.context_store import get_context_by_session_id, get_all_contexts, bind_session, update_mode
from lib.context.context_formatter import _build_restore_sections


def _handle_compact_restore(hook_input, session_id, project_root):
    """
    Handle post-compaction restore.

    After compaction, the session is already bound to a context.
    Load state and inject rich restoration context via additionalContext.
    """
    state = get_context_by_session_id(session_id, project_root)
    if not state:
        log_debug("session_start", "No context bound to session after compact")
        return

    log_info("session_start", f"Post-compaction restore for context: {state.id}")

    # Build restoration context
    mode_display = state.mode.replace("_", " ").title() if state.mode != "idle" else "Active"

    lines = [
        f"## Resuming Context After Compaction: {state.id}",
        "",
        f"**Summary:** {state.summary}",
        f"**Mode:** {mode_display}",
    ]

    # Add restore sections (tasks, git state, plan content)
    # inline_plan=True because plan content is NOT auto-pasted after compaction
    restore = _build_restore_sections(state, project_root, inline_plan=True)
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
    log_info("session_start", f"Injected post-compaction restore context for {state.id}")


def _handle_clear_restore(hook_input, session_id, project_root):
    """
    Handle plan context restoration after /clear.

    After ExitPlanMode "clear context", Claude Code auto-pastes the plan
    but the auto-paste bypasses all hooks — UserPromptSubmit never fires.
    This means the new session is never bound to a context.

    Fix: find the has_plan context (set by session_end moments ago),
    bind the new session to it, and inject restoration context.
    """
    # Find has_plan contexts (sorted by last_active descending)
    has_plan = [
        c for c in get_all_contexts(status="active", project_root=project_root)
        if c.mode == "has_plan"
    ]

    if not has_plan:
        log_debug("session_start", "No has_plan contexts found after /clear")
        return

    # Pick the most recently active one (first in list, already sorted)
    target = has_plan[0]
    log_info("session_start", f"Found has_plan context after /clear: {target.id}")

    # Bind new session to this context
    bind_session(target.id, session_id, project_root)
    log_info("session_start", f"Bound session {session_id[:8]}... to {target.id}")

    # Transition has_plan → active (consume the transient state)
    update_mode(target.id, "active", project_root=project_root)
    log_info("session_start", f"Transitioned {target.id}: has_plan -> active")

    # Inject restoration context (tasks, git state, plan path reference)
    # Plan CONTENT is not injected — Claude Code auto-pastes it after /clear
    mode_display = "Active (Plan Restored)"
    lines = [
        f"## Resuming Context After Plan Clear: {target.id}",
        "",
        f"**Summary:** {target.summary}",
        f"**Mode:** {mode_display}",
    ]

    restore = _build_restore_sections(target, project_root)
    if restore:
        lines.append(restore)

    lines.extend([
        "",
        "---",
        "",
        "**Instructions:**",
        "Context was cleared for plan implementation. Your plan content has been pasted above.",
        "1. Review the plan content above",
        "2. Implement the plan step by step",
    ])

    restore_context = "\n".join(lines)
    emit_context(restore_context)
    log_info("session_start", f"Injected clear-restore context for {target.id}")


def main():
    """Handle post-compaction and post-clear restore on session start."""
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        source = hook_input.get("source", "unknown")
        permission_mode = hook_input.get("permission_mode", "default")
        session_id = hook_input.get("session_id", "unknown")
        project_root = project_dir(hook_input)

        log_info("session_start", f"source={source}, permission_mode={permission_mode}, session={session_id[:8]}...")

        if source == "compact":
            _handle_compact_restore(hook_input, session_id, project_root)
        elif source == "clear":
            _handle_clear_restore(hook_input, session_id, project_root)
        else:
            log_debug("session_start", f"No action for source='{source}'")

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        from lib.base.hook_utils import log_hook_error
        log_hook_error("session_start", e, "SessionStart", traceback_str=tb)


if __name__ == "__main__":
    from lib.base.hook_utils import run_hook
    run_hook(main, "session_start")
