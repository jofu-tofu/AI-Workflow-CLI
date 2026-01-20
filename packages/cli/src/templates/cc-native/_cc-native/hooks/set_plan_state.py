#!/usr/bin/env python3
"""
PreToolUse hook for ExitPlanMode - sets state for deferred archiving.

This hook runs FIRST in the ExitPlanMode PreToolUse chain, BEFORE the user
sees the approval prompt. This allows review hooks to provide feedback that
the user can see before deciding whether to approve the plan.

It creates a session-specific state file that signals "this session has an
approved plan pending archive."

The archive_plan.py hook checks for this state file before archiving.
This ensures:
1. Non-plan workflows are unaffected (no state file = no archive action)
2. Multiple concurrent sessions don't conflict (session-specific state files)
3. The plan path is preserved for later archiving

State file location: %TEMP%/cc-native-plan-state-{session_id}.json
"""

import json
import os
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr)


def sanitize(s: str, max_len: int = 50) -> str:
    """Sanitize string for use in filename."""
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    return s.strip("._-")[:max_len] or "unknown"


def get_state_file_path(session_id: str) -> Path:
    """Get path to the state file for this session."""
    temp_dir = Path(tempfile.gettempdir())
    safe_id = sanitize(session_id, 32)
    return temp_dir / f"cc-native-plan-state-{safe_id}.json"


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

    # Create state file
    state_file = get_state_file_path(session_id)
    state_data = {
        "session_id": session_id,
        "plan_path": plan_path,
        "created_at": datetime.now().isoformat(),
        "project_dir": os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd(),
    }

    try:
        state_file.write_text(json.dumps(state_data, indent=2), encoding="utf-8")
        eprint(f"[set_plan_state] Created state file: {state_file}")
    except Exception as e:
        eprint(f"[set_plan_state] Failed to create state file: {e}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
