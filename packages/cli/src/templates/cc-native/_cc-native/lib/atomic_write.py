"""Cross-platform atomic file writes with security."""
import os
import sys
import tempfile
from pathlib import Path
from typing import Optional

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
            # Use ctypes.WinError for human-readable error messages
            raise ctypes.WinError(error_code)

def atomic_write(
    path: Path,
    content: str,
    max_attempts: int = 2,
    backoff_ms: list = None
) -> tuple:
    """
    Write file atomically with retry logic.

    Returns:
        (success: bool, error_message: Optional[str])
    """
    import time

    if backoff_ms is None:
        backoff_ms = [500, 1000]

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
                os.chmod(temp_path, 0o600)

                # Platform-specific atomic rename
                if sys.platform == 'win32':
                    _atomic_replace_windows(temp_path, path)
                else:
                    temp_path.replace(path)  # POSIX atomic

                return (True, None)

            except Exception as e:
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
