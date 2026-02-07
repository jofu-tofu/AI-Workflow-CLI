"""Context management for AIW CLI templates.

New 2-layer architecture:
  context_store.py    — CRUD for state.json + index.json
  context_selector.py — 5-case context selection (session match, caret, plan match, default)
  context_formatter.py — All display formatting
  plan_manager.py     — Plan archival, lookup, path extraction
  task_tracker.py     — Direct state.json task CRUD
"""
from .context_store import (
    ContextState,
    get_all_contexts,
    get_context,
    get_context_by_session_id,
    create_context,
    create_context_from_prompt,
    update_context,
    complete_context,
    reopen_context,
    archive_context,
    bind_session,
    update_mode,
    maybe_activate,
    load_state,
    save_state,
)
from .context_selector import (
    determine_context,
    BlockRequest,
    parse_chained_caret,
    resolve_context_by_prefix,
)
from .context_formatter import (
    format_context_list,
    format_context_created,
    format_context_picker_stderr,
    format_active_context_reminder,
    format_handoff_continuation,
    format_plan_continuation,
    format_active_continuation,
    format_command_feedback,
    format_relative_time,
)
from .plan_manager import (
    archive_plan,
    find_latest_plan,
    extract_plan_path_from_result,
)
from .task_tracker import (
    add_task,
    update_task,
    delete_task,
    get_tasks,
    generate_task_summary,
    generate_next_task_id,
)

__all__ = [
    # Data model
    "ContextState",
    # Context store (CRUD)
    "get_all_contexts",
    "get_context",
    "get_context_by_session_id",
    "create_context",
    "create_context_from_prompt",
    "update_context",
    "complete_context",
    "reopen_context",
    "archive_context",
    "bind_session",
    "update_mode",
    "maybe_activate",
    "load_state",
    "save_state",
    # Context selector
    "determine_context",
    "BlockRequest",
    "parse_chained_caret",
    "resolve_context_by_prefix",
    # Formatting
    "format_context_list",
    "format_context_created",
    "format_context_picker_stderr",
    "format_active_context_reminder",
    "format_handoff_continuation",
    "format_plan_continuation",
    "format_active_continuation",
    "format_command_feedback",
    "format_relative_time",
    # Plan manager
    "archive_plan",
    "find_latest_plan",
    "extract_plan_path_from_result",
    # Task tracker
    "add_task",
    "update_task",
    "delete_task",
    "get_tasks",
    "generate_task_summary",
    "generate_next_task_id",
]
