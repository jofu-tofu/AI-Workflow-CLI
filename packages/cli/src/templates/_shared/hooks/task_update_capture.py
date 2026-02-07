#!/usr/bin/env python3
"""PostToolUse hook - captures TaskUpdate operations for persistence.

This hook runs after Claude uses the TaskUpdate tool and automatically
records the update in the context's state.json.

Hook input (from Claude Code):
{
    "hook_event_name": "PostToolUse",
    "tool_name": "TaskUpdate",
    "tool_input": {
        "taskId": "1",
        "status": "completed",
        "metadata": {"evidence": "...", "work_summary": "...", ...},
        "addBlockedBy": ["2"],
        ...
    },
    "tool_response": {...},
    "session_id": "abc123",
    "cwd": "/path/to/project"
}

Hook output:
- Silent on success (no stdout output)
- Logs to stderr for debugging
"""
import sys
from pathlib import Path
from typing import Dict, Any

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
    log_debug,
    log_info,
    log_warn,
    log_error,
)
from lib.base.utils import project_dir
from lib.context.context_store import get_context_by_session_id
from lib.context.task_tracker import update_task, delete_task


def get_persistent_task_id(
    claude_task_id: str,
    tool_input: Dict[str, Any]
) -> str:
    """Convert Claude's ephemeral task ID to persistent task ID."""
    metadata = tool_input.get("metadata", {})
    if isinstance(metadata, dict):
        persistent_id = metadata.get("persistent_id")
        if persistent_id:
            return persistent_id
    return f"aiw-{claude_task_id}"


@safe_hook_main("task_update_capture")
def main() -> int:
    """Main hook entry point."""
    payload = load_hook_input()
    if not payload:
        return 0

    if not validate_hook_event(payload, "PostToolUse", "TaskUpdate"):
        return 0

    tool_input = get_tool_input(payload)
    if not tool_input:
        log_warn("task_update_capture", "Invalid tool_input: not a dict")
        return 0

    if check_skip_persistence(payload, "task_update_capture"):
        return 0

    project_root = project_dir(payload)
    session_id = payload.get("session_id", "")

    # Find context by session ID
    state = get_context_by_session_id(session_id, project_root)
    if not state:
        log_debug("task_update_capture", "No context available - skipping persistence")
        return 0

    context_id = state.id

    # Extract task ID
    claude_task_id = tool_input.get("taskId")
    if not claude_task_id:
        log_warn("task_update_capture", "Missing required field: taskId")
        return 0

    persistent_task_id = get_persistent_task_id(claude_task_id, tool_input)

    status = tool_input.get("status")
    metadata = tool_input.get("metadata", {})

    events_recorded = []

    if status == "deleted":
        if delete_task(context_id, persistent_task_id, project_root):
            events_recorded.append("task_deleted")
    elif status:
        # Extract completion metadata
        evidence = ""
        work_summary = ""
        files_changed = None
        if isinstance(metadata, dict):
            evidence = metadata.get("evidence", "")
            work_summary = metadata.get("work_summary", "")
            files_changed = metadata.get("files_changed")
            if files_changed and not isinstance(files_changed, list):
                files_changed = None

        success = update_task(
            context_id=context_id,
            task_id=persistent_task_id,
            status=status,
            evidence=evidence,
            work_summary=work_summary,
            files_changed=files_changed,
            session_id=session_id,
            project_root=project_root,
        )
        if success:
            events_recorded.append(f"task_{status}")

    if events_recorded:
        log_info("task_update_capture", f"Recorded {', '.join(events_recorded)} for {persistent_task_id} in {context_id}")
    else:
        log_debug("task_update_capture", f"No relevant changes for {persistent_task_id}")

    return 0


if __name__ == "__main__":
    run_hook(main, "task_update_capture")
