"""Core utilities for shared context management.

Provides common functions used across all shared modules:
- eprint: Print to stderr
- now_local: Get current local datetime
- project_dir: Get project directory from environment
- sanitize_filename: Sanitize string for use in filenames
- generate_context_id: Generate a slug from summary text
"""
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


def eprint(*args: Any) -> None:
    """Print to stderr."""
    print(*args, file=sys.stderr)


def now_local() -> datetime:
    """Get current local datetime."""
    return datetime.now()


def now_iso() -> str:
    """Get current time as ISO 8601 string."""
    return datetime.now().isoformat()


def project_dir(payload: Optional[Dict[str, Any]] = None) -> Path:
    """
    Get project directory from payload or environment.

    Priority:
    1. CLAUDE_PROJECT_DIR environment variable
    2. 'cwd' from payload (if provided)
    3. Current working directory

    Args:
        payload: Optional hook payload with 'cwd' field

    Returns:
        Path to project directory

    Note:
        CLAUDE_PROJECT_DIR is validated to be an absolute path when provided.
    """
    p = os.environ.get("CLAUDE_PROJECT_DIR")
    if p:
        # Validate that CLAUDE_PROJECT_DIR is an absolute path
        path = Path(p)
        if not path.is_absolute():
            eprint(f"[utils] WARNING: CLAUDE_PROJECT_DIR is not absolute, using cwd instead")
            p = None
        else:
            # Check for suspicious patterns
            if '..' in str(path):
                eprint(f"[utils] WARNING: CLAUDE_PROJECT_DIR contains '..' pattern, using cwd instead")
                p = None

    if not p and payload:
        p = payload.get("cwd")
    if not p:
        p = os.getcwd()
    return Path(p)


# Windows reserved filenames that should be blocked
_WINDOWS_RESERVED = frozenset([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])


def sanitize_filename(s: str, max_len: int = 32, allow_leading_dot: bool = False) -> str:
    """
    Sanitize string for use in filename.

    Replaces non-alphanumeric characters (except ._-) with underscores,
    strips leading/trailing special characters, and truncates.

    Args:
        s: Input string
        max_len: Maximum length (default: 32)
        allow_leading_dot: Whether to allow leading dots (default: False for security)

    Returns:
        Sanitized filename-safe string
    """
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    result = s.strip("._-")[:max_len] or "unknown"

    # Remove leading dots unless explicitly allowed (prevents hidden files)
    if not allow_leading_dot:
        result = result.lstrip('.')

    # Check for Windows reserved names
    base_name = result.split('.')[0].upper()
    if base_name in _WINDOWS_RESERVED:
        result = f"_{result}"

    return result or "unknown"


def sanitize_title(s: str, max_len: int = 50) -> str:
    """
    Sanitize title for use in context ID or filename.

    Converts spaces to hyphens, replaces special characters,
    and normalizes to lowercase.

    Args:
        s: Input string
        max_len: Maximum length (default: 50)

    Returns:
        Sanitized slug-like string
    """
    s = s.lower().strip()
    s = s.replace(' ', '-')
    s = re.sub(r"[^a-z0-9._-]+", "_", s)
    s = re.sub(r"[-_]+", "-", s)
    result = s.strip("._-")[:max_len] or "unknown"

    # Check for Windows reserved names
    base_name = result.split('.')[0].upper()
    if base_name in _WINDOWS_RESERVED:
        result = f"_{result}"

    return result or "unknown"


def generate_context_id(summary: str, existing_ids: Optional[set] = None) -> str:
    """
    Generate a context ID from a summary string.

    Creates a slug from the first ~50 chars of summary,
    ensuring uniqueness if existing_ids is provided.

    Args:
        summary: Context summary text
        existing_ids: Optional set of existing context IDs to avoid

    Returns:
        Unique context ID string
    """
    if not summary or not summary.strip():
        base_id = "context"
    else:
        # Take first 50 chars, sanitize to slug
        base_id = sanitize_title(summary[:50])

    if not existing_ids:
        return base_id

    # Ensure uniqueness by appending counter if needed
    if base_id not in existing_ids:
        return base_id

    counter = 2
    while f"{base_id}-{counter}" in existing_ids:
        counter += 1

    return f"{base_id}-{counter}"


def format_timestamp(dt: Optional[datetime] = None) -> str:
    """
    Format datetime for display.

    Args:
        dt: Datetime to format (default: now)

    Returns:
        Formatted string like "2026-01-25 10:30:00"
    """
    if dt is None:
        dt = now_local()
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def parse_iso_timestamp(iso_str: str) -> Optional[datetime]:
    """
    Parse ISO 8601 timestamp string.

    Args:
        iso_str: ISO format timestamp

    Returns:
        datetime object or None if parsing fails
    """
    try:
        # Handle both with and without microseconds
        if '.' in iso_str:
            return datetime.fromisoformat(iso_str)
        else:
            return datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None
