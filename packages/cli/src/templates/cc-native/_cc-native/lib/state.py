"""
CC-Native State Management Module.

Handles plan state file operations and iteration tracking for the review process.

State files are stored adjacent to plan files (e.g., ~/.claude/plans/foo.state.json)
to prevent state loss when session IDs change or temp files are cleaned up.
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


# ---------------------------
# Constants
# ---------------------------

DEFAULT_REVIEW_ITERATIONS: Dict[str, int] = {
    "simple": 1,
    "medium": 1,
    "high": 2,
}


# ---------------------------
# Utilities
# ---------------------------

def eprint(*args: Any) -> None:
    """Print to stderr."""
    print(*args, file=sys.stderr)


# ---------------------------
# State File Management
# ---------------------------

def get_state_file_path(plan_path: str) -> Path:
    """Derive state file path from plan file path.

    The state file is stored adjacent to the plan file with a .state.json extension.
    This prevents state loss when session IDs change or temp files are cleaned up.

    Example: ~/.claude/plans/foo.md -> ~/.claude/plans/foo.state.json
    """
    plan_file = Path(plan_path)
    return plan_file.with_suffix('.state.json')


def load_state(plan_path: str) -> Optional[Dict[str, Any]]:
    """Load state file for this plan if it exists."""
    state_file = get_state_file_path(plan_path)

    if not state_file.exists():
        return None

    try:
        return json.loads(state_file.read_text(encoding="utf-8"))
    except Exception as e:
        eprint(f"[state] Failed to read state file: {e}")
        return None


def save_state(plan_path: str, state: Dict[str, Any]) -> bool:
    """Save state file for this plan.

    Returns True on success, False on failure.
    """
    state_file = get_state_file_path(plan_path)
    try:
        state_file.write_text(json.dumps(state, indent=2), encoding="utf-8")
        return True
    except Exception as e:
        eprint(f"[state] Failed to save state file: {e}")
        return False


def delete_state(plan_path: str) -> bool:
    """Delete state file after successful archive.

    Returns True if deleted or didn't exist, False on error.
    """
    state_file = get_state_file_path(plan_path)
    try:
        if state_file.exists():
            state_file.unlink()
            eprint(f"[state] Deleted state file: {state_file}")
        return True
    except Exception as e:
        eprint(f"[state] Warning: failed to delete state file: {e}")
        return False


# ---------------------------
# Iteration State Management
# ---------------------------

def get_iteration_state(
    state: Dict[str, Any],
    complexity: str,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Get or initialize iteration state based on complexity.

    Args:
        state: The current plan state dict
        complexity: Plan complexity level (simple/medium/high)
        config: Optional config dict with reviewIterations settings

    Returns:
        Iteration dict with: current, max, complexity, history
    """
    if "iteration" in state:
        # Return existing iteration state
        return state["iteration"]

    # Initialize new iteration state
    review_iterations = DEFAULT_REVIEW_ITERATIONS.copy()
    if config:
        review_iterations.update(config.get("reviewIterations", {}))
    max_iterations = review_iterations.get(complexity, 1)

    return {
        "current": 1,
        "max": max_iterations,
        "complexity": complexity,
        "history": [],
    }


def update_iteration_state(
    state: Dict[str, Any],
    iteration: Dict[str, Any],
    plan_hash: str,
    verdict: str,
) -> Dict[str, Any]:
    """Record review result in iteration history and update state.

    Args:
        state: The current plan state dict
        iteration: The iteration state dict
        plan_hash: Hash of the current plan content
        verdict: Review verdict (pass/warn/fail)

    Returns:
        Updated state dict with iteration data
    """
    # Add this review to history
    iteration["history"].append({
        "hash": plan_hash,
        "verdict": verdict,
        "timestamp": datetime.now().isoformat(),
    })

    # Update state with iteration data
    state["iteration"] = iteration
    return state


def should_continue_iterating(
    iteration: Dict[str, Any],
    verdict: str,
    config: Optional[Dict[str, Any]] = None,
) -> bool:
    """Determine if more review iterations are needed.

    Args:
        iteration: The iteration state dict
        verdict: Current review verdict
        config: Optional config dict with earlyExitOnAllPass setting

    Returns:
        True if more iterations needed, False otherwise
    """
    current = iteration.get("current", 1)
    max_iter = iteration.get("max", 1)

    # At or past max iterations - no more iterations
    if current >= max_iter:
        eprint(f"[state] At max iterations ({current}/{max_iter}), no more iterations")
        return False

    # Check early exit on all pass
    early_exit = True
    if config:
        early_exit = config.get("earlyExitOnAllPass", True)
    if early_exit and verdict == "pass":
        eprint(f"[state] All reviewers passed and earlyExitOnAllPass=true, exiting early")
        return False

    # More iterations available and verdict is not pass (or early exit disabled)
    eprint(f"[state] Continuing to next iteration ({current + 1}/{max_iter}), verdict={verdict}")
    return True
