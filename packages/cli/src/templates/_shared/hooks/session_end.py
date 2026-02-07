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
import hashlib
import subprocess
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input, log_debug, log_info, log_warn, log_error, log_diagnostic
from lib.base.utils import now_iso, project_dir
from lib.context.context_store import get_context_by_session_id, save_state
from lib.context.plan_manager import find_latest_plan, normalize_plan_content, generate_plan_id, extract_plan_anchors


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
        log_warn("session_end", f"Git state capture error (non-fatal): {e}")

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
            log_debug("session_end", "No session_id, skipping")
            return

        log_info("session_end", f"Session ending: {session_id[:8]}... reason={source}")
        log_diagnostic("session_end", "receive", f"session={session_id[:8]}, source={source}",
                        inputs={"session_id": session_id[:12], "source": source})

        # Find context bound to this session
        state = get_context_by_session_id(session_id, project_root)
        if not state:
            log_debug("session_end", "No context bound to this session, skipping")
            return

        log_info("session_end", f"Found context: {state.id}")

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

        # Fallback: assign plan fields if PostToolUse:ExitPlanMode didn't fire.
        # When ExitPlanMode triggers /clear, the session terminates before PostToolUse
        # hooks can run, so plan_accepted.py never fires. Detect this by checking
        # for an archived plan that hasn't been assigned yet.
        if not state.plan_hash:
            latest_plan_path = find_latest_plan(state.id, project_root)
            if latest_plan_path:
                try:
                    content = Path(latest_plan_path).read_text(encoding="utf-8")
                    normalized = normalize_plan_content(content)
                    state.plan_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]
                    state.plan_path = latest_plan_path
                    state.plan_signature = content[:200]
                    state.plan_id = generate_plan_id()
                    state.plan_anchors = extract_plan_anchors(content)
                    state.plan_consumed = False
                    log_info("session_end", f"Fallback: assigned archived plan for {state.id} (hash: {state.plan_hash})")
                except Exception as e:
                    log_warn("session_end", f"Fallback plan assignment failed: {e}")

        # If a plan is assigned, not yet consumed, and mode is active, stage it for next session
        if state.plan_hash and state.mode == "active" and not state.plan_consumed:
            state.mode = "has_plan"
            log_info("session_end", f"Staged plan for next session: {state.id} -> has_plan")
        elif state.plan_hash and state.mode == "active" and state.plan_consumed:
            log_debug("session_end", f"Plan already consumed for {state.id}, not re-staging")
            log_diagnostic("session_end", "decide", f"Staging plan for {state.id}",
                            decision="stage_plan", reasoning="plan_hash exists and mode was active",
                            inputs={"plan_hash": state.plan_hash, "mode_transition": "active->has_plan"})

        if save_state(state, project_root):
            log_info("session_end", f"Saved last_session for {state.id}")
            log_diagnostic("session_end", "result", f"Saved state for {state.id}",
                            decision="saved", inputs={"context_id": state.id, "mode": state.mode,
                                                       "has_plan_hash": bool(state.plan_hash),
                                                       "git_files": len(git_state.get("uncommitted_files", []))})
        else:
            log_error("session_end", f"Failed to save state for {state.id}")

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        from lib.base.hook_utils import log_hook_error
        log_hook_error("session_end", e, "SessionEnd", traceback_str=tb)


if __name__ == "__main__":
    from lib.base.hook_utils import run_hook
    run_hook(main, "session_end")
