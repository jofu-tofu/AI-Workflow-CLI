"""Handoff utilities for context-aware session management.

This module provides graceful context degradation when Claude's
context window fills up. Instead of rushing or losing work,
it creates a handoff document and facilitates clean session continuation.

Components:
- document_generator: Creates handoff documents with work state
- context_monitor hook: Monitors context during tool use and triggers warnings
"""

from .document_generator import (
    generate_handoff_document,
    get_handoff_continuation_prompt,
    HandoffDocument,
)

__all__ = [
    "generate_handoff_document",
    "get_handoff_continuation_prompt",
    "HandoffDocument",
]
