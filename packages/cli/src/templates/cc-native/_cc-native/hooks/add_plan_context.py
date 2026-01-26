#!/usr/bin/env python3
"""
PreToolUse hook for Write - offers clarifying questions on first plan write.

On the first plan write in a session:
1. Allow the write to succeed (plan file is created)
2. Inject context offering clarifying questions
3. If user wants questions, Claude asks and writes an updated plan

Subsequent writes inject the evaluation context reminder only.

Fail-safe: Any error skips the questions feature and allows the write.
"""

import json
import os
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
    was_questions_offered,
    mark_questions_offered,
)
from templates.plan_context import (
    get_evaluation_context_reminder,
    get_questions_offer_template,
)


def is_plan_file_write(payload: Dict[str, Any]) -> bool:
    """Check if this Write targets a plan file."""
    tool_input = payload.get("tool_input", {})
    file_path = str(tool_input.get("file_path", ""))
    return ".claude/plans/" in file_path.replace("\\", "/") and file_path.endswith(".md")


def project_dir(payload: Dict[str, Any]) -> Path:
    """Get project directory from payload or environment."""
    p = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    return Path(p)


def load_plan_context_config(proj_dir: Path) -> Dict[str, Any]:
    """Load planContext config with defaults."""
    config_path = proj_dir / "_cc-native" / "config.json"
    defaults = {"enabled": True, "offerClarifyingQuestions": True}

    if not config_path.exists():
        return defaults
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        plan_ctx = config.get("planContext", {})
        return {**defaults, **plan_ctx}
    except Exception:
        return defaults


CONTEXT_REMINDER = get_evaluation_context_reminder()
QUESTIONS_OFFER_CONTEXT = get_questions_offer_template()


def inject_evaluation_context() -> int:
    """Inject evaluation context reminder without blocking."""
    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": CONTEXT_REMINDER
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


def offer_questions_nonblocking() -> int:
    """Inject questions offer without blocking - plan Write succeeds."""
    context = CONTEXT_REMINDER + "\n\n---\n\n" + QUESTIONS_OFFER_CONTEXT
    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": context
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # Fail-safe

    if payload.get("tool_name") != "Write":
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

    if not config.get("offerClarifyingQuestions", True):
        eprint("[add_plan_context] Config: offerClarifyingQuestions=false, skipping")
        return inject_evaluation_context()

    # Get session_id
    session_id = payload.get("session_id")

    # Fail-safe: skip feature if no session_id
    if not session_id:
        eprint("[add_plan_context] No session_id, skipping questions offer")
        return inject_evaluation_context()

    session_id_str = str(session_id)

    # Check if questions already offered this session
    if was_questions_offered(session_id_str):
        eprint("[add_plan_context] Questions already offered, injecting eval context")
        return inject_evaluation_context()

    # First plan write: offer questions (non-blocking - Write succeeds)
    eprint("[add_plan_context] First plan write - offering questions (non-blocking)")

    # Mark as offered so subsequent writes only get eval context
    if not mark_questions_offered(session_id_str):
        # If marking fails, skip feature (fail-safe)
        eprint("[add_plan_context] Failed to mark, skipping questions offer")
        return inject_evaluation_context()

    # Inject questions offer without blocking - Write succeeds
    return offer_questions_nonblocking()


if __name__ == "__main__":
    raise SystemExit(main())
