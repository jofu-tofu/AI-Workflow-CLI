"""CC-Native shared library modules.

This package contains shared utilities for cc-native hooks:
- utils: Core utilities (eprint, sanitize, JSON parsing, artifact writing)
- state: Plan state file management and iteration tracking
- orchestrator: Plan complexity analysis and agent selection
- reviewers: CLI and agent-based plan review implementations
"""

from .utils import (
    eprint,
    sanitize_filename,
    sanitize_title,
    extract_plan_title,
    find_plan_file,
    ReviewerResult,
    OrchestratorResult,
    CombinedReviewResult,
    REVIEW_SCHEMA,
)

from .state import (
    get_state_file_path,
    load_state,
    save_state,
    delete_state,
    get_iteration_state,
    update_iteration_state,
    should_continue_iterating,
    DEFAULT_REVIEW_ITERATIONS,
)

__all__ = [
    # Core utilities
    "eprint",
    "sanitize_filename",
    "sanitize_title",
    "extract_plan_title",
    "find_plan_file",
    # Dataclasses
    "ReviewerResult",
    "OrchestratorResult",
    "CombinedReviewResult",
    # Constants
    "REVIEW_SCHEMA",
    "DEFAULT_REVIEW_ITERATIONS",
    # State management
    "get_state_file_path",
    "load_state",
    "save_state",
    "delete_state",
    "get_iteration_state",
    "update_iteration_state",
    "should_continue_iterating",
]
