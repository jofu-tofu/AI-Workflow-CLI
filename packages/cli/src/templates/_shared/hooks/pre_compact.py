#!/usr/bin/env python3
"""PreCompact hook - saves auto-state before context compaction.

Critical: saves state before context compaction destroys token history.
After compaction, SessionStart fires with source="compact" and the
restored auto-state provides continuity context.

Hook input (from Claude Code):
{
    "hook_event_name": "PreCompact",
    "session_id": "abc123",
    "transcript_path": "/path/to/transcript.jsonl",
    "cwd": "/path/to/project",
    ...
}

Hook output:
- Silent (no stdout output needed)
- Logs to stderr for debugging
"""
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input
from lib.base.utils import eprint, project_dir
from lib.context.context_store import get_context_by_session_id, save_state


def main():
    """Save auto-state before compaction."""
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        session_id = hook_input.get("session_id", "")
        transcript_path = hook_input.get("transcript_path")
        project_root = project_dir(hook_input)

        if not session_id:
            eprint("[pre_compact] No session_id, skipping")
            return

        eprint(f"[pre_compact] Saving state before compaction: {session_id[:8]}...")

        # Find context bound to this session
        context = get_context_by_session_id(session_id, project_root)
        if not context:
            eprint("[pre_compact] No context bound to this session, skipping")
            return

        # Save last_session snapshot directly to state.json
        import subprocess
        git_state = {}
        try:
            branch = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                capture_output=True, text=True, timeout=5
            )
            git_state["branch"] = branch.stdout.strip() if branch.returncode == 0 else "unknown"

            status = subprocess.run(
                ["git", "status", "--short"],
                capture_output=True, text=True, timeout=5
            )
            if status.returncode == 0 and status.stdout.strip():
                git_state["uncommitted_files"] = [
                    line.split(None, 1)[-1] for line in status.stdout.strip().split("\n")[:10]
                ]

            log = subprocess.run(
                ["git", "log", "-1", "--format=%h %s"],
                capture_output=True, text=True, timeout=5
            )
            if log.returncode == 0:
                git_state["last_commit_short"] = log.stdout.strip()
        except Exception:
            pass

        from lib.base.utils import now_iso
        context.last_session = {
            "session_id": session_id,
            "saved_at": now_iso(),
            "save_reason": "pre_compact",
            "git_state": git_state,
        }
        save_state(context, project_root)
        eprint(f"[pre_compact] State saved for {context.id}")

    except Exception as e:
        from lib.base.hook_utils import log_hook_error
        log_hook_error("pre_compact", e, "PreCompact")
        eprint(f"[pre_compact] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
