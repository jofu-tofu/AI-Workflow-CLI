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

from .utils import eprint

_MAX_LOG_SIZE = 512 * 1024  # 512KB
_TRUNCATE_TO = 256 * 1024   # 256KB


def log_hook_error(hook_name: str, error: Exception, hook_event: str = "unknown", traceback_str: str = "") -> None:
    """Write a summary-level error to _output/hook-errors.log.

    Format: [ISO-timestamp] [hook_name] [hook_event] ErrorType: message
    Optionally followed by full traceback if traceback_str is provided.
    Message capped at 200 chars, newlines stripped.
    File truncated to most recent 256KB when it exceeds 512KB.
    Opt-out via HOOK_ERROR_LOG_DISABLE=1 env var.
    Never raises — wrapped in try/except pass.
    """
    try:
        if os.environ.get("HOOK_ERROR_LOG_DISABLE") == "1":
            return

        # Build log line
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S%z")
        err_type = type(error).__name__
        msg = str(error).replace("\n", " ").replace("\r", "")[:200]
        line = f"[{ts}] [{hook_name}] [{hook_event}] {err_type}: {msg}\n"

        # Append full traceback if provided
        if traceback_str:
            line += traceback_str.rstrip() + "\n"

        # Resolve _output relative to project root (best effort)
        _env_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
        project_root = Path(_env_dir) if _env_dir else Path.cwd()
        log_path = project_root / "_output" / "hook-errors.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)

        # Size guard: truncate to most recent _TRUNCATE_TO bytes
        if log_path.exists() and log_path.stat().st_size > _MAX_LOG_SIZE:
            data = log_path.read_bytes()
            log_path.write_bytes(data[-_TRUNCATE_TO:])

        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass  # Never crash


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


def load_hook_input() -> Optional[Dict[str, Any]]:
    """
    Load and parse JSON from stdin.

    Returns:
        Parsed JSON dict, or None if stdin is empty or invalid JSON
    """
    try:
        input_data = sys.stdin.read().strip()
        if not input_data:
            return None
        return json.loads(input_data)
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
        eprint(f"[{hook_name}] Skipping persistence (skip_persistence flag set)")
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
                eprint(f"[{hook_name}] JSON decode error: {e}")
                return 0
            except Exception as e:
                import traceback
                tb = traceback.format_exc()
                log_hook_error(hook_name, e, traceback_str=tb)
                eprint(f"[{hook_name}] Unexpected error: {e}")
                eprint(tb)
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


def run_hook(main_func: Callable[[], int], hook_name: str = "unknown") -> None:
    """
    Standard hook entry point wrapper.

    Calls main function and exits with its return code.
    Catches unhandled exceptions and logs them before exiting cleanly.

    Args:
        main_func: Hook main function that returns exit code
        hook_name: Name of the hook for error logging

    Example:
        if __name__ == "__main__":
            run_hook(main, "my_hook")
    """
    try:
        raise SystemExit(main_func())
    except SystemExit:
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log_hook_error(hook_name, e, traceback_str=tb)
        eprint(f"[{hook_name}] FATAL: {e}")
        eprint(tb)
        raise SystemExit(0)
