#!/usr/bin/env python3
"""Plan archival hook for ExitPlanMode PermissionRequest event.

This hook runs when ExitPlanMode is requested (BEFORE user accepts/rejects),
extracting the plan path from the tool input and archiving it to the active
context. It stores plan_hash and plan_signature for content matching after
/clear but does NOT change the context mode.

Mode transitions happen separately:
- plan_accepted.py (PostToolUse:ExitPlanMode) -> sets mode to "has_plan"
- User rejection -> mode stays unchanged (no hook needed)

Usage in .claude/settings.json:
{
  "hooks": {
    "PermissionRequest": [{
      "matcher": "ExitPlanMode",
      "hooks": [{
        "type": "command",
        "command": "python .aiwcli/_shared/hooks/archive_plan.py",
        "timeout": 5000
      }]
    }]
  }
}
"""
import re
import sys
from pathlib import Path
from typing import Optional

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input
from lib.base.utils import eprint, project_dir
from lib.base.constants import get_context_dir
from lib.context.context_store import get_context_by_session_id, update_mode
from lib.context.plan_manager import archive_plan, extract_plan_path_from_result

# Import debug cleanup function from cc-native lib
_cc_native_lib = SCRIPT_DIR.parent / "_cc-native" / "lib"
sys.path.insert(0, str(_cc_native_lib))
try:
    from debug import cleanup_debug_folder
except ImportError:
    def cleanup_debug_folder(context_path):
        pass


def _find_plan_path(hook_input: dict, project_root: Path) -> Optional[str]:
    """Find the plan file path from hook input or standard locations."""
    tool_input = hook_input.get("tool_input", {})
    tool_result = hook_input.get("tool_result", "")
    hook_event = hook_input.get("hook_event_name", "")
    tool_name = hook_input.get("tool_name", "")

    plan_path = None

    # For ExitPlanMode, extract from tool result
    if tool_name == "ExitPlanMode" and tool_result:
        plan_path = extract_plan_path_from_result(tool_result)
        if plan_path:
            eprint(f"[archive_plan] Extracted plan path from result: {plan_path}")

    # Check tool_input for plan path
    if not plan_path:
        plan_path = tool_input.get("plan_path") or tool_input.get("planPath")

    # Search standard locations
    if not plan_path:
        eprint("[archive_plan] No plan_path found, searching standard locations...")
        claude_plans_dir = Path.home() / ".claude" / "plans"
        if claude_plans_dir.exists():
            claude_plans = sorted(
                claude_plans_dir.glob("*.md"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if claude_plans:
                plan_path = str(claude_plans[0])

    if not plan_path:
        for fallback in [
            project_root / "_output" / "cc-native" / "plans" / "current-plan.md",
            project_root / "_output" / "plans" / "current-plan.md",
            project_root / "plan.md",
        ]:
            if fallback.exists():
                plan_path = str(fallback)
                break

    return plan_path


def on_plan_archive():
    """Archive plan on PermissionRequest:ExitPlanMode — stores hash/signature, no mode change."""
    hook_input = load_hook_input()
    if not hook_input:
        eprint("[archive_plan] No valid JSON input")
        return

    hook_event = hook_input.get("hook_event_name", "unknown")
    tool_name = hook_input.get("tool_name", "")

    eprint(f"[archive_plan] Hook triggered: {hook_event}, tool: {tool_name}")

    # Only handle PermissionRequest for ExitPlanMode
    if not (hook_event == "PermissionRequest" and tool_name == "ExitPlanMode"):
        eprint(f"[archive_plan] Skipping: not PermissionRequest:ExitPlanMode")
        return

    if hook_input.get("stop_hook_active", False):
        eprint("[archive_plan] Stop hook active, skipping")
        return

    project_root = project_dir(hook_input)
    plan_path = _find_plan_path(hook_input, project_root)

    if not plan_path:
        eprint("[archive_plan] Could not find plan file, skipping archival")
        return

    # Resolve plan path
    plan_file = Path(plan_path)
    if not plan_file.is_absolute():
        plan_file = project_root / plan_path

    eprint(f"[archive_plan] Resolved plan file: {plan_file}")

    if not plan_file.exists():
        eprint(f"[archive_plan] Plan file not found: {plan_file}")
        return

    # Find context by session ID
    session_id = hook_input.get("session_id", "unknown")
    state = get_context_by_session_id(session_id, project_root)

    if not state:
        eprint("[archive_plan] Could not determine context for session")
        return

    context_id = state.id

    # Skip if already has a plan archived (avoid duplicates)
    if state.mode == "has_plan" and state.plan_hash:
        eprint(f"[archive_plan] Plan already archived for '{context_id}', skipping")
        return

    # Archive the plan (returns path, hash, signature)
    archived_path, plan_hash, plan_signature = archive_plan(
        str(plan_file), context_id, project_root
    )

    if archived_path:
        # Store plan fields in state.json but do NOT change mode
        # Mode change happens in plan_accepted.py (PostToolUse:ExitPlanMode)
        update_mode(
            context_id,
            state.mode,  # Keep current mode unchanged
            project_root=project_root,
            plan_path=archived_path,
            plan_hash=plan_hash,
            plan_signature=plan_signature,
        )

        # Clean up debug logs
        try:
            context_path = get_context_dir(context_id, project_root)
            cleanup_debug_folder(context_path)
        except Exception as e:
            eprint(f"[archive_plan] Warning: could not clean debug folder: {e}")

        eprint(f"[archive_plan] SUCCESS: archived plan for {context_id}")
        eprint(f"[archive_plan] Path: {archived_path}, hash: {plan_hash}")
    else:
        eprint(f"[archive_plan] FAILED: Could not archive plan for '{context_id}'")


if __name__ == "__main__":
    try:
        on_plan_archive()
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        from lib.base.hook_utils import log_hook_error
        log_hook_error("archive_plan", e, "PermissionRequest", traceback_str=tb)
        eprint(f"[archive_plan] Error: {e}")
        eprint(tb)
        sys.exit(0)
