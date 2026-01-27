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
ARCHIVE_DIR = "archive"
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


def sanitize_context_id(context_id: str) -> str:
    """
    Sanitize a string into a valid context ID.

    Performs these transformations:
    - Convert to lowercase
    - Replace invalid characters with hyphens
    - Collapse consecutive hyphens/underscores
    - Strip leading/trailing non-alphanumeric
    - Truncate to MAX_CONTEXT_ID_LENGTH

    Args:
        context_id: Raw input string

    Returns:
        Valid context ID string, or "context" if input is empty/invalid
    """
    if not context_id:
        return "context"

    # Normalize to lowercase
    result = context_id.lower()

    # Replace any character that's not alphanumeric, hyphen, or underscore
    result = re.sub(r'[^a-z0-9_-]', '-', result)

    # Collapse consecutive hyphens/underscores into single hyphen
    result = re.sub(r'[-_]+', '-', result)

    # Strip leading/trailing non-alphanumeric
    result = result.strip('-_')

    # Truncate to max length
    if len(result) > MAX_CONTEXT_ID_LENGTH:
        result = result[:MAX_CONTEXT_ID_LENGTH].rstrip('-_')

    # If nothing left, return default
    return result if result else "context"


def validate_context_id(context_id: str) -> str:
    """
    Validate and normalize context ID.

    Auto-sanitizes invalid input instead of throwing errors for format issues.
    Only throws for security violations (path traversal).

    Valid context IDs:
    - 1-64 characters
    - lowercase alphanumeric, hyphens, underscores
    - must start and end with alphanumeric
    - no consecutive hyphens/underscores

    Raises:
        ValueError: Only for path traversal attempts
    """
    if not context_id:
        return "context"

    # SECURITY: Check for path traversal BEFORE any normalization
    # This prevents encoded or case-variant attacks
    if '..' in context_id or '/' in context_id or '\\' in context_id:
        raise ValueError(f"Invalid context ID '{context_id}': path traversal not allowed")

    # Also check for URL-encoded variants
    if '%2e' in context_id.lower() or '%2f' in context_id.lower() or '%5c' in context_id.lower():
        raise ValueError(f"Invalid context ID '{context_id}': encoded path traversal not allowed")

    # Sanitize instead of throwing for format issues
    sanitized = sanitize_context_id(context_id)

    return sanitized


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
        ValueError: If context_id is invalid or path escapes expected directory
    """
    validated_id = validate_context_id(context_id)
    contexts_dir = get_contexts_dir(project_root)
    result_path = contexts_dir / validated_id

    # SECURITY: Verify resolved path stays within contexts directory
    # This prevents symlink attacks and any path manipulation we might have missed
    try:
        resolved = result_path.resolve()
        contexts_resolved = contexts_dir.resolve()
        # Check that resolved path starts with the contexts directory
        # Use os.path for cross-platform compatibility
        import os
        resolved_str = os.path.normcase(str(resolved))
        contexts_str = os.path.normcase(str(contexts_resolved))
        if not resolved_str.startswith(contexts_str):
            raise ValueError(f"Invalid context ID '{context_id}': path escapes contexts directory")
    except (OSError, ValueError) as e:
        if isinstance(e, ValueError):
            raise
        # OSError can occur if path doesn't exist yet, which is fine for creation
        pass

    return result_path


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


def get_context_reviews_dir(context_id: str, project_root: Path = None) -> Path:
    """
    Get the reviews directory for a specific context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/{context_id}/reviews/
    """
    return get_context_dir(context_id, project_root) / "reviews"


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


def get_archive_dir(project_root: Path = None) -> Path:
    """
    Get the archive directory path.

    Args:
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/archive/
    """
    return get_contexts_dir(project_root) / ARCHIVE_DIR


def get_archive_context_dir(context_id: str, project_root: Path = None) -> Path:
    """
    Get the archive directory for a specific context.

    Args:
        context_id: Context identifier
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/archive/{context_id}/

    Raises:
        ValueError: If context_id is invalid
    """
    validated_id = validate_context_id(context_id)
    return get_archive_dir(project_root) / validated_id


def get_archive_index_path(project_root: Path = None) -> Path:
    """
    Get the archive index file path.

    Args:
        project_root: Project root directory (default: cwd)

    Returns:
        Path to _output/contexts/archive/index.json
    """
    return get_archive_dir(project_root) / INDEX_FILENAME
