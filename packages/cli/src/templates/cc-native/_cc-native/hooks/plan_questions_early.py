#!/usr/bin/env python3
"""UserPromptSubmit hook - injects Phase A clarification prompt in plan mode.

On the first prompt in plan mode (before any code exploration), injects
a system-reminder telling Claude to ask clarification questions via
AskUserQuestion before exploring the codebase.

Skips if questions were already asked this session.
"""

import json
import sys
from pathlib import Path

_hook_dir = Path(__file__).resolve().parent
_cc_native_lib_dir = _hook_dir.parent / "lib"
_shared_lib_dir = _hook_dir.parent.parent / "_shared" / "lib"
sys.path.insert(0, str(_cc_native_lib_dir))
sys.path.insert(0, str(_shared_lib_dir))

from utils import was_questions_asked
from base.hook_utils import load_hook_input
from base.logger import log_debug, log_info, log_warn, log_error


PHASE_A_PROMPT = """
## Plan Mode: Clarify Before Exploring

Use AskUserQuestion now — one call, 3-4 questions — before reading any code.

### Why This Matters
Once you explore the codebase, you anchor on what you find. Questions asked after exploration confirm your assumptions instead of challenging them. Ask now, while your interpretation is still flexible.

### What to Ask About
Only ask about things you cannot discover from code — the user's intent, constraints, history, and priorities:

- **Ambiguity:** If you can read this request two different ways, ask which interpretation is correct. Provide your top 2-3 readings as options.
- **Invisible context:** What does the user assume "everyone knows" about this system that isn't documented? What's obvious to them but hidden to you?
- **Success criteria:** What does "done well" look like beyond the literal request? What would make them rate this a 10?
- **Constraints and history:** Has this been attempted before? Are there parts of the system that are off-limits or sensitive?

### How to Select Questions
1. Generate 5+ candidate questions across the lenses above
2. For each, evaluate: "If they answered A vs B, would I explore different files or take a different approach?" If no — discard it.
3. Keep the 3-4 where different answers lead to meaningfully different exploration strategies
4. Frame each with 2-3 concrete options so the user can react rather than generate from scratch
""".strip()


def main() -> int:
    try:
        payload = load_hook_input()
        if not payload:
            return 0

        permission_mode = payload.get("permission_mode", "")
        if permission_mode != "plan":
            return 0

        session_id = str(payload.get("session_id", ""))
        if not session_id:
            log_debug("plan_questions_early", "No session_id, skipping")
            return 0

        # Get project root for context operations
        project_root = Path(payload.get("cwd", ".")).resolve()

        if was_questions_asked(session_id, project_root):
            log_debug("plan_questions_early", "Questions already asked, skipping")
            return 0

        log_info("plan_questions_early", "Plan mode detected, injecting Phase A prompt")
        print(f"<system-reminder>{PHASE_A_PROMPT}</system-reminder>")

    except Exception as e:
        from base.hook_utils import log_hook_error

        log_hook_error("plan_questions_early", e, "UserPromptSubmit")
        log_error("plan_questions_early", str(e))

    return 0


if __name__ == "__main__":
    from base.hook_utils import run_hook

    run_hook(main, "plan_questions_early")
