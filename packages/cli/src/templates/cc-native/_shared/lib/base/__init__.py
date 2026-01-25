"""Base utilities for shared context management."""
from .atomic_write import atomic_write, atomic_append
from .constants import (
    OUTPUT_DIR,
    CONTEXTS_DIR,
    INDEX_FILENAME,
    validate_context_id,
    get_output_dir,
    get_contexts_dir,
    get_context_dir,
    get_context_plans_dir,
    get_context_handoffs_dir,
    get_index_path,
    get_context_file_path,
    get_events_file_path,
)
from .utils import (
    eprint,
    now_local,
    now_iso,
    project_dir,
    sanitize_filename,
    sanitize_title,
    generate_context_id,
)

__all__ = [
    "atomic_write",
    "atomic_append",
    "OUTPUT_DIR",
    "CONTEXTS_DIR",
    "INDEX_FILENAME",
    "validate_context_id",
    "get_output_dir",
    "get_contexts_dir",
    "get_context_dir",
    "get_context_plans_dir",
    "get_context_handoffs_dir",
    "get_index_path",
    "get_context_file_path",
    "get_events_file_path",
    "eprint",
    "now_local",
    "now_iso",
    "project_dir",
    "sanitize_filename",
    "sanitize_title",
    "generate_context_id",
]
