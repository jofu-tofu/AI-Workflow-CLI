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

from lib.base.hook_utils import load_hook_input
from lib.base.utils import eprint, project_dir
from lib.context.context_manager import (
    update_context_session_id,
    update_plan_status,
    get_context,
    get_context_by_session_id,
)

# Import the enforcement module
from hooks.context_enforcer import determine_context, BlockRequest


def format_claudemd_reminder() -> str:
    """Generate reminder to update directory-specific CLAUDE.md files."""
    return """
## CLAUDE.md Decision Capture

When implementing changes, consider whether this work involves decisions with non-obvious rationale. If so, update or create a CLAUDE.md in the relevant directory.

**When to update CLAUDE.md:**
- Architectural choices (why this pattern over alternatives)
- Non-obvious constraints (why something MUST be done a certain way)
- Learned patterns (discovered issues that future work should avoid)
- Integration decisions (why components connect this way)
- Workarounds (temporary solutions with context on the underlying issue)

**What to capture (use this format):**

```markdown
## [Topic]

**Decision:** [What was decided]
**Rationale:** [Why this approach was chosen]
**Constraint:** [What breaks if this changes]
```

**Directory-specific:** Place CLAUDE.md in the directory closest to the affected code. If no CLAUDE.md exists, create one with a descriptive header.

**Example new CLAUDE.md:**

```markdown
# Component Name

Development decisions and patterns for this component.

## [First Decision Topic]
...
```
"""


def _update_in_flight_status(context_id: str, hook_input: dict, project_root: Path) -> None:
    """
    Update context in-flight status based on permission mode.

    - If permission_mode == "plan": set to "planning"
    - If permission_mode in ["acceptEdits", "bypassPermissions"]: set to "implementing"
    """
    context = get_context(context_id, project_root)
    if not context or not context.in_flight:
        return

    current_mode = context.in_flight.mode
    permission_mode = hook_input.get("permission_mode", "default")
    eprint(f"[user_prompt_submit] Current mode: {current_mode}, permission_mode: {permission_mode}")

    # Set status based on permission mode
    if permission_mode == "plan":
        if current_mode != "planning":
            update_plan_status(context_id, "planning", project_root=project_root)
            eprint(f"[user_prompt_submit] Set status to 'planning'")
    elif permission_mode != "plan":
        # Any non-plan permission mode transitions pending/planning to implementing
        # This includes "default" (after /clear) and "acceptEdits"/"bypassPermissions"
        if current_mode in ["pending_implementation", "planning", "none"]:
            update_plan_status(context_id, "implementing", project_root=project_root)
            eprint(f"[user_prompt_submit] Set status to 'implementing' (permission_mode={permission_mode})")


def main():
    """
    Main entry point for UserPromptSubmit hook.

    Handles context enforcement for all user prompts.
    Uses session_id to detect first prompt vs subsequent prompts.
    """
    try:
        # Read hook input using shared utility
        hook_input = load_hook_input()

        if not hook_input:
            return

        # Get user prompt and project root
        user_prompt = hook_input.get("prompt", "")
        project_root = project_dir(hook_input)
        session_id = hook_input.get("session_id", "unknown")

        outputs: List[str] = []
        active_context_id = None  # Track context for CLAUDE.md reminder

        # First-prompt detection: check if session_id is already bound to a context
        existing_context = get_context_by_session_id(session_id, project_root)

        if existing_context:
            # NOT first prompt - session already bound to context
            # Skip expensive context detection
            eprint(f"[user_prompt_submit] Session {session_id[:8]}... already bound to {existing_context.id}")
            # Still update in-flight status based on permission mode
            _update_in_flight_status(existing_context.id, hook_input, project_root)
            active_context_id = existing_context.id
        elif user_prompt:
            # FIRST prompt - need context detection
            try:
                context_id, method, context_output, remaining_prompt = determine_context(user_prompt, project_root, session_id)
                eprint(f"[user_prompt_submit] Context: {method} -> {context_id}")
                if remaining_prompt:
                    eprint(f"[user_prompt_submit] Actual request: {remaining_prompt[:50]}...")

                if context_id:
                    # Bind session to context
                    update_context_session_id(context_id, session_id, project_root)
                    eprint(f"[user_prompt_submit] Bound session {session_id[:8]}... to context '{context_id}'")

                    # Update in-flight status based on permission mode
                    _update_in_flight_status(context_id, hook_input, project_root)
                    active_context_id = context_id

                if context_output:
                    outputs.append(context_output)

            except BlockRequest as e:
                # Block the request - print to stderr and exit with code 2
                # This shows the context picker to the user
                print(e.message, file=sys.stderr)
                sys.exit(2)

        # Inject CLAUDE.md reminder when in implementing mode
        if active_context_id:
            context = get_context(active_context_id, project_root)
            if context and context.in_flight and context.in_flight.mode == "implementing":
                outputs.append(f"<system-reminder>{format_claudemd_reminder()}</system-reminder>")
                eprint(f"[user_prompt_submit] Injected CLAUDE.md reminder (mode=implementing)")

        # Print output
        if outputs:
            print("\n\n".join(outputs))

    except Exception as e:
        eprint(f"[user_prompt_submit] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
