#!/usr/bin/env python3
"""
PostToolUse hook - suggests /fresh-perspective when user appears stuck.

Detection patterns:
1. Same error appearing 3+ times
2. Repeated edits to same file without resolution
3. Test failures after multiple fix attempts

Behavior: Suggests (doesn't force) running /fresh-perspective.
Non-blocking - always returns success.

Configuration (in _cc-native/plan-review.config.json):
  "stuckDetection": {
    "enabled": true,           // Set to false to disable entirely
    "errorThreshold": 3,       // Errors before suggesting
    "fileEditThreshold": 4,    // Edits to same file before suggesting
    "testFailureThreshold": 3, // Test failures before suggesting
    "cooldown": 10,            // Tool calls between suggestions
    "maxSuggestions": 3        // Max suggestions per session
  }
"""

import sys

# TODO: Remove this early exit when TypeScript implementation is complete.
# The Python shared library (_shared/lib/) was deleted during the TS migration,
# so all imports from base.hook_utils / base.logger / lib.context fail.
sys.exit(0)

import json
import os
import re
from pathlib import Path
from typing import Any, Dict

# Add lib directories to path for imports
_hook_dir = Path(__file__).resolve().parent
_lib_dir = _hook_dir.parent / "lib"
_shared = _hook_dir.parent.parent / "_shared"
_shared_lib = _shared / "lib"
sys.path.insert(0, str(_lib_dir))
sys.path.insert(0, str(_shared))
sys.path.insert(0, str(_shared_lib))

from base.hook_utils import emit_context
from base.logger import log_debug, log_info, log_warn, log_error
from lib.context.context_store import get_context_by_session_id, save_state


# ---------------------------
# Configuration (defaults, overridden by config.json)
# ---------------------------

DEFAULT_CONFIG = {
    "enabled": True,
    "errorThreshold": 3,
    "fileEditThreshold": 4,
    "testFailureThreshold": 3,
    "cooldown": 10,
    "maxSuggestions": 3,
}


def _int_or_default(value: Any, default: int) -> int:
    """Coerce value to int, return default if not possible.

    Handles string numbers, floats, and invalid types gracefully.
    """
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return default
    return default


def load_config(project_dir: Path) -> Dict[str, Any]:
    """Load stuckDetection config from _cc-native/plan-review.config.json."""
    config_path = project_dir / "_cc-native" / "plan-review.config.json"
    if not config_path.exists():
        return DEFAULT_CONFIG.copy()
    try:
        full_config = json.loads(config_path.read_text(encoding="utf-8"))
        section = full_config.get("stuckDetection", {})
        return {**DEFAULT_CONFIG, **section}
    except Exception as e:
        log_warn("suggest-fresh-perspective", f"Failed to load config: {e}")
        return DEFAULT_CONFIG.copy()


def get_project_dir(payload: Dict[str, Any]) -> Path:
    """Get project directory from payload or environment."""
    p = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    return Path(p)


# ---------------------------
# Compiled patterns (performance optimization)
# ---------------------------

# Single combined pattern for error detection (case-insensitive)
_ERROR_PATTERN = re.compile(r"(error:|failed|exception)", re.IGNORECASE)

# Combined pattern for test failures
_TEST_FAILURE_PATTERN = re.compile(
    r"(\d+\s+failed|FAIL\s|✗|AssertionError|test.*failed|npm\s+ERR!.*test)",
    re.IGNORECASE,
)

# Pattern for normalizing error messages (line numbers)
_LINE_NUMBER_PATTERN = re.compile(r":\d+")
_MULTI_DIGIT_PATTERN = re.compile(r"\d{2,}")
_PATH_PATTERN = re.compile(r"[/\\][^\s/\\]+[/\\]")


# ---------------------------
# State management (state.json integration)
# ---------------------------


def _get_cc_native_state(session_id: str, project_root: Path) -> Dict[str, Any]:
    """Get cc_native state from context state.json.

    Returns the cc_native dict or empty dict if not found.
    """
    try:
        state = get_context_by_session_id(session_id, project_root)
        if state and hasattr(state, "cc_native"):
            return state.cc_native
    except Exception:
        pass
    return {}


