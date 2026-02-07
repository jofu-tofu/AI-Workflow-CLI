#!/usr/bin/env python3
"""SessionEnd hook - saves session state to state.json.

Fires when session terminates (quit, /clear, logout). Saves last_session
data directly to state.json for restoration on next session.

Hook input (from Claude Code):
{
    "hook_event_name": "SessionEnd",
    "session_id": "abc123",
    "source": "prompt_input_exit",  # or "clear", "logout", "compact"
    "transcript_path": "/path/to/transcript.jsonl",
    "cwd": "/path/to/project",
    ...
}

Hook output:
- Silent (no stdout output needed for SessionEnd)
- Logs to stderr for debugging
"""
import subprocess
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input
from lib.base.utils import eprint, now_iso, project_dir
from lib.context.context_store import get_context_by_session_id, save_state


def _get_git_state(project_root: Path) -> dict:
    """Capture current git state for restoration."""
    git_state = {}
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, cwd=str(project_root), timeout=5,
        )
        if result.returncode == 0:
            git_state["branch"] = result.stdout.strip()

        result = subprocess.run(
            ["git", "diff", "--name-only"],
            capture_output=True, text=True, cwd=str(project_root), timeout=5,
        )
        if result.returncode == 0:
            files = [f for f in result.stdout.strip().split("\n") if f]
            git_state["uncommitted_files"] = files

        result = subprocess.run(
            ["git", "log", "-1", "--oneline"],
            capture_output=True, text=True, cwd=str(project_root), timeout=5,
        )
        if result.returncode == 0:
            git_state["last_commit_short"] = result.stdout.strip()
    except Exception as e:
        eprint(f"[session_end] Git state capture error (non-fatal): {e}")

    return git_state


def main():
    """Save session state to state.json."""
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        session_id = hook_input.get("session_id", "")
        source = hook_input.get("source", "other")
        transcript_path = hook_input.get("transcript_path")
        project_root = project_dir(hook_input)

        if not session_id:
            eprint("[session_end] No session_id, skipping")
            return

        eprint(f"[session_end] Session ending: {session_id[:8]}... reason={source}")

        # Find context bound to this session
        state = get_context_by_session_id(session_id, project_root)
        if not state:
            eprint("[session_end] No context bound to this session, skipping")
            return

        eprint(f"[session_end] Found context: {state.id}")

        # Capture git state
        git_state = _get_git_state(project_root)

        # Save last_session directly to state.json
        state.last_session = {
            "session_id": session_id,
            "save_reason": source,
            "saved_at": now_iso(),
            "transcript_path": transcript_path,
            "git_state": git_state,
        }
        state.last_active = now_iso()

        if save_state(state, project_root):
            eprint(f"[session_end] Saved last_session for {state.id}")
        else:
            eprint(f"[session_end] Failed to save state for {state.id}")

    except Exception as e:
        from lib.base.hook_utils import log_hook_error
        log_hook_error("session_end", e, "SessionEnd")
        eprint(f"[session_end] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
