"""
Permanent debug logging for cc-native hooks.

Logs are written to context folder: _output/contexts/<context-id>/debug/<session-name>.log
Append-only, cleaned up when context is archived.
Can be disabled via CCNATIVE_DEBUG_DISABLE=1 environment variable.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# Feature flag - set CCNATIVE_DEBUG_DISABLE=1 to turn off
DEBUG_ENABLED = os.environ.get("CCNATIVE_DEBUG_DISABLE", "").lower() not in ("1", "true", "yes")


def get_debug_dir(context_path: Path) -> Path:
    """Get or create debug directory within context folder.

    Args:
        context_path: Path to context folder (e.g., _output/contexts/<context-id>/)

    Returns:
        Path to debug folder: <context_path>/debug/
    """
    debug_dir = context_path / "debug"
    debug_dir.mkdir(parents=True, exist_ok=True)
    return debug_dir


def get_log_path(context_path: Path, session_name: str) -> Path:
    """Get log file path for this session.

    Args:
        context_path: Path to context folder
        session_name: Session name/ID (will be sanitized)

    Returns:
        Path to log file: <context_path>/_output/debug/<session-name>.log
    """
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in session_name)[:64]
    return get_debug_dir(context_path) / f"{safe_name}.log"


def debug_log(
    context_path: Path,
    session_name: str,
    component: str,
    message: str,
    data: Optional[Any] = None
) -> None:
    """Write a debug log entry (append-only).

    Args:
        context_path: Path to context folder
        session_name: Session name/ID
        component: Component name (e.g., "agent", "orchestrator", "parse")
        message: Log message
        data: Optional data to include (will be JSON serialized)
    """
    if not DEBUG_ENABLED:
        return

    try:
        log_path = get_log_path(context_path, session_name)
        timestamp = datetime.now().isoformat()

        entry = f"[{timestamp}] [{component}] {message}"
        if data is not None:
            try:
                data_str = json.dumps(data, indent=2, ensure_ascii=True, default=str)
                entry += f"\n{data_str}"
            except Exception:
                entry += f"\n<data serialization failed: {type(data)}>"

        with open(log_path, "a", encoding="utf-8") as f:
            f.write(entry + "\n\n")
    except Exception:
        pass  # Never fail on debug logging


def debug_raw(
    context_path: Path,
    session_name: str,
    component: str,
    label: str,
    raw: str,
    max_len: int = 10000
) -> None:
    """Log raw output (stdout, stderr, etc).

    Args:
        context_path: Path to context folder
        session_name: Session name/ID
        component: Component name
        label: Label for the raw content (e.g., "stdout", "stderr")
        raw: Raw string content
        max_len: Maximum characters to log (default 10000)
    """
    if not DEBUG_ENABLED:
        return

    truncated = raw[:max_len] if len(raw) > max_len else raw
    suffix = f" [TRUNCATED from {len(raw)} chars]" if len(raw) > max_len else ""
    debug_log(context_path, session_name, component, f"{label}{suffix}:", truncated)


def cleanup_debug_folder(context_path: Path) -> None:
    """Remove debug folder during context archive.

    Called by archive_plan.py when archiving a context.

    Args:
        context_path: Path to context folder being archived
    """
    try:
        debug_dir = context_path / "debug"
        if debug_dir.exists():
            import shutil
            shutil.rmtree(debug_dir)
    except Exception:
        pass  # Best effort cleanup
