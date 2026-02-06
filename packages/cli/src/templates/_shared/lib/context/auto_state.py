"""Auto-state save/load module for session handoff.

Captures structural session state (git state, transcript path, mode)
for zero-friction session restoration. Does NOT capture Claude's
subjective state — that comes from the manual /handoff flow.

Auto-state file: _output/contexts/{context_id}/auto-state.json
Overwritten each save. This is a cache — if corrupted, system degrades gracefully.
"""
import json
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

from ..base.atomic_write import atomic_write
from ..base.constants import get_auto_state_path, get_context_dir
from ..base.utils import eprint, now_iso


AUTO_STATE_VERSION = 1


def capture_git_state(project_root: Path = None) -> Dict[str, Any]:
    """
    Capture current git state for auto-state snapshot.

    Returns:
        Dict with branch, uncommitted_files, last_commit_short.
        Empty dict on failure (non-git repo, git not available).
    """
    if project_root is None:
        project_root = Path.cwd()

    cwd = str(project_root)

    try:
        # Get current branch
        branch_result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5, cwd=cwd
        )
        branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"

        # Get uncommitted files (modified + untracked, limited)
        status_result = subprocess.run(
            ["git", "status", "--porcelain", "--short"],
            capture_output=True, text=True, timeout=5, cwd=cwd
        )
        uncommitted = []
        if status_result.returncode == 0:
            for line in status_result.stdout.strip().splitlines()[:20]:
                # Format: "XY filename" — extract just filename
                if len(line) > 3:
                    uncommitted.append(line[3:].strip())

        # Get last commit short hash + message
        log_result = subprocess.run(
            ["git", "log", "-1", "--oneline"],
            capture_output=True, text=True, timeout=5, cwd=cwd
        )
        last_commit = log_result.stdout.strip() if log_result.returncode == 0 else ""

        return {
            "branch": branch,
            "uncommitted_files": uncommitted,
            "last_commit_short": last_commit,
        }
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        eprint(f"[auto_state] Git capture failed: {e}")
        return {}


def save_auto_state(
    context_id: str,
    session_id: str,
    save_reason: str,
    project_root: Path = None,
    in_flight_mode: str = "none",
    plan_path: Optional[str] = None,
    handoff_path: Optional[str] = None,
    transcript_path: Optional[str] = None,
) -> bool:
    """
    Save auto-state.json for a context.

    Captures structural state for session restoration. Overwrites
    any existing auto-state file.

    Args:
        context_id: Context identifier
        session_id: Current session ID
        save_reason: Why state was saved (session_end, pre_compact, progressive)
        project_root: Project root directory
        in_flight_mode: Current in-flight mode (none, planning, implementing, etc.)
        plan_path: Path to active plan file (if any)
        handoff_path: Path to latest handoff (if any)
        transcript_path: Path to transcript file (if available)

    Returns:
        True if saved successfully
    """
    auto_state_path = get_auto_state_path(context_id, project_root)

    # Ensure parent directory exists
    auto_state_path.parent.mkdir(parents=True, exist_ok=True)

    git_state = capture_git_state(project_root)

    state = {
        "version": AUTO_STATE_VERSION,
        "context_id": context_id,
        "session_id": session_id,
        "saved_at": now_iso(),
        "save_reason": save_reason,
        "in_flight_mode": in_flight_mode,
        "plan_path": plan_path,
        "latest_handoff_path": handoff_path,
        "git_state": git_state,
        "transcript_path": transcript_path,
    }

    try:
        content = json.dumps(state, indent=2, ensure_ascii=False)
        success, error = atomic_write(auto_state_path, content)
        if success:
            eprint(f"[auto_state] Saved auto-state for {context_id} (reason: {save_reason})")
            return True
        else:
            eprint(f"[auto_state] Failed to save: {error}")
            return False
    except Exception as e:
        eprint(f"[auto_state] Error saving auto-state: {e}")
        return False


def load_auto_state(context_id: str, project_root: Path = None) -> Optional[Dict[str, Any]]:
    """
    Load auto-state.json for a context.

    Returns None if file doesn't exist or is corrupted.
    Graceful degradation — callers should handle None.

    Args:
        context_id: Context identifier
        project_root: Project root directory

    Returns:
        Auto-state dict or None
    """
    auto_state_path = get_auto_state_path(context_id, project_root)

    if not auto_state_path.exists():
        return None

    try:
        content = auto_state_path.read_text(encoding="utf-8")
        state = json.loads(content)

        # Version check
        if state.get("version") != AUTO_STATE_VERSION:
            eprint(f"[auto_state] Version mismatch: expected {AUTO_STATE_VERSION}, got {state.get('version')}")
            return None

        return state
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as e:
        eprint(f"[auto_state] Failed to load auto-state: {e}")
        return None
