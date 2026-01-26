#!/usr/bin/env python3
"""Plan archival hook for ExitPlanMode PostToolUse event.

This hook runs when ExitPlanMode completes, extracting the plan path from
the tool result and archiving it to the active context.

Actions:
1. Detect ExitPlanMode PostToolUse event
2. Extract plan path from tool result
3. Check if plan already archived (avoid duplicates)
4. Determine active context
5. Archive plan to context's plans folder
6. Set context in_flight.mode = "pending_implementation"

Usage in .claude/settings.json:
{
  "hooks": {
    "PostToolUse": [{
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
from typing import Optional

# Add parent directories to path for imports
script_dir = Path(__file__).resolve().parent
lib_dir = script_dir.parent / "lib"
sys.path.insert(0, str(lib_dir.parent))

from lib.context.plan_archive import archive_plan_to_context
from lib.context.context_manager import get_all_contexts
from lib.base.utils import eprint, project_dir


def get_context_for_session(session_id: str, project_root: Path) -> Optional[str]:
    """
    Find context that matches this session_id.

    Args:
        session_id: Session ID to match
        project_root: Project root directory

    Returns:
        Context ID or None if not found
    """
    contexts = get_all_contexts(status="active", project_root=project_root)

    # Primary strategy: Find context with matching session_id
    for ctx in contexts:
        if ctx.in_flight and ctx.in_flight.session_ids and session_id in ctx.in_flight.session_ids:
            eprint(f"[archive_plan] Found context by session: {ctx.id}")
            return ctx.id

    # Fallback: If only one context is planning, assume it's the one
    planning_contexts = [c for c in contexts if c.in_flight and c.in_flight.mode == "planning"]
    if len(planning_contexts) == 1:
        eprint(f"[archive_plan] Fallback: Single planning context: {planning_contexts[0].id}")
        return planning_contexts[0].id

    eprint(f"[archive_plan] Could not find context for session {session_id}")
    return None


def extract_plan_path_from_result(tool_result: str) -> Optional[str]:
    """
    Extract plan path from ExitPlanMode tool result.

    Looks for pattern: "Your plan has been saved to: <path>"
    """
    import re
    match = re.search(r'Your plan has been saved to:\s*(.+\.md)', tool_result)
    if match:
        return match.group(1).strip()
    return None


def on_plan_archive():
    """
    Plan archival hook - archives plan when exiting plan mode.

    Called from PostToolUse on ExitPlanMode - extracts plan path from result
    and archives to the active context.
    """
    # Read hook input from stdin
    try:
        hook_input = json.load(sys.stdin)
    except json.JSONDecodeError:
        eprint("[archive_plan] No valid JSON input")
        return

    hook_event = hook_input.get("hook_event_name", "unknown")
    tool_name = hook_input.get("tool_name", "")
    print(f"[archive_plan] Hook triggered: {hook_event}")
    print(f"[archive_plan] Tool name: {tool_name}")
    print(f"[archive_plan] Hook input keys: {list(hook_input.keys())}")

    # Special handling for ExitPlanMode - don't check permission_mode
    is_exit_plan_mode = (hook_event == "PostToolUse" and tool_name == "ExitPlanMode")

    if is_exit_plan_mode:
        print("[archive_plan] ExitPlanMode detected, proceeding with archival")
    else:
        # Check if we're in plan mode for other hooks
        permission_mode = hook_input.get("permission_mode", "default")
        print(f"[archive_plan] Permission mode: {permission_mode}")

        if permission_mode != "plan":
            print("[archive_plan] Not in plan mode, skipping archival")
            return

    # Prevent infinite loops from stop_hook_active
    if hook_input.get("stop_hook_active", False):
        print("[archive_plan] Stop hook already active, skipping to prevent loop")
        return

    print(f"[archive_plan] Proceeding with archival via {hook_event}")

    # Get project root from hook input or environment
    project_root = project_dir(hook_input)

    # Get plan path from hook input
    tool_input = hook_input.get("tool_input", {})
    tool_result = hook_input.get("tool_result", "")

    # Try to find plan path in various locations
    plan_path = None

    # For ExitPlanMode, extract plan path from tool result first
    if is_exit_plan_mode and tool_result:
        plan_path = extract_plan_path_from_result(tool_result)
        if plan_path:
            print(f"[archive_plan] Extracted plan path from ExitPlanMode result: {plan_path}")

    # Check if plan path is directly provided in tool_input
    if not plan_path and "plan_path" in tool_input:
        plan_path = tool_input["plan_path"]
    elif not plan_path and "planPath" in tool_input:
        plan_path = tool_input["planPath"]

    # If not found yet, search standard locations
    if not plan_path:
        print("[archive_plan] No plan_path found, searching standard locations...")
        # Look for plan in common locations
        possible_paths = []

        # Check Claude Code plan directory first (~/.claude/plans/)
        claude_plans_dir = Path.home() / ".claude" / "plans"
        print(f"[archive_plan] Checking Claude plans dir: {claude_plans_dir}")
        if claude_plans_dir.exists():
            # Find any .md file in Claude plans directory
            claude_plans = list(claude_plans_dir.glob("*.md"))
            print(f"[archive_plan] Found {len(claude_plans)} .md files in Claude plans dir")
            # Sort by modification time, newest first
            if claude_plans:
                claude_plans.sort(key=lambda p: p.stat().st_mtime, reverse=True)
                possible_paths.extend(claude_plans)
                for p in claude_plans[:3]:  # Show first 3
                    print(f"[archive_plan]   - {p}")

        # Existing fallback paths
        possible_paths.extend([
            project_root / "_output" / "cc-native" / "plans" / "current-plan.md",
            project_root / "_output" / "plans" / "current-plan.md",
            project_root / "plan.md",
        ])

        for path in possible_paths:
            if path.exists():
                plan_path = str(path)
                break

    if not plan_path:
        eprint("[archive_plan] Could not determine plan path")
        # Don't block - let ExitPlanMode proceed
        print("[archive_plan] Could not find plan file in any of these locations:")
        print(f"  - ~/.claude/plans/*.md")
        print(f"  - {project_root}/_output/cc-native/plans/current-plan.md")
        print(f"  - {project_root}/_output/plans/current-plan.md")
        print(f"  - {project_root}/plan.md")
        print("Plan archival skipped: no plan path found")
        return

    print(f"[archive_plan] Found plan at: {plan_path}")

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

    print(f"[archive_plan] Resolved plan file path: {plan_file}")

    if not plan_file.exists():
        eprint(f"[archive_plan] Plan file not found: {plan_file}")
        print(f"[archive_plan] ERROR: File does not exist at resolved path")
        print(f"Plan archival skipped: file not found ({plan_path})")
        return

    # Find context by session ID
    session_id = hook_input.get("session_id", "unknown")
    context_id = get_context_for_session(session_id, project_root)

    if not context_id:
        eprint("[archive_plan] Could not determine context for session")
        print("Plan archival failed: no context found for this session")
        return

    # Check if plan was already archived (avoid duplicates)
    contexts = get_all_contexts(status="active", project_root=project_root)
    for ctx in contexts:
        if ctx.id == context_id:
            if ctx.in_flight and ctx.in_flight.mode == "pending_implementation":
                print(f"[archive_plan] Plan already archived for context '{context_id}', skipping")
                return
            break

    # Archive the plan
    archived_path, plan_hash = archive_plan_to_context(
        str(plan_file),
        context_id,
        project_root
    )

    if archived_path:
        print(f"")
        print(f"[archive_plan] SUCCESS!")
        print(f"[archive_plan] Plan archived to context: {context_id}")
        print(f"[archive_plan] Archived path: {archived_path}")
        print(f"[archive_plan] Source path: {plan_file}")
        print(f"[archive_plan] Hash: {plan_hash}")
        print(f"")
        print("After /clear, SessionStart will auto-continue this context for implementation.")
    else:
        print(f"[archive_plan] FAILED: Could not archive plan for context '{context_id}'")


if __name__ == "__main__":
    try:
        on_plan_archive()
    except Exception as e:
        # Log errors to stderr
        eprint(f"[archive_plan] Error: {e}")
        import traceback
        eprint(traceback.format_exc())
        # Exit cleanly so hook doesn't block
        sys.exit(0)
