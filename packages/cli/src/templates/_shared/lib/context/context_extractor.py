"""Context ID extraction from hook payloads.

Centralizes the logic for determining which context a hook operation
belongs to, using multiple fallback strategies.
"""

from pathlib import Path
from typing import Any, Dict, Optional

from .context_manager import get_context_by_session_id, get_all_contexts
from ..base.utils import eprint


def extract_context_id(
    tool_input: Dict[str, Any],
    project_root: Path,
    session_id: Optional[str] = None,
    hook_name: str = "hook",
    check_persistent_id: bool = False
) -> Optional[str]:
    """
    Extract context ID from tool input with multiple fallback strategies.

    Order of precedence:
    1. metadata.context field (explicit context specification)
    2. Session ID lookup (session bound to context)
    3. persistent_id parsing (if check_persistent_id=True, for TaskCreate)
    4. Single active context fallback

    Args:
        tool_input: Tool input dict from hook payload
        project_root: Project root directory
        session_id: Optional session ID from hook payload
        hook_name: Name of calling hook for log messages
        check_persistent_id: Whether to check persistent_id for context hint
                           (used by task_create_capture for ID format parsing)

    Returns:
        Context ID string, or None if context cannot be determined
    """
    # 1. Check metadata.context field (explicit)
    metadata = tool_input.get("metadata", {})
    if isinstance(metadata, dict):
        context = metadata.get("context")
        if context:
            return context

    # 2. Check session ID (session may be bound to a context)
    if session_id:
        try:
            session_context = get_context_by_session_id(session_id, project_root)
            if session_context:
                eprint(f"[{hook_name}] Found context via session_id: {session_context.id}")
                return session_context.id
        except Exception as e:
            eprint(f"[{hook_name}] Failed to lookup context by session: {e}")

    # 3. Check persistent_id for context hint (task_create only)
    # Format: "context-id-task-N" or similar
    if check_persistent_id and isinstance(metadata, dict):
        persistent_id = metadata.get("persistent_id", "")
        if persistent_id and "-" in persistent_id:
            parts = persistent_id.split("-")
            if len(parts) >= 2:
                # Reconstruct context ID (everything before last two parts)
                context_parts = parts[:-2] if len(parts) > 2 else parts[:1]
                potential_id = "-".join(context_parts)
                if potential_id:
                    return potential_id

    # 4. Check for single active context (fallback)
    try:
        contexts = get_all_contexts(status="active", project_root=project_root)
        if len(contexts) == 1:
            return contexts[0].id
    except Exception as e:
        eprint(f"[{hook_name}] Failed to get active contexts: {e}")

    return None


def extract_context_id_for_session(
    session_id: str,
    project_root: Path,
    hook_name: str = "hook"
) -> Optional[str]:
    """
    Find context that matches this session_id.

    Simpler variant for hooks that only need session-based lookup.

    Args:
        session_id: Session ID to match
        project_root: Project root directory
        hook_name: Name of calling hook for log messages

    Returns:
        Context ID or None if not found
    """
    contexts = get_all_contexts(status="active", project_root=project_root)

    # Primary strategy: Find context with matching session_id
    for ctx in contexts:
        if ctx.in_flight and ctx.in_flight.session_ids and session_id in ctx.in_flight.session_ids:
            eprint(f"[{hook_name}] Found context by session: {ctx.id}")
            return ctx.id

    # Fallback: If only one context is planning, assume it's the one
    planning_contexts = [c for c in contexts if c.in_flight and c.in_flight.mode == "planning"]
    if len(planning_contexts) == 1:
        eprint(f"[{hook_name}] Fallback: Single planning context: {planning_contexts[0].id}")
        return planning_contexts[0].id

    eprint(f"[{hook_name}] Could not find context for session {session_id}")
    return None
