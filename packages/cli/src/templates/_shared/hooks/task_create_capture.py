#!/usr/bin/env python3
"""PostToolUse hook - captures TaskCreate operations for persistence.

This hook runs after Claude uses the TaskCreate tool and automatically
records the task creation event in the context's events.jsonl.

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
from lib.context.context_extractor import extract_context_id
from lib.context.task_sync import record_task_created, generate_next_task_id


@safe_hook_main("task_create_capture")
def main() -> int:
    """
    Main hook entry point.

    Returns:
        0 on success, non-zero on failure (but hook is non-blocking)
    """
    # Parse hook input
    payload = load_hook_input()
    if not payload:
        return 0

    # Validate hook type and tool name
    if not validate_hook_event(payload, "PostToolUse", "TaskCreate"):
        return 0

    # Extract tool input
    tool_input = get_tool_input(payload)
    if not tool_input:
        eprint("[task_create_capture] Invalid tool_input: not a dict")
        return 0

    # Check for skip_persistence flag
    if check_skip_persistence(payload, "task_create_capture"):
        return 0

    # Extract tool response (contains task ID assigned by Claude)
    tool_response = payload.get("tool_response", {})
    if not isinstance(tool_response, dict):
        eprint("[task_create_capture] Invalid tool_response: not a dict")
        return 0

    # Get project root and session ID
    project_root = project_dir(payload)
    session_id = payload.get("session_id")

    # Extract context ID using unified extractor
    context_id = extract_context_id(
        tool_input,
        project_root,
        session_id=session_id,
        hook_name="task_create_capture",
        check_persistent_id=True  # TaskCreate uses persistent_id for context hints
    )
    if not context_id:
        eprint("[task_create_capture] No context available - skipping persistence")
        eprint("[task_create_capture] Task will be ephemeral until context is created")
        return 0

    # Extract task data
    subject = tool_input.get("subject", "")
    if not subject:
        eprint("[task_create_capture] Missing required field: subject")
        return 0

    description = tool_input.get("description", "")
    active_form = tool_input.get("activeForm", "")

    # Generate persistent task ID
    # Claude's native ID is ephemeral (1, 2, 3...)
    # We need a persistent ID that survives sessions
    persistent_task_id = generate_next_task_id(context_id, project_root)

    # Record the task creation event
    success = record_task_created(
        context_id=context_id,
        task_id=persistent_task_id,
        subject=subject,
        description=description,
        active_form=active_form,
        project_root=project_root
    )

    if success:
        eprint(f"[task_create_capture] Recorded task_added: {persistent_task_id} in {context_id}")
    else:
        eprint(f"[task_create_capture] Failed to record task_added: {persistent_task_id}")

    # Silent success (no stdout output)
    return 0


if __name__ == "__main__":
    run_hook(main)
