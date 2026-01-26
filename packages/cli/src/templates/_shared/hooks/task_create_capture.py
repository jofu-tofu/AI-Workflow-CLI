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
import json
import sys
from pathlib import Path
from typing import Optional, Dict, Any

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.context.task_sync import record_task_created, generate_next_task_id
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
    3. metadata.persistent_id prefix (e.g., "ctx-123-task-1" -> "ctx-123")
    4. Single active context
    5. None (will trigger auto-creation)

    Args:
        tool_input: Tool input from TaskCreate
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
                eprint(f"[task_create_capture] Found context via session_id: {session_context.id}")
                return session_context.id
        except Exception as e:
            eprint(f"[task_create_capture] Failed to lookup context by session: {e}")

    # Check persistent_id for context hint
    if isinstance(metadata, dict):
        persistent_id = metadata.get("persistent_id", "")
        if persistent_id and "-" in persistent_id:
            # Format: "context-id-task-1" or similar
            parts = persistent_id.split("-")
            if len(parts) >= 2:
                # Reconstruct context ID (everything before last two parts)
                context_parts = parts[:-2] if len(parts) > 2 else parts[:1]
                return "-".join(context_parts)

    # Check for single active context
    try:
        contexts = get_all_contexts(status="active", project_root=project_root)
        if len(contexts) == 1:
            return contexts[0].id
    except Exception as e:
        eprint(f"[task_create_capture] Failed to get active contexts: {e}")

    return None


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
        if payload.get("tool_name") != "TaskCreate":
            return 0

        # Extract tool input
        tool_input = payload.get("tool_input", {})
        if not isinstance(tool_input, dict):
            eprint("[task_create_capture] Invalid tool_input: not a dict")
            return 0

        # Check for skip_persistence flag (used during hydration to avoid duplicates)
        metadata = tool_input.get("metadata", {})
        if isinstance(metadata, dict) and metadata.get("skip_persistence"):
            eprint("[task_create_capture] Skipping persistence (hydration mode)")
            return 0

        # Extract tool response (contains task ID assigned by Claude)
        tool_response = payload.get("tool_response", {})
        if not isinstance(tool_response, dict):
            eprint("[task_create_capture] Invalid tool_response: not a dict")
            return 0

        # Get project root and session ID
        project_root = project_dir(payload)
        session_id = payload.get("session_id")

        # Extract context ID
        context_id = extract_context_id(tool_input, project_root, session_id)
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

    except json.JSONDecodeError as e:
        eprint(f"[task_create_capture] JSON decode error: {e}")
        return 0  # Non-blocking
    except Exception as e:
        eprint(f"[task_create_capture] Unexpected error: {e}")
        import traceback
        eprint(traceback.format_exc())
        return 0  # Non-blocking


if __name__ == "__main__":
    raise SystemExit(main())
