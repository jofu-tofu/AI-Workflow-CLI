#!/usr/bin/env python3
"""PostToolUse hook - captures TaskCreate operations for persistence.

This hook runs after Claude uses the TaskCreate tool and automatically
records the task in the context's state.json.

Hook input (from Claude Code):
{
    "hook_event_name": "PostToolUse",
    "tool_name": "TaskCreate",
    "tool_input": {
        "subject": "Task subject",
        "description": "Task description",
        "activeForm": "Present continuous form",
        "metadata": {"context": "context-id", ...}
    },
    "tool_response": {"task": {"id": "1", "subject": "..."}},
    "session_id": "abc123",
    "cwd": "/path/to/project"
}

Hook output:
- Silent on success (no stdout output)
- Logs to stderr for debugging
"""
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import (
    load_hook_input,
    validate_hook_event,
    get_tool_input,
    check_skip_persistence,
    safe_hook_main,
    run_hook,
)
from lib.base.utils import eprint, project_dir
from lib.context.context_store import get_context_by_session_id
from lib.context.task_tracker import add_task, generate_next_task_id


@safe_hook_main("task_create_capture")
def main() -> int:
    """Main hook entry point."""
    payload = load_hook_input()
    if not payload:
        return 0

    if not validate_hook_event(payload, "PostToolUse", "TaskCreate"):
        return 0

    tool_input = get_tool_input(payload)
    if not tool_input:
        eprint("[task_create_capture] Invalid tool_input: not a dict")
        return 0

    if check_skip_persistence(payload, "task_create_capture"):
        return 0

    project_root = project_dir(payload)
    session_id = payload.get("session_id", "")

    # Find context by session ID
    state = get_context_by_session_id(session_id, project_root)
    if not state:
        eprint("[task_create_capture] No context available - skipping persistence")
        return 0

    context_id = state.id

    # Extract task data
    subject = tool_input.get("subject", "")
    if not subject:
        eprint("[task_create_capture] Missing required field: subject")
        return 0

    description = tool_input.get("description", "")
    active_form = tool_input.get("activeForm", "")

    # Add task to state.json
    task = add_task(
        context_id=context_id,
        subject=subject,
        description=description,
        active_form=active_form,
        session_id=session_id,
        project_root=project_root,
    )

    if task:
        eprint(f"[task_create_capture] Recorded task: {task['id']} in {context_id}")
    else:
        eprint(f"[task_create_capture] Failed to add task in {context_id}")

    return 0


if __name__ == "__main__":
    run_hook(main)
