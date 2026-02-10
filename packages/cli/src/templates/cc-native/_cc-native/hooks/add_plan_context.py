#!/usr/bin/env python3
"""
Plan context hook - handles question marking and advisory question nudges.

Registered for two events:
- PostToolUse: AskUserQuestion — marks that questions were asked this session.
- PreToolUse: Task — nudges Plan subagent to ask questions first (advisory, never blocks).

All enforcement is advisory: injects additionalContext to guide Claude toward asking
non-obvious questions, but never blocks the tool call. Claude can proceed regardless.

Fail-safe: Any error allows the action silently.
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
)
from base.hook_utils import emit_context
from base.subprocess_utils import is_internal_call
from base.logger import log_debug, log_info, log_warn, log_error, log_diagnostic
from templates.plan_context import get_evaluation_context_reminder


def is_plan_task(payload: Dict[str, Any]) -> bool:
    """Check if this Task call spawns a Plan subagent."""
    tool_input = payload.get("tool_input", {})
    return str(tool_input.get("subagent_type", "")) == "Plan"


CONTEXT_REMINDER = get_evaluation_context_reminder()


def inject_evaluation_context() -> int:
    """Inject evaluation context reminder without blocking."""
    emit_context(CONTEXT_REMINDER)
    return 0


TASK_ENFORCEMENT_CONTEXT = (
    "Before spawning a Plan agent, consider asking the user non-obvious questions "
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


def nudge_task_questions() -> int:
    """Advise Claude to ask questions before spawning Plan agent (never blocks)."""
    emit_context(TASK_ENFORCEMENT_CONTEXT)
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
    log_diagnostic(
        "add_plan_context",
        "receive",
        f"tool={tool_name}, event={hook_event}",
        inputs={"tool_name": tool_name, "hook_event": hook_event},
    )

    # Get project root for context operations
    project_root = Path(payload.get("cwd", ".")).resolve()

    # PostToolUse: AskUserQuestion — mark that questions were asked
    if tool_name == "AskUserQuestion":
        session_id = str(payload.get("session_id", ""))
        if session_id:
            mark_questions_asked(session_id, project_root)
            log_info(
                "add_plan_context",
                f"Marked questions asked for session {session_id[:8]}...",
            )
        return 0

    # PreToolUse: Task — nudge Plan subagent to ask questions first (advisory)
    if tool_name == "Task":
        if not is_plan_task(payload):
            return 0  # Only gate Plan subagent spawns

        permission_mode = payload.get("permission_mode", "")
        if permission_mode != "plan":
            return 0  # Only enforce during plan mode

        session_id = payload.get("session_id")
        if not session_id:
            log_debug(
                "add_plan_context", "No session_id for Task gate, skipping enforcement"
            )
            return 0

        session_id_str = str(session_id)

        if was_questions_asked(session_id_str, project_root):
            log_info(
                "add_plan_context",
                "Questions asked, allowing Plan Task with eval context",
            )
            log_diagnostic(
                "add_plan_context",
                "decide",
                "Questions asked, allowing Plan Task",
                decision="allow_with_context",
                reasoning="was_questions_asked=True",
            )
            return inject_evaluation_context()

        # Questions NOT asked: nudge toward asking questions (advisory only)
        log_info(
            "add_plan_context", "Questions not asked - nudging Plan Task to ask first"
        )
        log_diagnostic(
            "add_plan_context",
            "decide",
            "Questions not asked, nudging Plan Task",
            decision="nudge",
            reasoning="was_questions_asked=False, advisory context",
        )
        return nudge_task_questions()

    return 0


if __name__ == "__main__":
    from base.hook_utils import run_hook

    run_hook(main, "add_plan_context")
