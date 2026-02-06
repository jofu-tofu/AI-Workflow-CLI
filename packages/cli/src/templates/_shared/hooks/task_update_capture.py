#!/usr/bin/env python3
"""PostToolUse hook - captures TaskUpdate operations for persistence.

This hook runs after Claude uses the TaskUpdate tool and automatically
records the appropriate event in the context's events.jsonl based on the
status change.

Status mappings:
- status: "in_progress" -> record_task_started()
- status: "completed" -> record_task_completed()
- blockedBy added -> record_task_blocked()

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
)
from lib.base.utils import eprint, project_dir
from lib.context.context_extractor import extract_context_id
from lib.context.task_sync import (
    record_task_started,
    record_task_completed,
    record_task_blocked,
    record_task_deleted,
)


def get_persistent_task_id(
    claude_task_id: str,
    tool_input: Dict[str, Any]
) -> str:
    """
    Convert Claude's ephemeral task ID to persistent task ID.

    If metadata.persistent_id exists, use that.
    Otherwise, assume format "aiw-{claude_task_id}".

    Args:
        claude_task_id: Task ID from Claude (e.g., "1", "2")
        tool_input: Tool input dict

    Returns:
        Persistent task ID (e.g., "aiw-1")
    """
    metadata = tool_input.get("metadata", {})
    if isinstance(metadata, dict):
        persistent_id = metadata.get("persistent_id")
        if persistent_id:
            return persistent_id

    # Default: aiw-{id}
    return f"aiw-{claude_task_id}"


@safe_hook_main("task_update_capture")
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
    if not validate_hook_event(payload, "PostToolUse", "TaskUpdate"):
        return 0

    # Extract tool input
    tool_input = get_tool_input(payload)
    if not tool_input:
        eprint("[task_update_capture] Invalid tool_input: not a dict")
        return 0

    # Check for skip_persistence flag
    if check_skip_persistence(payload, "task_update_capture"):
        return 0

    # Get project root and session ID
    project_root = project_dir(payload)
    session_id = payload.get("session_id")

    # Extract context ID using unified extractor
    context_id = extract_context_id(
        tool_input,
        project_root,
        session_id=session_id,
        hook_name="task_update_capture"
    )
    if not context_id:
        eprint("[task_update_capture] No context available - skipping persistence")
        return 0

    # Extract task ID
    claude_task_id = tool_input.get("taskId")
    if not claude_task_id:
        eprint("[task_update_capture] Missing required field: taskId")
        return 0

    # Get persistent task ID
    persistent_task_id = get_persistent_task_id(claude_task_id, tool_input)

    # Check for status change
    status = tool_input.get("status")
    metadata = tool_input.get("metadata", {})
    add_blocked_by = tool_input.get("addBlockedBy", [])

    # Handle different update types
    events_recorded = []

    # Status: in_progress
    if status == "in_progress":
        success = record_task_started(
            context_id=context_id,
            task_id=persistent_task_id,
            session_id=session_id or "",
            project_root=project_root
        )
        if success:
            events_recorded.append("task_started")

    # Status: completed
    elif status == "completed":
        # Extract rich completion context from metadata
        if isinstance(metadata, dict):
            evidence = metadata.get("evidence", "Task marked completed")
            work_summary = metadata.get("work_summary", "")
            files_changed = metadata.get("files_changed", [])
            commit_ref = metadata.get("commit_ref", "")
        else:
            evidence = "Task marked completed"
            work_summary = ""
            files_changed = []
            commit_ref = ""

        success = record_task_completed(
            context_id=context_id,
            task_id=persistent_task_id,
            evidence=evidence,
            work_summary=work_summary,
            files_changed=files_changed if isinstance(files_changed, list) else [],
            commit_ref=commit_ref,
            session_id=session_id or "",
            project_root=project_root
        )
        if success:
            events_recorded.append("task_completed")

    # Status: deleted
    elif status == "deleted":
        success = record_task_deleted(
            context_id=context_id,
            task_id=persistent_task_id,
            session_id=session_id or "",
            project_root=project_root
        )
        if success:
            events_recorded.append("task_deleted")

    # Blocked by tasks
    if add_blocked_by and isinstance(add_blocked_by, list) and len(add_blocked_by) > 0:
        blocked_reason = f"Blocked by tasks: {', '.join(add_blocked_by)}"
        success = record_task_blocked(
            context_id=context_id,
            task_id=persistent_task_id,
            reason=blocked_reason,
            session_id=session_id or "",
            project_root=project_root
        )
        if success:
            events_recorded.append("task_blocked")

    if events_recorded:
        eprint(f"[task_update_capture] Recorded {', '.join(events_recorded)} for {persistent_task_id} in {context_id}")
    else:
        eprint(f"[task_update_capture] No relevant status changes detected for {persistent_task_id}")

    # Silent success (no stdout output)
    return 0


if __name__ == "__main__":
    run_hook(main)
