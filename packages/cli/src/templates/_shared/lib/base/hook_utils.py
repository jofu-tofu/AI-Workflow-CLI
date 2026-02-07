"""Common utilities for hook scripts.

Provides standardized boilerplate for:
- Path setup for imports
- JSON parsing from stdin
- Hook payload validation
- Error handling decorators
"""

import json
import sys
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, Optional, TypeVar

from .utils import eprint

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
                eprint(f"[{hook_name}] JSON decode error: {e}")
                return 0
            except Exception as e:
                eprint(f"[{hook_name}] Unexpected error: {e}")
                import traceback
                eprint(traceback.format_exc())
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


def run_hook(main_func: Callable[[], int]) -> None:
    """
    Standard hook entry point wrapper.

    Calls main function and exits with its return code.

    Args:
        main_func: Hook main function that returns exit code

    Example:
        if __name__ == "__main__":
            run_hook(main)
    """
    raise SystemExit(main_func())
