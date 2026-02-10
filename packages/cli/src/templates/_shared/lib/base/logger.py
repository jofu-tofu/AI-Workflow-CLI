"""Unified logging for all hooks and libraries.

Provides a single logging interface that replaces:
- log_hook_error() from hook_utils.py (error-only, plain text)
- debug.py from cc-native (per-context, plain text)
- eprint() for diagnostic output (stderr-only, no persistence)

Log format: JSONL (one JSON object per line)
Log location: _output/hook-log.jsonl (global, all sessions)
Filter by session using the "sid" field.

Environment variables:
- HOOK_LOG_DISABLE=1: Disable all file logging
- HOOK_LOG_LEVEL=warn: Minimum level to log (default: debug)
- HOOK_ERROR_LOG_DISABLE=1: Legacy alias for HOOK_LOG_DISABLE

Never raises — all errors silently swallowed.
No buffering — each call is one open+write+close.
Stdlib only — json, os, sys, datetime, pathlib.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

_LEVELS = {"debug": 0, "info": 1, "warn": 2, "error": 3}

_MAX_LOG_LINES = 10_000  # Max lines in global log before pruning

# Module-level context path cache.
# Set once per hook process via set_context_path() or auto-resolved on first use.
_cached_context_path: Optional[Path] = None
_context_resolved: bool = False

# Module-level session ID cache.
# Set once per hook process via set_session_id().
_cached_session_id: Optional[str] = None


def set_session_id(session_id: Optional[str]) -> None:
    """Set the session ID for this process. All subsequent log calls include it.

    Args:
        session_id: Claude Code session ID (e.g., "a1b2c3d4")
                    or None to clear.
    """
    global _cached_session_id
    _cached_session_id = session_id


def set_context_path(path: Optional[Path]) -> None:
    """Set the context path for this process. All subsequent log calls use it.

    Call this once in your hook after resolving the context:
        from lib.base.logger import set_context_path
        set_context_path(get_context_dir(context_id, project_root))

    Args:
        path: Path to context folder (e.g., _output/contexts/<context-id>/)
              or None to force global-only logging.
    """
    global _cached_context_path, _context_resolved
    _cached_context_path = path
    _context_resolved = True


def _auto_resolve_context_path() -> Optional[Path]:
    """Try to auto-resolve context path from session_id. Called once per process.

    Uses the context store to look up which context owns this session,
    then returns its directory path. Falls back to None (global log).
    """
    global _cached_context_path, _context_resolved
    _context_resolved = True  # Don't retry on failure

    try:
        from ..context.context_store import get_context_by_session_id
        from .constants import get_context_dir

        # Hook input isn't available here, but we can check if a recent
        # context dir exists by scanning _output/contexts/ for one that
        # has a state.json with a matching session
        # This is too expensive for a logger. Instead, rely on set_context_path().
    except Exception:
        pass

    return None


def _get_context_path() -> Optional[Path]:
    """Get the cached context path, auto-resolving on first call."""
    global _context_resolved
    if not _context_resolved:
        _auto_resolve_context_path()
    return _cached_context_path


def _get_min_level() -> int:
    """Get minimum log level from environment."""
    env = os.environ.get("HOOK_LOG_LEVEL", "debug").lower()
    return _LEVELS.get(env, 0)


def _is_disabled() -> bool:
    """Check if file logging is disabled."""
    if os.environ.get("HOOK_LOG_DISABLE") == "1":
        return True
    if os.environ.get("HOOK_ERROR_LOG_DISABLE") == "1":
        return True
    return False


def _get_project_root() -> Path:
    """Get project root from environment or cwd."""
    env_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    return Path(env_dir) if env_dir else Path.cwd()


def hook_log(
    level: str,
    hook_name: str,
    message: str,
    *,
    component: str = "",
    data: Any = None,
    traceback_str: str = "",
    stderr: bool = True,
) -> None:
    """Write a structured log entry to the global hook log.

    All entries go to _output/hook-log.jsonl. Use the "sid" field
    (set via set_session_id) to filter by session.

    Args:
        level: "debug" | "info" | "warn" | "error"
        hook_name: Hook or module name (e.g., "session_end")
        message: Log message
        component: Sub-component (e.g., "git", "parse")
        data: Optional structured data (must be JSON-serializable)
        traceback_str: Optional traceback string
        stderr: Also write to stderr (default: True)
    """
    try:
        level_lower = level.lower()
        level_num = _LEVELS.get(level_lower, 0)

        # Write to stderr if requested
        if stderr:
            prefix = f"[{hook_name}]"
            if component:
                prefix = f"[{hook_name}:{component}]"
            print(f"{prefix} {message}", file=sys.stderr)
            if traceback_str:
                print(traceback_str, file=sys.stderr)

        # Check if file logging is enabled
        if _is_disabled():
            return

        # Check minimum level
        if level_num < _get_min_level():
            return

        # Build JSONL entry
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]
        entry: Dict[str, Any] = {
            "ts": ts,
            "level": level_lower,
            "hook": hook_name,
            "msg": message,
        }
        if _cached_session_id:
            entry["sid"] = _cached_session_id
        if component:
            entry["component"] = component
        if data is not None:
            try:
                json.dumps(data, default=str)  # Validate serializable
                entry["data"] = data
            except (TypeError, ValueError):
                entry["data"] = str(data)
        if traceback_str:
            entry["tb"] = traceback_str.rstrip()

        line = json.dumps(entry, ensure_ascii=True, default=str) + "\n"

        # Always write to global log
        project_root = _get_project_root()
        log_path = project_root / "_output" / "hook-log.jsonl"

        log_path.parent.mkdir(parents=True, exist_ok=True)

        # Line-count guard: prune to last _MAX_LOG_LINES
        if log_path.exists():
            try:
                with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                    existing = f.readlines()
                if len(existing) > _MAX_LOG_LINES:
                    with open(log_path, "w", encoding="utf-8") as f:
                        f.writelines(existing[-_MAX_LOG_LINES:])
            except OSError:
                pass

        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line)

    except Exception:
        pass  # Never crash


def log_debug(hook_name: str, message: str, **kwargs: Any) -> None:
    """Log a debug-level message."""
    hook_log("debug", hook_name, message, **kwargs)


def log_info(hook_name: str, message: str, **kwargs: Any) -> None:
    """Log an info-level message."""
    hook_log("info", hook_name, message, **kwargs)


def log_warn(hook_name: str, message: str, **kwargs: Any) -> None:
    """Log a warn-level message."""
    hook_log("warn", hook_name, message, **kwargs)


def log_error(hook_name: str, message: str, **kwargs: Any) -> None:
    """Log an error-level message."""
    hook_log("error", hook_name, message, **kwargs)


def log_diagnostic(
    hook_name: str,
    phase: str,
    summary: str,
    *,
    inputs: Any = None,
    decision: Any = None,
    reasoning: Any = None,
    component: str = "diag",
    data: Any = None,
) -> None:
    """Log a structured diagnostic entry at a hook decision point.

    Emits a debug-level JSONL entry with tagged, filterable data.
    Use at key decision points: receive (what came in), decide (what was chosen),
    result (what happened).

    Args:
        hook_name: Hook or module name (e.g., "session_start")
        phase: Decision phase — "receive", "decide", or "result"
        summary: One-line description (e.g., "source=clear, session=a1b2c3d4")
        inputs: Input data relevant to this phase
        decision: The decision made (for "decide" phase)
        reasoning: Why this decision was made
        component: Log component tag (default: "diag")
        data: Extra data to merge into the structured entry
    """
    diag_data: Dict[str, Any] = {"phase": phase}
    if inputs is not None:
        diag_data["inputs"] = inputs
    if decision is not None:
        diag_data["decision"] = decision
    if reasoning is not None:
        diag_data["reasoning"] = reasoning
    if data is not None and isinstance(data, dict):
        diag_data.update(data)
    hook_log(
        "debug",
        hook_name,
        f"[DIAG:{phase}] {summary}",
        component=component,
        data=diag_data,
    )


def log_hook_error(
    hook_name: str,
    error: Exception,
    hook_event: str = "unknown",
    traceback_str: str = "",
) -> None:
    """Backward-compatible wrapper matching the old hook_utils.log_hook_error signature.

    Delegates to hook_log("error", ...) with the same behavior:
    - Message capped at 200 chars, newlines stripped
    - Never raises

    Args:
        hook_name: Name of the hook
        error: The exception that occurred
        hook_event: Hook event type (e.g., "PreToolUse")
        traceback_str: Optional formatted traceback
    """
    msg = str(error).replace("\n", " ").replace("\r", "")[:200]
    err_type = type(error).__name__
    hook_log(
        "error",
        hook_name,
        f"[{hook_event}] {err_type}: {msg}",
        traceback_str=traceback_str,
        stderr=True,
    )
