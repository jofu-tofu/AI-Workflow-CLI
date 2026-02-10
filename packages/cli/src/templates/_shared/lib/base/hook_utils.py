"""Common utilities for hook scripts.

Provides standardized boilerplate for:
- Path setup for imports
- JSON parsing from stdin
- Hook payload validation
- Error handling decorators
"""

import json
import os
import sys
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, Optional, TypeVar

from .logger import log_hook_error, hook_log, log_debug, log_info, log_warn, log_error, log_diagnostic, set_context_path, set_session_id


# Context window baseline: tokens not visible in hook data
# (system prompt, tools, MCP tokens)
# See: https://github.com/anthropics/claude-code/issues/13783
CONTEXT_BASELINE_TOKENS = 22_600
DEFAULT_CONTEXT_WINDOW_SIZE = 200_000


def parse_context_window(hook_input: dict) -> tuple:
    """Parse context window from hook input.

    Returns (tokens_used, max_tokens) or (None, None).
    tokens_used includes baseline offset for system prompt/tools.
    """
    context_window = hook_input.get("context_window")
    if not context_window:
        return None, None
    current_usage = context_window.get("current_usage")
    if not current_usage:
        return None, None
    cache_read = current_usage.get("cache_read_input_tokens", 0) or 0
    input_tokens = current_usage.get("input_tokens", 0) or 0
    cache_creation = current_usage.get("cache_creation_input_tokens", 0) or 0
    output_tokens = current_usage.get("output_tokens", 0) or 0
    content_tokens = cache_read + input_tokens + cache_creation + output_tokens
    tokens_used = content_tokens + CONTEXT_BASELINE_TOKENS
    max_tokens = context_window.get("context_window_size") or DEFAULT_CONTEXT_WINDOW_SIZE
    return tokens_used, max_tokens


def get_context_percent_remaining(hook_input: dict) -> tuple:
    """Get context percentage remaining with context.json fallback.

    Tries two sources in order:
    1. Hook input context_window data (most accurate, real-time)
    2. context.json remaining_percentage (written by status_line.py)

    Returns:
        (percent_remaining, tokens_used, max_tokens) where tokens_used and
        max_tokens may be None if data came from context.json fallback.
        Returns (None, None, None) if no data available from either source.
    """
    # Source 1: Hook input (most accurate)
    tokens_used, max_tokens = parse_context_window(hook_input)
    if tokens_used is not None and max_tokens is not None and max_tokens > 0:
        remaining = max_tokens - tokens_used
        percent_remaining = max(0, min(100, int((remaining / max_tokens) * 100)))
        return percent_remaining, tokens_used, max_tokens

    # Source 2: context.json fallback (written by status_line.py)
    try:
        from .utils import project_dir
        from ..context.context_store import get_context_by_session_id

        session_id = hook_input.get("session_id")
        if session_id:
            project_root = project_dir(hook_input)
            context = get_context_by_session_id(session_id, project_root)
            if context and context.last_session:
                pct = context.last_session.get("context_remaining_pct")
                if pct is not None:
                    return pct, None, None
    except Exception:
        pass  # Fallback failed — degrade gracefully

    return None, None, None


# Type variable for generic decorators
F = TypeVar('F', bound=Callable[..., Any])

# Event metadata stash — populated by load_hook_input(), read by run_hook()
_last_hook_event: Optional[str] = None
_last_tool_name: Optional[str] = None
_last_session_id: Optional[str] = None


def load_hook_input() -> Optional[Dict[str, Any]]:
    """
    Load and parse JSON from stdin.

    Returns:
        Parsed JSON dict, or None if stdin is empty or invalid JSON
    """
    global _last_hook_event, _last_tool_name, _last_session_id
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            return None
        result = json.loads(input_data)
        if isinstance(result, dict):
            _last_hook_event = result.get("hook_event_name")
            _last_tool_name = result.get("tool_name")
            _last_session_id = result.get("session_id")
        return result
    except json.JSONDecodeError:
        return None


def validate_hook_event(
    payload: Dict[str, Any],
    expected_event: str,
    expected_tool: Optional[str] = None
) -> bool:
    """
    Validate hook event type and optional tool name.

    Args:
        payload: Hook payload from stdin
        expected_event: Expected hook_event_name (e.g., "PostToolUse", "PreToolUse")
        expected_tool: Optional expected tool_name (e.g., "TaskCreate")

    Returns:
        True if payload matches expected event/tool, False otherwise
    """
    if payload.get("hook_event_name") != expected_event:
        return False
    if expected_tool and payload.get("tool_name") != expected_tool:
        return False
    return True


