#!/usr/bin/env python3
"""PostToolUse hook for ExitPlanMode — sets mode to has_plan on acceptance.

This hook fires when the user ACCEPTS the plan (ExitPlanMode succeeds).
PostToolUse fires ONLY on success, so this reliably indicates acceptance.

The plan was already archived by archive_plan.py (PermissionRequest).
This hook only needs to update the mode to "has_plan".

Usage in .claude/settings.json:
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "ExitPlanMode",
      "hooks": [{
        "type": "command",
        "command": "python .aiwcli/_cc-native/hooks/plan_accepted.py",
        "timeout": 5000
      }]
    }]
  }
}
"""
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent.parent / "_shared" / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input
from lib.base.utils import eprint, project_dir
from lib.context.context_store import get_context_by_session_id, update_mode


def main():
    """Set mode to has_plan when user accepts plan via ExitPlanMode."""
    hook_input = load_hook_input()
    if not hook_input:
        return

    hook_event = hook_input.get("hook_event_name", "")
    tool_name = hook_input.get("tool_name", "")

    if not (hook_event == "PostToolUse" and tool_name == "ExitPlanMode"):
        return

    session_id = hook_input.get("session_id", "unknown")
    project_root = project_dir(hook_input)

    state = get_context_by_session_id(session_id, project_root)
    if not state:
        eprint("[plan_accepted] No context found for session")
        return

    # Only transition if plan was archived (plan_hash exists)
    if not state.plan_hash:
        eprint(f"[plan_accepted] No plan_hash for {state.id} — archive may have failed")
        return

    eprint(f"[plan_accepted] Setting {state.id} mode to has_plan")
    update_mode(state.id, "has_plan", project_root=project_root)
    eprint(f"[plan_accepted] Done: {state.id} is now has_plan")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        try:
            from lib.base.hook_utils import log_hook_error
            log_hook_error("plan_accepted", e, "PostToolUse", traceback_str=tb)
        except Exception:
            pass
        print(f"[plan_accepted] Error: {e}", file=sys.stderr)
        print(tb, file=sys.stderr)
        sys.exit(0)
