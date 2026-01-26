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
import json
import sys
from pathlib import Path
from typing import Optional, Dict, Any

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.context.task_sync import (
    record_task_started,
    record_task_completed,
    record_task_blocked,
)
from lib.context.context_manager import get_all_contexts, get_context_by_session_id
from lib.base.utils import eprint, project_dir


def extract_context_id(
    tool_input: Dict[str, Any],
    project_root: Path,
    session_id: Optional[str] = None
) -> Optional[str]:
    """
    Extract context ID from tool input metadata, session, or active contexts.

    Priority:
    1. metadata.context field
    2. Session ID lookup (session bound to context)
    3. Single active context
    4. None (skips persistence)

    Args:
        tool_input: Tool input from TaskUpdate
        project_root: Project root directory
        session_id: Session ID from hook payload

    Returns:
        Context ID or None if cannot determine
    """
    # Check metadata.context field
    metadata = tool_input.get("metadata", {})
    if isinstance(metadata, dict):
        context = metadata.get("context")
        if context:
            return context

    # Check session ID - session may be bound to a context
    if session_id:
        try:
            session_context = get_context_by_session_id(session_id, project_root)
            if session_context:
                eprint(f"[task_update_capture] Found context via session_id: {session_context.id}")
                return session_context.id
        except Exception as e:
            eprint(f"[task_update_capture] Failed to lookup context by session: {e}")

    # Check for single active context
    try:
        contexts = get_all_contexts(status="active", project_root=project_root)
        if len(contexts) == 1:
            return contexts[0].id
    except Exception as e:
        eprint(f"[task_update_capture] Failed to get active contexts: {e}")

    return None


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


def main() -> int:
    """
    Main hook entry point.

    Returns:
        0 on success, non-zero on failure (but hook is non-blocking)
    """
    try:
        # Parse hook input
        payload = json.load(sys.stdin)

        # Validate hook type
        if payload.get("hook_event_name") != "PostToolUse":
            return 0

        # Validate tool name
        if payload.get("tool_name") != "TaskUpdate":
            return 0

        # Extract tool input
        tool_input = payload.get("tool_input", {})
        if not isinstance(tool_input, dict):
            eprint("[task_update_capture] Invalid tool_input: not a dict")
            return 0

        # Check for skip_persistence flag (used during hydration to avoid duplicates)
        metadata = tool_input.get("metadata", {})
        if isinstance(metadata, dict) and metadata.get("skip_persistence"):
            eprint("[task_update_capture] Skipping persistence (hydration mode)")
            return 0

        # Get project root and session ID
        project_root = project_dir(payload)
        session_id = payload.get("session_id")

        # Extract context ID
        context_id = extract_context_id(tool_input, project_root, session_id)
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
                project_root=project_root
            )
            if success:
                events_recorded.append("task_completed")

        # Blocked by tasks
        if add_blocked_by and isinstance(add_blocked_by, list) and len(add_blocked_by) > 0:
            blocked_reason = f"Blocked by tasks: {', '.join(add_blocked_by)}"
            success = record_task_blocked(
                context_id=context_id,
                task_id=persistent_task_id,
                reason=blocked_reason,
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

    except json.JSONDecodeError as e:
        eprint(f"[task_update_capture] JSON decode error: {e}")
        return 0  # Non-blocking
    except Exception as e:
        eprint(f"[task_update_capture] Unexpected error: {e}")
        import traceback
        eprint(traceback.format_exc())
        return 0  # Non-blocking


if __name__ == "__main__":
    raise SystemExit(main())