def get_tool_input(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract and validate tool_input from payload.

    Args:
        payload: Hook payload from stdin

    Returns:
        tool_input dict, or None if missing/invalid
    """
    tool_input = payload.get("tool_input", {})
    return tool_input if isinstance(tool_input, dict) else None


def check_skip_persistence(payload: Dict[str, Any], hook_name: str = "hook") -> bool:
    """
    Check if persistence should be skipped based on metadata flags.

    Args:
        payload: Hook payload from stdin
        hook_name: Name of hook for logging

    Returns:
        True if skip_persistence flag is set, False otherwise
    """
    tool_input = get_tool_input(payload)
    if not tool_input:
        return False

    metadata = tool_input.get("metadata", {})
    if isinstance(metadata, dict) and metadata.get("skip_persistence"):
        log_debug(hook_name, "Skipping persistence (skip_persistence flag set)")
        return True
    return False


def safe_hook_main(hook_name: str) -> Callable[[F], F]:
    """
    Decorator for hook main functions with standard error handling.

    Catches exceptions, logs them to stderr, and returns 0 (non-blocking).

    Args:
        hook_name: Name of hook for error messages

    Returns:
        Decorator function

    Example:
        @safe_hook_main("my_hook")
        def main() -> int:
            # ... hook logic ...
            return 0
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except json.JSONDecodeError as e:
                import traceback
                tb = traceback.format_exc()
                log_hook_error(hook_name, e, traceback_str=tb)
                log_error(hook_name, f"JSON decode error: {e}")
                return 0
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                log_hook_error(hook_name, e, traceback_str=tb)
                log_error(hook_name, f"Unexpected error: {e}", traceback_str=tb)
                return 0
        return wrapper  # type: ignore
    return decorator


def emit_context(additional_context: str, ensure_ascii: bool = False) -> None:
    """Emit hookSpecificOutput with additionalContext to stdout.

    Args:
        additional_context: Context string to inject into Claude's context
        ensure_ascii: If True, escape non-ASCII characters in JSON output
    """
    out = {
        "hookSpecificOutput": {
            "additionalContext": additional_context,
        }
    }
    print(json.dumps(out, ensure_ascii=ensure_ascii))


def emit_context_and_block(
    additional_context: str,
    reason: str,
    ensure_ascii: bool = True,
) -> None:
    """Emit hookSpecificOutput that denies the tool call with context and reason.

    Args:
        additional_context: Context string to inject into Claude's context
        reason: Reason shown to Claude for why the tool call was denied
        ensure_ascii: If True, escape non-ASCII characters in JSON output
    """
    out = {
        "hookSpecificOutput": {
            "additionalContext": additional_context,
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(out, ensure_ascii=ensure_ascii))


def _detect_template(script_path: str = "") -> str:
    """Auto-detect template origin from the hook script path.

    Returns "shared", a template name (e.g., "cc-native"), or "unknown".
    """
    import re
    path = (script_path or (sys.argv[0] if sys.argv else "")).replace("\\", "/")
    if "/_shared/hooks/" in path or path.startswith("_shared/hooks/"):
        return "shared"
    match = re.search(r'_([a-z][a-z0-9-]*)/hooks/', path)
    if match:
        return match.group(1)  # e.g., "cc-native"
    return "unknown"


def run_hook(main_func: Callable[[], int], hook_name: str = "unknown") -> None:
    """
    Standard hook entry point wrapper with lifecycle logging.

    Logs HOOK_START before calling main, HOOK_END after completion.
    Catches unhandled exceptions and logs them before exiting cleanly.

    Args:
        main_func: Hook main function that returns exit code
        hook_name: Name of the hook for error logging

    Example:
        if __name__ == "__main__":
            run_hook(main, "my_hook")
    """
    import time
    start_time = time.monotonic()
    template = _detect_template()
    event = _last_hook_event or "unknown"
    tool = _last_tool_name

    # Wire session_id into logger so all log entries carry it
    if _last_session_id:
        set_session_id(_last_session_id)

    # HOOK_START
    start_data: Dict[str, Any] = {"lifecycle": "start", "template": template, "event": event}
    if tool:
        start_data["tool"] = tool
    log_info(hook_name, "HOOK_START", data=start_data)

    exit_code = 0
    status = "success"
    error_info = None

    try:
        result = main_func()
        exit_code = result if isinstance(result, int) else 0
        status = "blocked" if exit_code != 0 else "success"
    except SystemExit as e:
        exit_code = e.code if isinstance(e.code, int) else (1 if e.code else 0)
        status = "blocked" if exit_code != 0 else "success"
    except Exception as e:
        import traceback
        exit_code = 0  # Non-blocking
        status = "error"
        error_info = (e, traceback.format_exc())

    # HOOK_END
    duration_ms = round((time.monotonic() - start_time) * 1000, 1)
    end_data: Dict[str, Any] = {
        "lifecycle": "end", "status": status,
        "duration_ms": duration_ms, "exit_code": exit_code,
        "template": template,
    }
    end_event = _last_hook_event or event  # Re-read after main() populated it
    end_tool = _last_tool_name or tool
    end_data["event"] = end_event
    if end_tool:
        end_data["tool"] = end_tool
    if error_info:
        e, tb = error_info
        end_data["error_type"] = type(e).__name__
        log_hook_error(hook_name, e, traceback_str=tb)
        log_error(hook_name, f"HOOK_END: {e}", data=end_data, traceback_str=tb)
    elif status == "blocked":
        log_warn(hook_name, "HOOK_END", data=end_data)
    else:
        log_info(hook_name, "HOOK_END", data=end_data)

    raise SystemExit(exit_code)
