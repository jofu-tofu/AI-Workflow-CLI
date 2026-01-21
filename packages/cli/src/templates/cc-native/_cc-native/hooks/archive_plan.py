#!/usr/bin/env python3
"""
PreToolUse hook - backup archiver that runs on ExitPlanMode.

NOTE: Primary archiving now happens in add_plan_context.py (PreToolUse:Write),
which runs BEFORE any permission prompts. This hook serves as a backup that:
1. Updates the archive with post-review metadata if reviews completed
2. Skips if plan was already archived with same content (idempotent)

This hook triggers on PreToolUse (ExitPlanMode), running after set_plan_state.py
and cc-native-plan-review.py. It ONLY archives if a state file exists for this
plan, which is created by set_plan_state.py when ExitPlanMode fires.

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


def is_plan_file_edit(payload: Dict[str, Any], plan_path: str) -> bool:
    """Check if this tool use is editing the plan file itself."""
    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})

    if tool_name not in ("Edit", "Write"):
        return False

    file_path = tool_input.get("file_path", "")

    # Normalize paths for comparison
    try:
        edit_path = Path(file_path).resolve()
        target_path = Path(plan_path).resolve()
        return edit_path == target_path
    except Exception:
        # Fallback to string comparison
        return file_path == plan_path


def main() -> int:
    eprint("[archive_plan] Hook started")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[archive_plan] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name", "")
    session_id = str(payload.get("session_id", "unknown"))

    eprint(f"[archive_plan] tool_name: {tool_name}, session_id: {session_id}")

    # Find plan file first (state file is keyed by plan path)
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

    # Skip if this is an edit to the plan file itself (let revision complete first)
    if plan_path and is_plan_file_edit(payload, plan_path):
        eprint("[archive_plan] Skipping: this is an edit to the plan file itself")
        return 0

    # Read the plan from the stored path
    plan = ""
    if plan_path:
        try:
            plan = Path(plan_path).read_text(encoding="utf-8")
            eprint(f"[archive_plan] Read plan from: {plan_path}")
        except Exception as e:
            eprint(f"[archive_plan] Failed to read plan file: {e}")

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
        # Fallback: generate folder (backwards compatibility)
        base = Path(project_dir)
        date_folder = now.strftime("%Y-%m-%d")
        title = extract_plan_title(plan)
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
        f"**Archived:** Post-feedback (triggered by {tool_name or 'Stop'})\n"
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
