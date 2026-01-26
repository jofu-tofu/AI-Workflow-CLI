"""Shared templates and formatters for context management output.

This module provides centralized templates for:
- Mode displays (planning, implementing, etc.)
- Status icons (pending, in_progress, completed)
- Task rendering
- Context continuation headers

Used by discovery.py, document_generator.py, and hooks.
"""

from .formatters import (
    MODE_DISPLAY_MAP,
    STATUS_ICON_MAP,
    REASON_MAP,
    get_mode_display,
    get_status_icon,
    render_task_item,
    render_task_list,
    format_continuation_header,
    format_reason,
)
from .plan_context import (
    get_evaluation_context_reminder,
    get_questions_offer_template,
)

__all__ = [
    "MODE_DISPLAY_MAP",
    "STATUS_ICON_MAP",
    "REASON_MAP",
    "get_mode_display",
    "get_status_icon",
    "render_task_item",
    "render_task_list",
    "format_continuation_header",
    "format_reason",
    "get_evaluation_context_reminder",
    "get_questions_offer_template",
]
