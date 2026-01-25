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
    """
    p = os.environ.get("CLAUDE_PROJECT_DIR")
    if not p and payload:
        p = payload.get("cwd")
    if not p:
        p = os.getcwd()
    return Path(p)


def sanitize_filename(s: str, max_len: int = 32) -> str:
    """
    Sanitize string for use in filename.

    Replaces non-alphanumeric characters (except ._-) with underscores,
    strips leading/trailing special characters, and truncates.

    Args:
        s: Input string
        max_len: Maximum length (default: 32)

    Returns:
        Sanitized filename-safe string
    """
    s = re.sub(r"[^A-Za-z0-9._-]+", "_", s)
    return s.strip("._-")[:max_len] or "unknown"


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
    return s.strip("._-")[:max_len] or "unknown"


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
