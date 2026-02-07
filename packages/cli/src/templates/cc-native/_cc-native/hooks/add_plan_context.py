#!/usr/bin/env python3
"""
Plan context hook - handles question marking, plan Task gating, and plan write enforcement.

Registered for three events:
- PostToolUse: AskUserQuestion — marks that questions were asked this session.
- PreToolUse: Task — blocks Plan subagent spawn until questions are asked (primary gate).
- PreToolUse: Write — enforces questions before plan file write (fallback safety net).

Primary enforcement: PreToolUse:Task with subagent_type=="Plan" creates a hard gate
at the right moment — after exploration, before planning begins. The Write branch
remains as a secondary safety net.

Fail-safe: Any error skips enforcement and allows the action.
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
    mark_questions_asked,
    was_questions_asked,
    project_dir,
)
from base.hook_utils import emit_context, emit_context_and_block
from base.subprocess_utils import is_internal_call
from base.logger import log_debug, log_info, log_warn, log_error, log_diagnostic
from templates.plan_context import get_evaluation_context_reminder


def is_plan_task(payload: Dict[str, Any]) -> bool:
    """Check if this Task call spawns a Plan subagent."""
    tool_input = payload.get("tool_input", {})
    return str(tool_input.get("subagent_type", "")) == "Plan"


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


TASK_ENFORCEMENT_CONTEXT = (
    "STOP. Before spawning a Plan agent, you must ask the user non-obvious questions "
    "via AskUserQuestion. Code exploration reveals WHAT exists — questions reveal WHAT MATTERS.\n\n"
    "Generate 5+ candidate questions across these categories, then keep only 3-4 where "
    "different answers would lead to meaningfully different plans:\n\n"
    "1. INTENT & SUCCESS CRITERIA — What does 'done well' look like? Are there multiple "
    "interpretations of this request? What's a 10 vs a 6?\n\n"
    "2. CONSTRAINTS & HISTORY — Has this been attempted before? Are there off-limits areas, "
    "performance requirements, or security considerations not visible in the code?\n\n"
    "3. TRADE-OFF PREFERENCES — Speed vs thoroughness? Minimal change vs clean architecture? "
    "Backward compatibility vs clean break?\n\n"
    "Frame each question with 2-3 concrete options so the user can choose rather than compose. "
    "Use AskUserQuestion with structured options — never ask questions as inline text."
)

TASK_ENFORCEMENT_REASON = (
    "Ask non-obvious questions via AskUserQuestion before spawning the Plan agent. "
    "This surfaces trade-offs and constraints that code exploration alone cannot reveal."
)


def block_task_with_questions_prompt() -> int:
    """Block Plan Task spawn until non-obvious questions have been asked."""
    emit_context_and_block(TASK_ENFORCEMENT_CONTEXT, TASK_ENFORCEMENT_REASON)
    return 0


def main() -> int:
    # Guard: skip for internal subprocess calls (prevents recursive hook execution)
    if is_internal_call():
        return 0

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # Fail-safe

    tool_name = payload.get("tool_name")
    hook_event = payload.get("hook_event_name", "unknown")
    log_diagnostic("add_plan_context", "receive", f"tool={tool_name}, event={hook_event}",
                    inputs={"tool_name": tool_name, "hook_event": hook_event})

    # PostToolUse: AskUserQuestion — mark that questions were asked
    if tool_name == "AskUserQuestion":
        session_id = str(payload.get("session_id", ""))
        if session_id:
            mark_questions_asked(session_id)
            log_info("add_plan_context", f"Marked questions asked for session {session_id[:8]}...")
        return 0

    # PreToolUse: Task — primary gate: block Plan subagent until questions asked
    if tool_name == "Task":
        if not is_plan_task(payload):
            return 0  # Only gate Plan subagent spawns

        permission_mode = payload.get("permission_mode", "")
        if permission_mode != "plan":
            return 0  # Only enforce during plan mode

        session_id = payload.get("session_id")
        if not session_id:
            log_debug("add_plan_context", "No session_id for Task gate, skipping enforcement")
            return 0

        session_id_str = str(session_id)

        if was_questions_asked(session_id_str):
            log_info("add_plan_context", "Questions asked, allowing Plan Task with eval context")
            log_diagnostic("add_plan_context", "decide", "Questions asked, allowing Plan Task",
                            decision="allow_with_context", reasoning="was_questions_asked=True")
            return inject_evaluation_context()

        # Questions NOT asked: block Plan Task spawn
        log_info("add_plan_context", "Questions not asked - blocking Plan Task spawn")
        log_diagnostic("add_plan_context", "decide", "Questions not asked, blocking Plan Task",
                        decision="block", reasoning="was_questions_asked=False, enforcing Task gate")
        return block_task_with_questions_prompt()

    # PreToolUse: Write — fallback safety net for plan file writes
    if tool_name != "Write":
        return 0

    if not is_plan_file_write(payload):
        return 0

    # Load config
    proj = project_dir(payload)
    config = load_plan_context_config(proj)

    # Check if feature is disabled
    if not config.get("enabled", True):
        log_debug("add_plan_context", "planContext disabled in config")
        return 0

    # Get session_id
    session_id = payload.get("session_id")

    # Fail-safe: skip enforcement if no session_id
    if not session_id:
        log_debug("add_plan_context", "No session_id, skipping enforcement")
        return inject_evaluation_context()

    session_id_str = str(session_id)

    # Check if questions were asked this session
    if was_questions_asked(session_id_str):
        log_info("add_plan_context", "Questions asked, allowing write with eval context")
        log_diagnostic("add_plan_context", "decide", "Questions asked, allowing with eval context",
                        decision="allow_with_context", reasoning="was_questions_asked=True")
        return inject_evaluation_context()

    # Questions NOT asked: block and inject Phase B prompt
    log_info("add_plan_context", "Questions not asked yet - blocking plan write")
    log_diagnostic("add_plan_context", "decide", "Questions not asked, blocking plan write",
                    decision="block", reasoning="was_questions_asked=False, enforcing Phase B")
    return block_with_questions_prompt()


if __name__ == "__main__":
    from base.hook_utils import run_hook
    run_hook(main, "add_plan_context")
