#!/usr/bin/env python3
"""
PostToolUse hook for ExitPlanMode.
Saves approved plans to plans/YYYY-MM-DD/HHMMSS-{slug}.md

Filename uses plan title if available (e.g., "191811-test-hook-after-restart.md"),
falls back to session ID if no title found (e.g., "191811-session-abc123.md").
"""

import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path


def sanitize(s: str, max_len: int = 50) -> str:
    """Sanitize string for use in filename."""
    # Replace spaces with hyphens before stripping other chars
    s = s.replace(' ', '-')
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    s = re.sub(r"[-_]+", "-", s)  # Collapse multiple separators
    return s.strip("._-")[:max_len] or "unknown"


def extract_title(plan: str) -> str | None:
    """Extract title from '# Plan: <title>' line."""
    for line in plan.split('\n'):
        line = line.strip()
        if line.startswith('# Plan:'):
            title = line[7:].strip()  # Remove '# Plan:' prefix
            return title if title else None
    return None


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
    session_id = sanitize(str(payload.get("session_id", "unknown")), max_len=32)

    # Extract title for descriptive filename
    title = extract_title(plan)
    if title:
        slug = sanitize(title.lower())  # e.g., "test-hook-after-restart"
    else:
        slug = f"session-{session_id}"  # fallback to current behavior

    out_dir = base / "_output" / "cc-native" / "plans" / date_folder
    out_dir.mkdir(parents=True, exist_ok=True)

    out_path = out_dir / f"{time_part}-{slug}.md"
    i = 1
    while out_path.exists():
        out_path = out_dir / f"{time_part}-{slug}-{i}.md"
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
