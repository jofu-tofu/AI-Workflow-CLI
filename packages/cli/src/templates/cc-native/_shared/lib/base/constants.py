"""Constants and path utilities for shared context management.

Data hierarchy:
  events.jsonl (source of truth)
    → context.json (L1 cache)
      → index.json (L2 cache)

All data written to _output/contexts/ (method-agnostic).
No method subfolders - method is just metadata on the context.
"""
import os
import re
from pathlib import Path

# Directory names (relative to project root)
OUTPUT_DIR = "_output"
CONTEXTS_DIR = "contexts"
INDEX_FILENAME = "index.json"

# Context ID validation
MAX_CONTEXT_ID_LENGTH = 64
VALID_CONTEXT_ID_PATTERN = re.compile(r'^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$')

# File size limits
MAX_EVENT_SIZE = 64 * 1024  # 64KB per event (reasonable limit)
MAX_INDEX_SIZE = 1024 * 1024  # 1MB for index.json

# Performance constants
MAX_RETRY_ATTEMPTS = 2
RETRY_BACKOFF_MS = [500, 1000]


def validate_context_id(context_id: str) -> str:
    """
    Validate and normalize context ID.

    Valid context IDs:
    - 1-64 characters
    - lowercase alphanumeric, hyphens, underscores
    - must start and end with alphanumeric
    - no consecutive hyphens/underscores

    Raises:
        ValueError: If context_id is invalid
    """
    if not context_id:
        raise ValueError("Context ID cannot be empty")

    if len(context_id) > MAX_CONTEXT_ID_LENGTH:
        raise ValueError(f"Context ID too long: {len(context_id)} > {MAX_CONTEXT_ID_LENGTH}")

    # Normalize to lowercase
    normalized = context_id.lower()

    # Check for invalid characters
    if not VALID_CONTEXT_ID_PATTERN.match(normalized):
        raise ValueError(
            f"Invalid context ID '{context_id}': "
            "must be lowercase alphanumeric with hyphens/underscores, "
            "start and end with alphanumeric"
        )

    # Check for consecutive special characters
    if '--' in normalized or '__' in normalized or '-_' in normalized or '_-' in normalized:
        raise ValueError(f"Invalid context ID '{context_id}': consecutive special characters not allowed")

    # Check for path traversal
    if '..' in normalized or '/' in context_id or '\\' in context_id:
        raise ValueError(f"Invalid context ID '{context_id}': path traversal not allowed")

    return normalized


def get_output_dir(project_root: Path = None) -> Path:
    """
    Get the output directory path.

    Args:
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/
    """
    if project_root is None:
        project_root = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))
    return Path(project_root) / OUTPUT_DIR


def get_contexts_dir(project_root: Path = None) -> Path:
    """
    Get the contexts directory path.

    Args:
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/
    """
    return get_output_dir(project_root) / CONTEXTS_DIR


def get_context_dir(context_id: str, project_root: Path = None) -> Path:
    """
    Get the directory path for a specific context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/{context_id}/

    Raises:
        ValueError: If context_id is invalid
    """
    validated_id = validate_context_id(context_id)
    return get_contexts_dir(project_root) / validated_id


def get_context_plans_dir(context_id: str, project_root: Path = None) -> Path:
    """
    Get the plans directory for a specific context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/{context_id}/plans/
    """
    return get_context_dir(context_id, project_root) / "plans"


def get_context_handoffs_dir(context_id: str, project_root: Path = None) -> Path:
    """
    Get the handoffs directory for a specific context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/{context_id}/handoffs/
    """
    return get_context_dir(context_id, project_root) / "handoffs"


def get_index_path(project_root: Path = None) -> Path:
    """
    Get the global index file path.

    Args:
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/index.json
    """
    return get_output_dir(project_root) / INDEX_FILENAME


def get_context_file_path(context_id: str, project_root: Path = None) -> Path:
    """
    Get the context.json file path for a specific context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/{context_id}/context.json
    """
    return get_context_dir(context_id, project_root) / "context.json"


def get_events_file_path(context_id: str, project_root: Path = None) -> Path:
    """
    Get the events.jsonl file path for a specific context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/{context_id}/events.jsonl
    """
    return get_context_dir(context_id, project_root) / "events.jsonl"
