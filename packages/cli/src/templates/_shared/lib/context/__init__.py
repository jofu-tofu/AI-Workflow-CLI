"""Context management for AIW CLI templates."""
from .context_manager import (
    Context,
    InFlightState,
    get_all_contexts,
    get_context,
    create_context,
    update_context,
    complete_context,
    reopen_context,
    update_plan_status,
    get_context_with_pending_plan,
    get_context_with_in_flight_work,
    update_handoff_status,
    clear_handoff_status,
    get_context_with_handoff_pending,
)
from .event_log import (
    Task,
    ContextState,
    append_event,
    read_events,
    get_current_state,
    are_all_tasks_completed,
    get_pending_tasks,
)
from .cache import (
    rebuild_index_from_folders,
    rebuild_context_from_events,
    rebuild_all_caches,
    verify_cache_integrity,
)
from .discovery import (
    discover_contexts_for_session,
    get_in_flight_context,
    format_context_list,
    format_pending_plan_continuation,
    format_handoff_continuation,
    format_implementation_continuation,
    format_context_picker_prompt,
    format_ready_for_new_work,
)
from .task_sync import (
    generate_hydration_instructions,
    generate_task_summary,
    record_session_start,
    record_task_created,
    record_task_started,
    record_task_completed,
    record_task_blocked,
    generate_next_task_id,
)
from .plan_archive import (
    archive_plan_to_context,
    get_active_context_for_plan,
    create_context_from_plan,
    mark_plan_implementation_started,
    mark_plan_completed,
)

__all__ = [
    # Data Classes
    "Context",
    "InFlightState",
    "Task",
    "ContextState",
    # Context Manager
    "get_all_contexts",
    "get_context",
    "create_context",
    "update_context",
    "complete_context",
    "reopen_context",
    "update_plan_status",
    "get_context_with_pending_plan",
    "get_context_with_in_flight_work",
    "update_handoff_status",
    "clear_handoff_status",
    "get_context_with_handoff_pending",
    # Event Log
    "append_event",
    "read_events",
    "get_current_state",
    "are_all_tasks_completed",
    "get_pending_tasks",
    # Cache
    "rebuild_index_from_folders",
    "rebuild_context_from_events",
    "rebuild_all_caches",
    "verify_cache_integrity",
    # Discovery
    "discover_contexts_for_session",
    "get_in_flight_context",
    "format_context_list",
    "format_pending_plan_continuation",
    "format_handoff_continuation",
    "format_implementation_continuation",
    "format_context_picker_prompt",
    "format_ready_for_new_work",
    # Task Sync
    "generate_hydration_instructions",
    "generate_task_summary",
    "record_session_start",
    "record_task_created",
    "record_task_started",
    "record_task_completed",
    "record_task_blocked",
    "generate_next_task_id",
    # Plan Archive
    "archive_plan_to_context",
    "get_active_context_for_plan",
    "create_context_from_plan",
    "mark_plan_implementation_started",
    "mark_plan_completed",
]
