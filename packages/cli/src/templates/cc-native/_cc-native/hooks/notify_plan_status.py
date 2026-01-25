#!/usr/bin/env python3
"""
PostToolUse hook - Notify user of plan archival status with platform detection and security.

This hook runs after tool execution to check if plan archival succeeded or failed,
and notifies the user accordingly. It only triggers notifications on failures to avoid
notification fatigue.
"""

import json
import os
import sys
import subprocess
from pathlib import Path
from typing import Optional

# Add lib directory to path for imports
_hook_dir = Path(__file__).resolve().parent
_lib_dir = _hook_dir.parent / "lib"
sys.path.insert(0, str(_lib_dir))

from utils import eprint, find_plan_file
from constants import ENABLE_PLAN_NOTIFICATIONS, validate_plan_path


def detect_notification_command() -> Optional[str]:
    """Detect available notification system."""
    if sys.platform == 'linux':
        try:
            subprocess.run(['which', 'notify-send'], capture_output=True, check=True)
            return 'notify-send'
        except:
            return None
    elif sys.platform == 'darwin':
        return 'osascript'  # Always available on macOS
    else:
        return None  # Windows - no notification


def send_notification_safe(title: str, message: str) -> bool:
    """Send notification with fallback to stderr."""
    if not ENABLE_PLAN_NOTIFICATIONS:
        return False

    cmd = detect_notification_command()

    # Sanitize messages (no paths, max length, escape quotes)
    import re
    title_safe = title[:50]
    # Remove all path-like patterns
    message_safe = re.sub(r'[/\\][^\s]+', '[PATH]', message[:200])
    # Remove quotes to prevent injection
    message_safe = message_safe.replace('"', '').replace("'", '')
    title_safe = title_safe.replace('"', '').replace("'", '')

    if cmd == 'notify-send':
        try:
            subprocess.run(
                ['notify-send', title_safe, message_safe],
                timeout=2,
                capture_output=True
            )
            return True
        except Exception:
            pass
    elif cmd == 'osascript':
        try:
            # Use list arguments to prevent injection
            script = f'display notification "{message_safe}" with title "{title_safe}"'
            subprocess.run(
                ['osascript', '-e', script],
                timeout=2,
                capture_output=True
            )
            return True
        except Exception:
            pass

    # Fallback to stderr
    eprint(f"[NOTIFICATION] {title_safe}: {message_safe}")
    return False


def main() -> int:
    if not ENABLE_PLAN_NOTIFICATIONS:
        return 0

    try:
        payload = json.load(sys.stdin)
        plan_path = find_plan_file()

        if not plan_path:
            return 0

        # Validate path
        try:
            validated_path = validate_plan_path(plan_path)
        except ValueError:
            return 0  # Skip notification for invalid paths

        # Check for error marker (sanitized, no full path)
        error_marker = validated_path.with_suffix('.error')
        if error_marker.exists():
            send_notification_safe(
                "Plan Archive Failed",
                "Plan archival encountered an error. Check logs for details."
            )
            return 0

        # NOTE: Only notify on failures, not success (avoid notification fatigue)

    except Exception as e:
        eprint(f"[notify_plan_status] ERROR: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
