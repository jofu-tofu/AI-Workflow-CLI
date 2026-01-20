#!/usr/bin/env python3
"""
PreToolUse/Stop hook - archives the final plan after feedback revisions.

This hook triggers on Edit/Write/Bash (implementation start) or Stop (session end).
It ONLY archives if a state file exists for this session, which is created by
set_plan_state.py when ExitPlanMode fires.

This design ensures:
1. Non-plan workflows are unaffected (no state file = skip entirely)
2. Multiple concurrent sessions don't conflict (session-specific state files)
3. Archives the FINAL plan (after any feedback-driven revisions)
4. User can review before implementation (archive doesn't require impl)

State file: %TEMP%/cc-native-plan-state-{session_id}.json
Output: _output/cc-native/plans/YYYY-MM-DD/HHMMSS-{slug}.md
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
    s = s.replace(' ', '-')
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    s = re.sub(r"[-_]+", "-", s)
    return s.strip("._-")[:max_len] or "unknown"


def extract_title(plan: str) -> Optional[str]:
    """Extract title from '# Plan: <title>' line."""
    for line in plan.split('\n'):
        line = line.strip()
        if line.startswith('# Plan:'):
            title = line[7:].strip()
            return title if title else None
    return None


def get_state_file_path(session_id: str) -> Path:
    """Get path to the state file for this session."""
    temp_dir = Path(tempfile.gettempdir())
    safe_id = sanitize(session_id, 32).replace('-', '_')  # Match set_plan_state.py sanitization
    # Try both possible sanitization patterns
    for safe in [sanitize(session_id, 32), session_id[:32]]:
        candidate = temp_dir / f"cc-native-plan-state-{safe}.json"
        if candidate.exists():
            return candidate
    # Return the canonical path even if it doesn't exist
    return temp_dir / f"cc-native-plan-state-{sanitize(session_id, 32)}.json"


def load_state(session_id: str) -> Optional[Dict[str, Any]]:
    """Load state file for this session if it exists."""
    state_file = get_state_file_path(session_id)

    if not state_file.exists():
        return None

    try:
        return json.loads(state_file.read_text(encoding="utf-8"))
    except Exception as e:
        eprint(f"[archive_plan] Failed to read state file: {e}")
        return None


def delete_state(session_id: str) -> None:
    """Delete state file after successful archive."""
    state_file = get_state_file_path(session_id)
    try:
        if state_file.exists():
            state_file.unlink()
            eprint(f"[archive_plan] Deleted state file: {state_file}")
    except Exception as e:
        eprint(f"[archive_plan] Warning: failed to delete state file: {e}")


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

    # Check for state file - this is the key gate
    state = load_state(session_id)

    if not state:
        eprint("[archive_plan] No state file for this session - not a plan mode workflow, skipping")
        return 0

    eprint(f"[archive_plan] Found state file for session")

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
        delete_state(session_id)
        return 0

    # Create output directory
    base = Path(project_dir)
    now = datetime.now()
    date_folder = now.strftime("%Y-%m-%d")
    time_part = now.strftime("%H%M%S")

    # Extract title for descriptive filename
    title = extract_title(plan)
    if title:
        slug = sanitize(title.lower())
    else:
        slug = f"session-{sanitize(session_id, 32)}"

    out_dir = base / "_output" / "cc-native" / "plans" / date_folder
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{time_part}-{slug}.md"
    i = 1
    while out_path.exists():
        out_path = out_dir / f"{time_part}-{slug}-{i}.md"
        i += 1

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
    delete_state(session_id)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
