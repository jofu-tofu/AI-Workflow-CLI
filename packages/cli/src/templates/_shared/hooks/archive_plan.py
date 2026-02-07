#!/usr/bin/env python3
"""Plan archival hook for ExitPlanMode PermissionRequest event.

This hook runs when ExitPlanMode is requested (BEFORE user accepts/rejects),
extracting the plan path from the tool input and archiving it to the
context's plans/ folder. It does NOT modify state.json plan fields or mode.

Separation of concerns:
- archive_plan.py (PermissionRequest) -> archives file only, no state.json changes
- plan_accepted.py (PostToolUse) -> assigns plan fields (hash/signature/path) to state.json
- session_end.py (SessionEnd) -> transitions active -> has_plan when plan is assigned
- context_selector.py -> matches plan content, transitions has_plan -> active

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

from lib.base.hook_utils import load_hook_input, log_debug, log_info, log_warn, log_error
from lib.base.utils import project_dir
from lib.base.constants import get_context_dir
from lib.context.context_store import get_context_by_session_id
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
            log_info("archive_plan", f"Extracted plan path from result: {plan_path}")

    # Check tool_input for plan path
    if not plan_path:
        plan_path = tool_input.get("plan_path") or tool_input.get("planPath")

    # Search standard locations
    if not plan_path:
        log_debug("archive_plan", "No plan_path found, searching standard locations...")
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
    """Archive plan on PermissionRequest:ExitPlanMode — file archival only, no state.json changes."""
    hook_input = load_hook_input()
    if not hook_input:
        log_warn("archive_plan", "No valid JSON input")
        return

    hook_event = hook_input.get("hook_event_name", "unknown")
    tool_name = hook_input.get("tool_name", "")

    log_info("archive_plan", f"Hook triggered: {hook_event}, tool: {tool_name}")

    # Only handle PermissionRequest for ExitPlanMode
    if not (hook_event == "PermissionRequest" and tool_name == "ExitPlanMode"):
        log_debug("archive_plan", "Skipping: not PermissionRequest:ExitPlanMode")
        return

    if hook_input.get("stop_hook_active", False):
        log_debug("archive_plan", "Stop hook active, skipping")
        return

    project_root = project_dir(hook_input)
    plan_path = _find_plan_path(hook_input, project_root)

    if not plan_path:
        log_warn("archive_plan", "Could not find plan file, skipping archival")
        return

    # Resolve plan path
    plan_file = Path(plan_path)
    if not plan_file.is_absolute():
        plan_file = project_root / plan_path

    log_debug("archive_plan", f"Resolved plan file: {plan_file}")

    if not plan_file.exists():
        log_error("archive_plan", f"Plan file not found: {plan_file}")
        return

    # Find context by session ID
    session_id = hook_input.get("session_id", "unknown")
    state = get_context_by_session_id(session_id, project_root)

    if not state:
        log_warn("archive_plan", "Could not determine context for session")
        return

    context_id = state.id

    # Archive the plan file (returns path, hash, signature)
    archived_path, plan_hash, plan_signature = archive_plan(
        str(plan_file), context_id, project_root
    )

    if archived_path:
        # Clean up debug logs
        try:
            context_path = get_context_dir(context_id, project_root)
            cleanup_debug_folder(context_path)
        except Exception as e:
            log_warn("archive_plan", f"could not clean debug folder: {e}")

        log_info("archive_plan", f"SUCCESS: archived plan for {context_id}")
        log_debug("archive_plan", f"Path: {archived_path}, hash: {plan_hash}")
    else:
        log_error("archive_plan", f"Could not archive plan for '{context_id}'")


if __name__ == "__main__":
    from lib.base.hook_utils import run_hook
    run_hook(on_plan_archive, "archive_plan")
