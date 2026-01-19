#!/usr/bin/env python3
"""
PostToolUse hook for ExitPlanMode.
Saves approved plans to plans/YYYY-MM-DD/HHMMSS-session-{session_id}.md
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path


def sanitize(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    return s.strip("._-")[:32] or "unknown"


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"archive_plan.py: invalid JSON: {e}", file=sys.stderr)
        return 1

    if payload.get("tool_name") != "ExitPlanMode":
        return 0

    tool_response = payload.get("tool_response") or {}

    # Plan is in tool_response.plan (not tool_input)
    plan = (tool_response.get("plan") or "").strip()
    if not plan:
        return 0

    # No explicit "approved" field - presence of plan means it was approved
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    base = Path(project_dir)

    now = datetime.now()
    date_folder = now.strftime("%Y-%m-%d")
    time_part = now.strftime("%H%M%S")
    session_id = sanitize(str(payload.get("session_id", "unknown")))

    out_dir = base / "_output" / "cc-native" / "plans" / date_folder
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{time_part}-session-{session_id}.md"
    i = 1
    while out_path.exists():
        out_path = out_dir / f"{time_part}-session-{session_id}-{i}.md"
        i += 1

    header = (
        f"# Plan - {now.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        f"**Session:** {payload.get('session_id', '')}\n\n"
        f"---\n\n"
    )

    out_path.write_text(header + plan + "\n", encoding="utf-8")
    print(f"Saved plan to: {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
