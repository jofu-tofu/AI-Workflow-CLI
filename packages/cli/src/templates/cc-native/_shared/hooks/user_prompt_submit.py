#!/usr/bin/env python3
"""Unified UserPromptSubmit hook entry point.

This hook runs on every UserPromptSubmit and orchestrates:
1. Context enforcement - ensures all work happens in a tracked context
2. Context-aware handoff - monitors context window and warns when low

Hook input (from Claude Code):
{
    "hook_type": "UserPromptSubmit",
    "prompt": "user's message text",
    "context_remaining_percent": 18,  // May not be available
    "session_id": "abc123",
    ...
}

Hook output:
- Prints system reminders to stdout (combined from both modules)
"""
import json
import sys
from pathlib import Path
from typing import Optional, List

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.utils import eprint, project_dir

# Import the enforcement and handoff modules
from hooks.context_enforcer import determine_context
from hooks.context_aware_handoff import check_context_level


def main():
    """
    Main entry point for UserPromptSubmit hook.

    Orchestrates context enforcement and handoff monitoring.
    """
    try:
        # Read hook input from stdin
        input_data = sys.stdin.read().strip()

        if not input_data:
            return

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            return

        # Get user prompt and project root
        user_prompt = hook_input.get("prompt", "")
        project_root = project_dir(hook_input)

        outputs: List[str] = []

        # 1. Context enforcement (runs first)
        if user_prompt:
            context_id, method, context_output = determine_context(user_prompt, project_root)
            eprint(f"[user_prompt_submit] Context: {method} -> {context_id}")
            if context_output:
                outputs.append(context_output)

        # 2. Context-aware handoff (runs second)
        handoff_warning = check_context_level(hook_input)
        if handoff_warning:
            outputs.append(handoff_warning)

        # Print combined output
        if outputs:
            print("\n\n".join(outputs))

    except Exception as e:
        eprint(f"[user_prompt_submit] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
