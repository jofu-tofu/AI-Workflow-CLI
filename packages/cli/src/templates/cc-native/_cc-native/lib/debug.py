"""
Permanent debug logging for cc-native hooks.

Thin delegation layer over the unified logger (_shared/lib/base/logger.py).
Logs are written to context folder: _output/contexts/<context-id>/debug/hook-log.jsonl
Append-only, cleaned up when context is archived.
Can be disabled via CCNATIVE_DEBUG_DISABLE=1 environment variable.
"""

import os
from pathlib import Path
from typing import Any, Optional

# Feature flag - set CCNATIVE_DEBUG_DISABLE=1 to turn off
DEBUG_ENABLED = os.environ.get("CCNATIVE_DEBUG_DISABLE", "").lower() not in ("1", "true", "yes")

# Import unified logger
try:
    from _shared.lib.base.logger import hook_log
except ImportError:
    # Fallback: try relative import path used by hooks
    try:
        import sys
        _shared = Path(__file__).parent.parent.parent.parent / "_shared"
        if str(_shared) not in sys.path:
            sys.path.insert(0, str(_shared))
        from lib.base.logger import hook_log
    except ImportError:
        # Last resort: no-op
        def hook_log(*args, **kwargs):
            pass


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
    """Write a debug log entry. Delegates to unified logger.

    Args:
        context_path: Path to context folder
        session_name: Session name/ID
        component: Component name (e.g., "agent", "orchestrator", "parse")
        message: Log message
        data: Optional data to include (will be JSON serialized)
    """
    if not DEBUG_ENABLED:
        return

    hook_log(
        "debug",
        session_name,
        message,
        component=component,
        data=data,
        stderr=False,
    )


def debug_raw(
    context_path: Path,
    session_name: str,
    component: str,
    label: str,
    raw: str,
    max_len: int = 10000
) -> None:
    """Log raw output (stdout, stderr, etc). Delegates to unified logger.

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
    hook_log(
        "debug",
        session_name,
        f"{label}{suffix}: {truncated}",
        component=component,
        stderr=False,
    )


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
