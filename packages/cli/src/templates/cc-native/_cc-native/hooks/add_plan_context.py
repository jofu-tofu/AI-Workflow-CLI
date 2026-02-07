#!/usr/bin/env python3
"""
Plan context hook - handles both question marking and plan write enforcement.

Registered for two PostToolUse/PreToolUse events:
- PostToolUse: AskUserQuestion — marks that questions were asked this session.
- PreToolUse: Write — enforces questions before plan write.

Phase B of two-phase question system:
- If AskUserQuestion was NOT called this session: BLOCK the Write
  and inject the non-obvious questions prompt.
- If AskUserQuestion WAS called: ALLOW and inject evaluation context.

Fail-safe: Any error skips enforcement and allows the write.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict

# Add lib directories to path for imports
_hook_dir = Path(__file__).resolve().parent
_cc_native_lib_dir = _hook_dir.parent / "lib"
_shared_lib_dir = _hook_dir.parent.parent / "_shared" / "lib"
sys.path.insert(0, str(_cc_native_lib_dir))
sys.path.insert(0, str(_shared_lib_dir))

from utils import (
    eprint,
    mark_questions_asked,
    was_questions_asked,
    project_dir,
)
from base.hook_utils import emit_context, emit_context_and_block
from templates.plan_context import get_evaluation_context_reminder


def is_plan_file_write(payload: Dict[str, Any]) -> bool:
    """Check if this Write targets a plan file."""
    tool_input = payload.get("tool_input", {})
    file_path = str(tool_input.get("file_path", ""))
    return ".claude/plans/" in file_path.replace("\\", "/") and file_path.endswith(".md")


def load_plan_context_config(proj_dir: Path) -> Dict[str, Any]:
    """Load planContext config with defaults."""
    config_path = proj_dir / "_cc-native" / "config.json"
    defaults = {"enabled": True}

    if not config_path.exists():
        return defaults
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        plan_ctx = config.get("planContext", {})
        return {**defaults, **plan_ctx}
    except Exception:
        return defaults


CONTEXT_REMINDER = get_evaluation_context_reminder()
PHASE_B_ENFORCEMENT = (
    "You must ask non-obvious questions via AskUserQuestion before writing the plan. "
    "See the question guidance injected earlier in this session by plan_questions_early. "
    "This surfaces trade-offs and constraints that code exploration alone cannot reveal."
)


def inject_evaluation_context() -> int:
    """Inject evaluation context reminder without blocking."""
    emit_context(CONTEXT_REMINDER)
    return 0


def block_with_questions_prompt() -> int:
    """Block Write until non-obvious questions have been asked this session."""
    emit_context_and_block(
        PHASE_B_ENFORCEMENT,
        "Ask non-obvious questions via AskUserQuestion before writing the plan. "
        "This surfaces trade-offs and constraints that code exploration alone cannot reveal."
    )
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # Fail-safe

    tool_name = payload.get("tool_name")

    # PostToolUse: AskUserQuestion — mark that questions were asked
    if tool_name == "AskUserQuestion":
        session_id = str(payload.get("session_id", ""))
        if session_id:
            mark_questions_asked(session_id)
            eprint(f"[add_plan_context] Marked questions asked for session {session_id[:8]}...")
        return 0

    if tool_name != "Write":
        return 0

    if not is_plan_file_write(payload):
        return 0

    # Load config
    proj = project_dir(payload)
    config = load_plan_context_config(proj)

    # Check if feature is disabled
    if not config.get("enabled", True):
        eprint("[add_plan_context] planContext disabled in config")
        return 0

    # Get session_id
    session_id = payload.get("session_id")

    # Fail-safe: skip enforcement if no session_id
    if not session_id:
        eprint("[add_plan_context] No session_id, skipping enforcement")
        return inject_evaluation_context()

    session_id_str = str(session_id)

    # Check if questions were asked this session
    if was_questions_asked(session_id_str):
        eprint("[add_plan_context] Questions asked, allowing write with eval context")
        return inject_evaluation_context()

    # Questions NOT asked: block and inject Phase B prompt
    eprint("[add_plan_context] Questions not asked yet - blocking plan write")
    return block_with_questions_prompt()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        from base.hook_utils import log_hook_error
        log_hook_error("add_plan_context", e, "PreToolUse", traceback_str=tb)
        raise SystemExit(0)
