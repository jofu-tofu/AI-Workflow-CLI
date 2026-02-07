#!/usr/bin/env python3
"""Unified UserPromptSubmit hook entry point.

This hook runs on every UserPromptSubmit and handles:
- Context enforcement - ensures all work happens in a tracked context

Note: Context monitoring (handoff warnings) is handled separately by
context_monitor.py on PostToolUse events, which fires during Claude's
work rather than waiting for user input.

Hook input (from Claude Code):
{
    "hook_type": "UserPromptSubmit",
    "prompt": "user's message text",
    "session_id": "abc123",
    ...
}

Hook output:
- Prints system reminders to stdout for context enforcement
"""
import sys
from pathlib import Path
from typing import List

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input, log_debug, log_info, log_warn, log_error, log_diagnostic
from lib.base.utils import project_dir
from lib.context.context_store import (
    get_context,
    get_context_by_session_id,
    bind_session,
    maybe_activate,
    save_state,
)
from lib.context.context_selector import determine_context, BlockRequest


def format_claudemd_reminder() -> str:
    """Generate reminder to update directory-specific CLAUDE.md files."""
    return """
## CLAUDE.md \u2014 Persistent Memory

CLAUDE.md files are this project's persistent memory across sessions. **After making a significant decision or learning something non-obvious during this task, write it to the nearest CLAUDE.md.** If you don't write it, it's lost when this session ends.

**What to write:**
- Architectural choices and why alternatives were rejected
- Non-obvious constraints (what breaks if this changes)
- Workarounds with context on the underlying issue
- Patterns that prevent future mistakes

**Placement:** CLAUDE.md files cascade \u2014 subdirectories inherit from parents. Update the nearest existing one. Only create a new one at a genuine semantic boundary (package root, technology boundary, domain boundary).

**Format:**

```markdown
## [Topic]
**Decision:** [What was decided]
**Rationale:** [Why \u2014 the non-obvious part]
```

**When in doubt, write it.** A lean entry is better than a lost decision.
"""


def _update_in_flight_status(context_id: str, hook_input: dict, project_root: Path) -> None:
    """
    Update context mode based on permission mode.

    - permission_mode == "plan": no-op (planning is runtime-only, not persisted)
    - permission_mode != "plan" and mode == "idle": set to "active"
    - permission_mode != "plan" and mode == "has_plan": set to "active" (plan was accepted)
    """
    permission_mode = hook_input.get("permission_mode", "default")
    log_debug("user_prompt_submit", f"context_id={context_id}, permission_mode={permission_mode}")
    maybe_activate(context_id, permission_mode, project_root=project_root, caller="user_prompt_submit")


def main():
    """
    Main entry point for UserPromptSubmit hook.

    Handles context enforcement for all user prompts.
    Uses session_id to detect first prompt vs subsequent prompts.
    """
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        user_prompt = hook_input.get("prompt", "")
        project_root = project_dir(hook_input)
        session_id = hook_input.get("session_id", "unknown")

        log_diagnostic("user_prompt_submit", "receive", f"session={session_id[:8]}, prompt_len={len(user_prompt)}",
                        inputs={"session_id": session_id[:12], "prompt_length": len(user_prompt)})

        outputs: List[str] = []
        active_context_id = None

        # First-prompt detection: check if session_id is already bound to a context
        existing_context = get_context_by_session_id(session_id, project_root)

        if existing_context:
            # NOT first prompt - session already bound to context
            log_debug("user_prompt_submit", f"Session {session_id[:8]}... already bound to {existing_context.id}")
            log_diagnostic("user_prompt_submit", "decide", f"Session already bound to {existing_context.id}",
                            decision="session_match", reasoning="session_id found in existing context",
                            inputs={"context_id": existing_context.id, "mode": existing_context.mode})
            _update_in_flight_status(existing_context.id, hook_input, project_root)
            active_context_id = existing_context.id
        elif user_prompt:
            # FIRST prompt - need context detection
            try:
                context_id, method, context_output = determine_context(user_prompt, session_id, project_root)
                log_info("user_prompt_submit", f"Context: {method} -> {context_id}")
                log_diagnostic("user_prompt_submit", "decide", f"Context detected via {method}: {context_id}",
                                decision=method, reasoning=f"determine_context returned method={method}",
                                inputs={"context_id": context_id, "has_output": bool(context_output)})

                if context_id:
                    # Bind session to context
                    bind_session(context_id, session_id, project_root)
                    log_info("user_prompt_submit", f"Bound session {session_id[:8]}... to context '{context_id}'")

                    # Update mode based on permission mode
                    _update_in_flight_status(context_id, hook_input, project_root)
                    active_context_id = context_id

                    # Clear handoff_path after it's been injected via context_selector
                    try:
                        ctx = get_context(context_id, project_root)
                        if ctx and ctx.handoff_path:
                            ctx.handoff_path = None
                            save_state(ctx, project_root)
                            log_debug("user_prompt_submit", f"Cleared handoff_path for {context_id}")
                    except Exception as e:
                        log_warn("user_prompt_submit", f"Failed to clear handoff_path: {e}")

                if context_output:
                    outputs.append(context_output)

            except BlockRequest as e:
                log_error("user_prompt_submit", e.message)
                sys.exit(2)

        # Inject CLAUDE.md reminder when in active mode
        if active_context_id:
            context = get_context(active_context_id, project_root)
            if context and context.mode == "active":
                outputs.append(f"<system-reminder>{format_claudemd_reminder()}</system-reminder>")
                log_debug("user_prompt_submit", "Injected CLAUDE.md reminder (mode=active)")

        log_diagnostic("user_prompt_submit", "result", f"context={active_context_id}, outputs={len(outputs)}",
                        inputs={"active_context_id": active_context_id, "output_count": len(outputs)})

        if outputs:
            print("\n\n".join(outputs))

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        from lib.base.hook_utils import log_hook_error
        log_hook_error("user_prompt_submit", e, "UserPromptSubmit", traceback_str=tb)


if __name__ == "__main__":
    from lib.base.hook_utils import run_hook
    run_hook(main, "user_prompt_submit")
