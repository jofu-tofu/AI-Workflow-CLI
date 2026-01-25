"""Cross-platform atomic file writes with security.

Provides crash-safe file writes by writing to a temp file first,
then atomically replacing the target. This prevents corrupted files
if the process crashes mid-write.

Note: This is for crash-safety, NOT for concurrent access.
The shared context system assumes single-session-per-context.
"""
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional, Tuple

if sys.platform == 'win32':
    import ctypes
    from ctypes import wintypes

    # Windows MoveFileEx flags
    MOVEFILE_REPLACE_EXISTING = 0x1
    MOVEFILE_WRITE_THROUGH = 0x8

    def _atomic_replace_windows(src: Path, dst: Path) -> None:
        """Atomic file replacement on Windows using MoveFileEx."""
        kernel32 = ctypes.windll.kernel32

        # Set proper function prototypes for 64-bit safety
        kernel32.MoveFileExW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD]
        kernel32.MoveFileExW.restype = wintypes.BOOL

        result = kernel32.MoveFileExW(
            str(src),
            str(dst),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH
        )
        if not result:
            error_code = kernel32.GetLastError()
            raise ctypes.WinError(error_code)


def atomic_write(
    path: Path,
    content: str,
    max_attempts: int = 2,
    backoff_ms: Optional[list] = None
) -> Tuple[bool, Optional[str]]:
    """
    Write file atomically with retry logic.

    Creates a temp file in the same directory, writes content,
    then atomically replaces the target file. This ensures the
    file is never left in a corrupted state.

    Args:
        path: Target file path
        content: Content to write
        max_attempts: Maximum retry attempts (default: 2)
        backoff_ms: Retry backoff in milliseconds (default: [500, 1000])

    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    if backoff_ms is None:
        backoff_ms = [500, 1000]

    # Ensure parent directory exists
    path.parent.mkdir(parents=True, exist_ok=True)

    for attempt in range(max_attempts):
        try:
            # Create temp file in same directory for atomic rename
            temp_fd, temp_path_str = tempfile.mkstemp(
                dir=path.parent,
                prefix=f".{path.stem}_",
                suffix=".tmp"
            )
            temp_path = Path(temp_path_str)

            try:
                # Write content to temp file
                with os.fdopen(temp_fd, 'w', encoding='utf-8') as f:
                    f.write(content)
                    f.flush()
                    os.fsync(f.fileno())  # Force write to disk

                # Set restrictive permissions before rename (chmod 600)
                try:
                    os.chmod(temp_path, 0o600)
                except OSError:
                    pass  # chmod may fail on some filesystems

                # Platform-specific atomic rename
                if sys.platform == 'win32':
                    _atomic_replace_windows(temp_path, path)
                else:
                    temp_path.replace(path)  # POSIX atomic

                return (True, None)

            except Exception:
                # Clean up temp file on failure
                try:
                    temp_path.unlink()
                except Exception:
                    pass  # Cleanup is best-effort
                raise

        except Exception as e:
            if attempt < max_attempts - 1:
                # Bounds-safe backoff indexing
                wait_ms = backoff_ms[min(attempt, len(backoff_ms) - 1)]
                time.sleep(wait_ms / 1000.0)
            else:
                # Sanitize error message (no paths, no stack trace)
                error_type = type(e).__name__
                error_msg = str(e).split('\n')[0][:200]  # First line only, max 200 chars
                return (False, f"{error_type}: {error_msg}")

    return (False, "Max retry attempts exceeded")


def atomic_append(
    path: Path,
    content: str,
    max_attempts: int = 2,
    backoff_ms: Optional[list] = None
) -> Tuple[bool, Optional[str]]:
    """
    Append to file atomically with retry logic.

    For JSONL files, this is safe because each line is independent.
    If process crashes mid-append, only the last partial line is lost,
    which read_events() handles gracefully.

    Args:
        path: Target file path
        content: Content to append (should include newline if needed)
        max_attempts: Maximum retry attempts (default: 2)
        backoff_ms: Retry backoff in milliseconds (default: [500, 1000])

    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    if backoff_ms is None:
        backoff_ms = [500, 1000]

    # Ensure parent directory exists
    path.parent.mkdir(parents=True, exist_ok=True)

    # Check if file is being created (for permission setting)
    is_new_file = not path.exists()

    for attempt in range(max_attempts):
        try:
            with open(path, 'a', encoding='utf-8') as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())  # Force write to disk

            # Set restrictive permissions on newly created files (chmod 600)
            if is_new_file:
                try:
                    os.chmod(path, 0o600)
                except OSError:
                    pass  # chmod may fail on some filesystems

            return (True, None)

        except Exception as e:
            if attempt < max_attempts - 1:
                wait_ms = backoff_ms[min(attempt, len(backoff_ms) - 1)]
                time.sleep(wait_ms / 1000.0)
            else:
                error_type = type(e).__name__
                error_msg = str(e).split('\n')[0][:200]
                return (False, f"{error_type}: {error_msg}")

    return (False, "Max retry attempts exceeded")
