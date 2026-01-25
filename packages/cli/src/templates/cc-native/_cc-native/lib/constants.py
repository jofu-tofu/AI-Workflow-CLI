"""Security and configuration constants."""
from pathlib import Path
import os

# Feature flags
ENABLE_ROBUST_PLAN_WRITES = os.getenv('CC_NATIVE_ROBUST_WRITES', 'true').lower() == 'true'
ENABLE_PLAN_NOTIFICATIONS = os.getenv('CC_NATIVE_NOTIFICATIONS', 'false').lower() == 'true'

# Security constants
PLANS_DIR = Path.home() / ".claude" / "plans"
MAX_PLAN_PATH_LENGTH = 4096
MAX_ERROR_FILE_SIZE = 10 * 1024  # 10KB

# Performance constants
MAX_RETRY_ATTEMPTS = 2  # Fast-fail: 2 attempts max
RETRY_BACKOFF_MS = [500, 1000]  # 0.5s, 1s (total 1.5s max)
MAX_TOTAL_RETRY_TIME_MS = 3000  # 3 seconds total, well under 5s hook timeout

def validate_plan_path(plan_path: str) -> Path:
    """
    Validate and sanitize plan path to prevent traversal attacks.

    Raises:
        ValueError: If path is invalid, too long, or outside allowed directory
    """
    # Input validation
    if not plan_path or len(plan_path) > MAX_PLAN_PATH_LENGTH:
        raise ValueError(f"Invalid plan path length: {len(plan_path) if plan_path else 0}")

    if '\x00' in plan_path:
        raise ValueError("Null bytes not allowed in path")

    # Normalize and resolve to absolute canonical path
    try:
        resolved = Path(plan_path).resolve(strict=False)
    except (OSError, RuntimeError) as e:
        raise ValueError(f"Path resolution failed: {e}")

    # Verify path is within allowed directory
    try:
        resolved.relative_to(PLANS_DIR)
    except ValueError:
        raise ValueError(f"Path outside allowed directory: {PLANS_DIR}")

    return resolved
