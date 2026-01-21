#!/usr/bin/env python3
"""PostToolUse: Copy plan to _output/cc-native/plans/current/plan.md after every Write."""

import json
import shutil
import sys
from pathlib import Path


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, Exception):
        return 0

    if payload.get("tool_name") != "Write":
        return 0

    file_path = payload.get("tool_input", {}).get("file_path", "")

    # Only handle plan files
    if ".claude/plans/" not in file_path.replace("\\", "/"):
        return 0
    if not file_path.endswith(".md"):
        return 0

    source = Path(file_path)
    if not source.exists():
        return 0

    # Copy to current/plan.md - always overwrites
    cwd = payload.get("cwd") or Path.cwd()
    output_dir = Path(cwd) / "_output" / "cc-native" / "plans" / "current"
    output_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, output_dir / "plan.md")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
