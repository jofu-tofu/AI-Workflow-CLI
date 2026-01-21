#!/usr/bin/env python3
"""
PreToolUse hook for ExitPlanMode - sets state for deferred archiving.

This hook runs FIRST in the ExitPlanMode PreToolUse chain, BEFORE the user
sees the approval prompt. This allows review hooks to provide feedback that
the user can see before deciding whether to approve the plan.

It creates a plan-adjacent state file that signals "this plan has an
approved plan pending archive."

The archive_plan.py hook checks for this state file before archiving.
This ensures:
1. Non-plan workflows are unaffected (no state file = no archive action)
2. Multiple concurrent sessions don't conflict (plan-keyed state files)
3. The plan path is preserved for later archiving
4. Session ID changes don't reset iteration counters (state keyed by plan path)

State file location: ~/.claude/plans/{plan-name}.state.json
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
    sanitize_filename,
    sanitize_title,
    extract_plan_title,
)
from state import get_state_file_path


def find_plan_file_path(payload: Dict[str, Any]) -> Optional[str]:
    """
    Find the plan file path from the payload or by searching ~/.claude/plans/.

    The plan file path can come from:
    1. tool_response.planFilePath (if Claude Code provides it)
    2. Most recent .md file in ~/.claude/plans/ (fallback)
    """
    # Try to get from tool_response
    tool_response = payload.get("tool_response") or {}
    plan_path = tool_response.get("planFilePath")
    if plan_path and Path(plan_path).exists():
        return plan_path

    # Fallback: find most recent plan file
    plans_dir = Path.home() / ".claude" / "plans"
    if not plans_dir.exists():
        return None

    plan_files = list(plans_dir.glob("*.md"))
    if not plan_files:
        return None

    # Sort by modification time, most recent first
    plan_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return str(plan_files[0])


def main() -> int:
    eprint("[set_plan_state] Hook started (PreToolUse)")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[set_plan_state] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name", "")

    # Only process ExitPlanMode
    if tool_name != "ExitPlanMode":
        eprint(f"[set_plan_state] Skipping: tool is {tool_name}, not ExitPlanMode")
        return 0

    session_id = str(payload.get("session_id", "unknown"))
    eprint(f"[set_plan_state] Processing ExitPlanMode for session: {session_id}")

    # Find plan file path (PreToolUse: no tool_response yet, must find from filesystem)
    plan_path = find_plan_file_path(payload)
    if not plan_path:
        eprint("[set_plan_state] Could not find plan file path, skipping state creation")
        return 0

    # Read plan content directly from file to verify it exists and has content
    try:
        plan_content = Path(plan_path).read_text(encoding="utf-8").strip()
    except Exception as e:
        eprint(f"[set_plan_state] Failed to read plan file: {e}")
        return 0

    if not plan_content:
        eprint("[set_plan_state] Plan file is empty, skipping state creation")
        return 0

    eprint(f"[set_plan_state] Found plan with {len(plan_content)} chars at: {plan_path}")

    # Extract title and generate task folder path
    title = extract_plan_title(plan_content)
    if title:
        slug = sanitize_title(title.lower())
    else:
        slug = f"session-{sanitize_filename(session_id, 32)}"

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    date_folder = datetime.now().strftime("%Y-%m-%d")
    task_folder = str(Path(project_dir) / "_output" / "cc-native" / "plans" / date_folder / slug)

    eprint(f"[set_plan_state] Task folder: {task_folder}")

    # Create or update state file (preserving iteration data if it exists)
    # State file is adjacent to plan file, keyed by plan path (not session_id)
    state_file = get_state_file_path(plan_path)

    # Check for existing state file to preserve iteration data
    existing_state: Dict[str, Any] = {}
    if state_file.exists():
        try:
            existing_state = json.loads(state_file.read_text(encoding="utf-8"))
            eprint(f"[set_plan_state] Found existing state file, preserving iteration data")
        except Exception as e:
            eprint(f"[set_plan_state] Failed to read existing state file: {e}")

    state_data = {
        "session_id": session_id,
        "plan_path": plan_path,
        "created_at": existing_state.get("created_at", datetime.now().isoformat()),
        "project_dir": project_dir,
        "task_folder": task_folder,
    }

    # Preserve iteration data if it exists (set by cc-native-plan-review.py)
    if "iteration" in existing_state:
        state_data["iteration"] = existing_state["iteration"]
        eprint(f"[set_plan_state] Preserving iteration state: current={existing_state['iteration'].get('current', 1)}")

    try:
        state_file.write_text(json.dumps(state_data, indent=2), encoding="utf-8")
        eprint(f"[set_plan_state] {'Updated' if existing_state else 'Created'} state file: {state_file}")
    except Exception as e:
        eprint(f"[set_plan_state] Failed to create state file: {e}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
