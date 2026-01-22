#!/usr/bin/env python3
"""
PermissionRequest hook - archives plan when user is prompted for ExitPlanMode approval.

This hook triggers on PermissionRequest (ExitPlanMode), running AFTER:
1. set_plan_state.py (creates state file with task_folder)
2. cc-native-plan-review.py (runs review iterations)

It archives the plan BEFORE the user sees the approval prompt, ensuring the plan
is captured even if the user rejects or the session ends unexpectedly.

State file: ~/.claude/plans/{plan-name}.state.json (adjacent to plan file)
Output: _output/cc-native/plans/{YYYY-MM-DD}/{slug}/plan.md (uses task_folder from state)
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

# Add lib directory to path for imports
_hook_dir = Path(__file__).resolve().parent
_lib_dir = _hook_dir.parent / "lib"
sys.path.insert(0, str(_lib_dir))

from utils import (
    eprint,
    sanitize_title,
    sanitize_filename,
    extract_plan_title,
    extract_task_from_context,
    find_plan_file,
)
from state import (
    get_state_file_path,
    load_state,
    delete_state,
)


def extract_plan_content_from_archive(archive_path: Path) -> Optional[str]:
    """Extract the original plan content from an archived file (strips header).

    Archives have a header format:
    # Plan - YYYY-MM-DD HH:MM:SS
    **Session:** ...
    **Source:** ...
    **Archived:** ...
    ---
    <actual plan content>
    """
    if not archive_path.exists():
        return None

    try:
        content = archive_path.read_text(encoding="utf-8")
        # Find the separator and return content after it
        sep = "\n---\n\n"
        idx = content.find(sep)
        if idx != -1:
            return content[idx + len(sep):]
        return None
    except Exception:
        return None


def is_already_archived(out_path: Path, plan: str) -> bool:
    """Check if plan is already archived with same content (idempotent check)."""
    existing_plan = extract_plan_content_from_archive(out_path)
    if existing_plan is None:
        return False

    # Normalize for comparison (strip trailing whitespace)
    return existing_plan.strip() == plan.strip()


def main() -> int:
    eprint("[archive_plan] Hook started (PermissionRequest)")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[archive_plan] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name", "")
    session_id = str(payload.get("session_id", "unknown"))
    hook_event_name = payload.get("hook_event_name", "")

    eprint(f"[archive_plan] tool_name: {tool_name}, event: {hook_event_name}, session_id: {session_id}")

    # Only process ExitPlanMode
    if tool_name != "ExitPlanMode":
        eprint(f"[archive_plan] Skipping: not ExitPlanMode (got {tool_name})")
        return 0

    # Find plan file (state file is keyed by plan path)
    plan_path_found = find_plan_file()
    if not plan_path_found:
        eprint("[archive_plan] No plan file found in ~/.claude/plans/ - skipping")
        return 0

    # Check for state file - this is the key gate
    state = load_state(plan_path_found)

    if not state:
        eprint("[archive_plan] No state file for this plan - not a plan mode workflow, skipping")
        return 0

    eprint(f"[archive_plan] Found state file for plan: {plan_path_found}")

    # Check if mid-iteration (more reviews pending) - skip archive during revision cycles
    iteration = state.get("iteration")
    if iteration:
        current = iteration.get("current", 1)
        max_iter = iteration.get("max", 1)
        if current < max_iter:
            eprint(f"[archive_plan] Skipping: mid-iteration ({current}/{max_iter}), waiting for final iteration")
            return 0

    plan_path = state.get("plan_path", "")
    project_dir = state.get("project_dir", os.getcwd())

    # Try to get plan content from payload first (PermissionRequest includes tool_input.plan)
    tool_input = payload.get("tool_input", {})
    plan = tool_input.get("plan", "")

    # Fallback: read from plan file if not in payload
    if not plan and plan_path:
        try:
            plan = Path(plan_path).read_text(encoding="utf-8")
            eprint(f"[archive_plan] Read plan from file: {plan_path}")
        except Exception as e:
            eprint(f"[archive_plan] Failed to read plan file: {e}")
    elif plan:
        eprint("[archive_plan] Using plan content from payload")

    if not plan.strip():
        eprint("[archive_plan] Plan is empty, cleaning up state and skipping archive")
        delete_state(plan_path_found)
        return 0

    # Use task_folder from state file (created by set_plan_state.py)
    # This ensures review and archive go to the same folder
    now = datetime.now()
    task_folder_path = state.get("task_folder")
    if task_folder_path:
        out_dir = Path(task_folder_path)
        eprint(f"[archive_plan] Using task_folder from state: {out_dir}")
    else:
        # Fallback: generate folder (backwards compatibility, two-level fallback)
        base = Path(project_dir)
        date_folder = now.strftime("%Y-%m-%d")
        title = extract_plan_title(plan)
        if not title:
            title = extract_task_from_context(plan)
        if title:
            slug = sanitize_title(title.lower())
        else:
            slug = f"session-{sanitize_filename(session_id, 32)}"
        out_dir = base / "_output" / "cc-native" / "plans" / date_folder / slug
        eprint(f"[archive_plan] Generated task folder (no state): {out_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "plan.md"

    # Idempotent check: skip if plan already archived with same content
    if is_already_archived(out_path, plan):
        eprint(f"[archive_plan] Plan already archived with same content, skipping: {out_path}")
        delete_state(plan_path_found)
        return 0

    # Create header with metadata
    header = (
        f"# Plan - {now.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"**Session:** {session_id}\n"
        f"**Source:** {plan_path}\n"
        f"**Archived:** PermissionRequest (before user approval)\n"
        f"**State Created:** {state.get('created_at', 'unknown')}\n\n"
        f"---\n\n"
    )

    # Write the archived plan
    try:
        out_path.write_text(header + plan + "\n", encoding="utf-8")
        eprint(f"[archive_plan] Saved plan to: {out_path}")
    except Exception as e:
        eprint(f"[archive_plan] Failed to write archive: {e}")
        return 0

    # Delete state file to prevent duplicate archives
    delete_state(plan_path_found)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