def _save_cc_native_state(
    session_id: str, project_root: Path, cc_native_data: Dict[str, Any]
) -> bool:
    """Save cc_native state to context state.json.

    Returns True on success, False on failure.
    """
    try:
        state = get_context_by_session_id(session_id, project_root)
        if state:
            state.cc_native = cc_native_data
            save_state(state, project_root)
            return True
    except Exception as e:
        log_warn("suggest-fresh-perspective", f"Failed to save cc_native state: {e}")
    return False


def load_stuck_state(session_id: str, project_root: Path) -> Dict[str, Any]:
    """Load stuck detection state for this session from state.json."""
    cc_native = _get_cc_native_state(session_id, project_root)
    stuck_state = cc_native.get("stuck_detection", {})
    return {
        "error_hashes": stuck_state.get("error_hashes", {}),
        "file_edits": stuck_state.get("file_edits", {}),
        "test_failures": stuck_state.get("test_failures", 0),
        "tool_calls_since_suggestion": stuck_state.get(
            "tool_calls_since_suggestion", 0
        ),
        "suggestion_count": stuck_state.get("suggestion_count", 0),
    }


def save_stuck_state(
    session_id: str, project_root: Path, stuck_state: Dict[str, Any]
) -> None:
    """Save stuck detection state for this session to state.json."""
    try:
        cc_native = _get_cc_native_state(session_id, project_root) or {}
        cc_native["stuck_detection"] = stuck_state
        if not _save_cc_native_state(session_id, project_root, cc_native):
            log_warn(
                "suggest-fresh-perspective",
                f"Failed to save stuck detection state for session {session_id}",
            )
    except Exception as e:
        log_warn(
            "suggest-fresh-perspective", f"Failed to save stuck detection state: {e}"
        )


# ---------------------------
# Detection logic
# ---------------------------


def hash_error(error_text: str) -> str:
    """Create a simple hash of an error message for deduplication.

    Normalizes by removing line numbers and multi-digit numbers,
    but preserves enough context to distinguish different errors.
    """
    # Normalize: remove line numbers, preserve error type
    normalized = _LINE_NUMBER_PATTERN.sub(":N", error_text)
    normalized = _MULTI_DIGIT_PATTERN.sub("N", normalized)
    # Simplify paths but keep some structure
    normalized = _PATH_PATTERN.sub(".../", normalized)
    # Take first 100 chars after normalization
    return normalized[:100]


def detect_repeated_error(
    state: Dict[str, Any], tool_result: str, threshold: int
) -> bool:
    """Check if we're seeing the same error repeatedly.

    Returns True if threshold reached, always updates state.
    """
    if not tool_result:
        return False

    if _ERROR_PATTERN.search(tool_result):
        error_hash = hash_error(tool_result)
        state["error_hashes"][error_hash] = state["error_hashes"].get(error_hash, 0) + 1
        return state["error_hashes"][error_hash] >= threshold

    return False


def detect_repeated_file_edits(
    state: Dict[str, Any], tool_name: str, tool_input: Dict[str, Any], threshold: int
) -> bool:
    """Check if we're editing the same file repeatedly.

    Returns True if threshold reached, always updates state.
    """
    if tool_name != "Edit":
        return False

    # Validate tool_input is a dict
    if not isinstance(tool_input, dict):
        return False

    file_path = tool_input.get("file_path", "")
    if not file_path:
        return False

    state["file_edits"][file_path] = state["file_edits"].get(file_path, 0) + 1
    return state["file_edits"][file_path] >= threshold


def detect_test_failures(
    state: Dict[str, Any], tool_name: str, tool_result: str, threshold: int
) -> bool:
    """Check for repeated test failures.

    Returns True if threshold reached, always updates state.
    """
    if tool_name != "Bash":
        return False

    if _TEST_FAILURE_PATTERN.search(tool_result):
        state["test_failures"] = state.get("test_failures", 0) + 1
        return state["test_failures"] >= threshold

    return False


# ---------------------------
# Main hook logic
# ---------------------------


