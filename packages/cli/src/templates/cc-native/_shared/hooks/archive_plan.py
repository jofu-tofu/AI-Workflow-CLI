#!/usr/bin/env python3
"""ExitPlanMode hook for plan archival.

This hook runs when Claude exits plan mode (plan approved).
It archives the plan to the active context's plans folder.

Actions:
1. Determine active context (or create new one from plan)
2. Archive plan to context's plans folder
3. Set context in_flight.mode = "pending_implementation"

The next SessionStart will detect the pending plan and auto-continue
the context for implementation.

Usage in .claude/settings.json:
{
  "hooks": {
    "PreToolUse": [{
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
import json
import sys
from pathlib import Path

# Add parent directories to path for imports
script_dir = Path(__file__).resolve().parent
lib_dir = script_dir.parent / "lib"
sys.path.insert(0, str(lib_dir.parent))

from lib.context.plan_archive import (
    archive_plan_to_context,
    get_active_context_for_plan,
    create_context_from_plan,
)
from lib.base.utils import eprint, project_dir


def on_exit_plan_mode():
    """
    ExitPlanMode hook - archives plan to active context.

    Reads plan path from hook input and archives to context.
    """
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        eprint("[archive_plan] No valid JSON input")
        return

    # Get project root from hook input or environment
    project_root = project_dir(hook_input)

    # Get plan path from hook input
    # The ExitPlanMode tool input should contain the plan file path
    tool_input = hook_input.get("tool_input", {})

    # Try to find plan path in various locations
    plan_path = None

    # Check if plan path is directly provided
    if "plan_path" in tool_input:
        plan_path = tool_input["plan_path"]
    elif "planPath" in tool_input:
        plan_path = tool_input["planPath"]

    # If not in tool_input, check if there's a standard plan location
    if not plan_path:
        # Look for plan in common locations
        possible_paths = [
            project_root / "_output" / "cc-native" / "plans" / "current-plan.md",
            project_root / "_output" / "plans" / "current-plan.md",
            project_root / "plan.md",
        ]

        for path in possible_paths:
            if path.exists():
                plan_path = str(path)
                break

    if not plan_path:
        eprint("[archive_plan] Could not determine plan path")
        # Don't block - let ExitPlanMode proceed
        print("Plan archival skipped: no plan path found")
        return

    # Resolve plan path relative to project root
    plan_file = Path(plan_path)
    if not plan_file.is_absolute():
        # Ensure we have a valid project_root
        if project_root is None:
            project_root = project_dir()
        plan_file = project_root / plan_path
    else:
        # On Windows, check if absolute path is on a different drive than project_root
        # In that case, use the absolute path as-is
        import sys
        if sys.platform == 'win32':
            try:
                # Check if drives match (e.g., C: vs D:)
                plan_drive = plan_file.drive.upper() if plan_file.drive else None
                project_drive = project_root.drive.upper() if hasattr(project_root, 'drive') and project_root.drive else None
                if plan_drive and project_drive and plan_drive != project_drive:
                    # Different drives - use absolute path as-is
                    pass  # plan_file is already set correctly
            except Exception:
                pass  # Fall through to use plan_file as-is

    if not plan_file.exists():
        eprint(f"[archive_plan] Plan file not found: {plan_file}")
        print(f"Plan archival skipped: file not found ({plan_path})")
        return

    # Find or create target context
    context_id = get_active_context_for_plan(str(plan_file), project_root)

    if not context_id:
        # No active context - create one from plan
        eprint("[archive_plan] Creating new context from plan")
        context_id = create_context_from_plan(str(plan_file), project_root)

        if not context_id:
            eprint("[archive_plan] Failed to create context from plan")
            print("Plan archival failed: could not create context")
            return

    # Archive the plan
    archived_path, plan_hash = archive_plan_to_context(
        str(plan_file),
        context_id,
        project_root
    )

    if archived_path:
        print(f"Plan archived to context '{context_id}'")
        print(f"  Path: {archived_path}")
        print(f"  Hash: {plan_hash}")
        print("")
        print("After /clear, SessionStart will auto-continue this context for implementation.")
    else:
        print(f"Plan archival failed for context '{context_id}'")


if __name__ == "__main__":
    try:
        on_exit_plan_mode()
    except Exception as e:
        # Log errors to stderr
        eprint(f"[archive_plan] Error: {e}")
        import traceback
        eprint(traceback.format_exc())
        # Exit cleanly so hook doesn't block
        sys.exit(0)