def should_suggest(state: Dict[str, Any], cooldown: int) -> bool:
    """Check if we're past the cooldown period."""
    return state.get("tool_calls_since_suggestion", 0) >= cooldown


def create_suggestion() -> None:
    """Emit the suggestion via hook utility."""
    emit_context(
        "\n---\n"
        "**Stuck?** You've been working on similar issues for a while. "
        "Consider running `/fresh-perspective` to get an unbiased view of the problem "
        "without code context anchoring your thinking.\n"
        "---\n"
    )


def main() -> int:
    # === FAST PATH: Cheap checks first, no I/O ===

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # Fail-safe

    # 1. Check hook_event_name (cheap dict lookup)
    if payload.get("hook_event_name") != "PostToolUse":
        return 0

    # 2. Check session_id exists (cheap dict lookup)
    session_id = payload.get("session_id")
    if not session_id:
        return 0

    # 3. Check tool_name is relevant (cheap dict lookup)
    # We only care about Edit and Bash - skip everything else
    tool_name = payload.get("tool_name", "")
    if tool_name not in ("Edit", "Bash"):
        return 0

    # === SLOW PATH: Only reached for Edit/Bash tools ===

    # Load configuration (file I/O)
    project_dir = get_project_dir(payload)
    config = load_config(project_dir)

    # Check if feature is disabled
    if not config.get("enabled", True):
        return 0

    tool_input = payload.get("tool_input", {})
    tool_result = payload.get("tool_result", {})

    # Validate tool_input type
    if not isinstance(tool_input, dict):
        tool_input = {}

    # Extract result text
    result_text = ""
    if isinstance(tool_result, dict):
        result_text = str(
            tool_result.get("output", "") or tool_result.get("content", "")
        )
    elif isinstance(tool_result, str):
        result_text = tool_result

    # Load state from state.json
    state = load_stuck_state(session_id, project_dir)

    # Increment tool call counter
    state["tool_calls_since_suggestion"] = (
        state.get("tool_calls_since_suggestion", 0) + 1
    )

    # Get thresholds from config (with type coercion for safety)
    error_threshold = _int_or_default(config.get("errorThreshold"), 3)
    file_edit_threshold = _int_or_default(config.get("fileEditThreshold"), 4)
    test_failure_threshold = _int_or_default(config.get("testFailureThreshold"), 3)
    cooldown = _int_or_default(config.get("cooldown"), 10)
    max_suggestions = _int_or_default(config.get("maxSuggestions"), 3)

    # Run ALL detections (don't short-circuit - each updates state)
    error_detected = detect_repeated_error(state, result_text, error_threshold)
    file_edit_detected = detect_repeated_file_edits(
        state, tool_name, tool_input, file_edit_threshold
    )
    test_failure_detected = detect_test_failures(
        state, tool_name, result_text, test_failure_threshold
    )

    # Save state AFTER all detections have run
    save_stuck_state(session_id, project_dir, state)

    # Check if any detection triggered
    is_stuck = error_detected or file_edit_detected or test_failure_detected

    if is_stuck:
        if error_detected:
            log_info("suggest-fresh-perspective", "Detected repeated error pattern")
        if file_edit_detected:
            log_info("suggest-fresh-perspective", "Detected repeated file edits")
        if test_failure_detected:
            log_info("suggest-fresh-perspective", "Detected repeated test failures")

    # Only suggest if stuck AND past cooldown
    if is_stuck and should_suggest(state, cooldown):
        # Reset cooldown
        state["tool_calls_since_suggestion"] = 0
        state["suggestion_count"] = state.get("suggestion_count", 0) + 1
        save_stuck_state(session_id, project_dir, state)

        # Only suggest up to maxSuggestions times per session
        if state["suggestion_count"] <= max_suggestions:
            log_info(
                "suggest-fresh-perspective",
                f"Suggesting fresh perspective (suggestion #{state['suggestion_count']})",
            )
            create_suggestion()

    return 0


if __name__ == "__main__":
    from base.hook_utils import run_hook

    run_hook(main, "suggest_fresh_perspective")
