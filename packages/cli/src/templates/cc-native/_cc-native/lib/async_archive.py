"""Async background archival to avoid blocking user workflow."""
import threading
import json
from pathlib import Path
from typing import Dict, Any, Callable, Optional
from .atomic_write import atomic_write
from .constants import ENABLE_ROBUST_PLAN_WRITES

def archive_plan_async(
    out_path: Path,
    header: str,
    plan: str,
    callback: Optional[Callable] = None
) -> None:
    """
    Archive plan in background thread. Non-blocking.

    Args:
        out_path: Destination file path
        header: Plan header with metadata
        plan: Plan content
        callback: Optional callback(success: bool, error: str) on completion
    """
    if not ENABLE_ROBUST_PLAN_WRITES:
        # Legacy behavior - write directly
        try:
            out_path.write_text(header + plan + "\n", encoding="utf-8")
            if callback:
                callback(True, None)
        except Exception as e:
            if callback:
                callback(False, str(e))
        return

    def _archive_worker():
        success, error = atomic_write(out_path, header + plan + "\n")

        if not success:
            # Write sanitized error marker (no stack traces)
            error_marker = out_path.with_suffix('.error')
            error_content = f"Archive failed: {error}\n"

            try:
                # Use atomic write for error marker too
                atomic_write(
                    error_marker,
                    error_content,
                    max_attempts=1  # Don't retry error marker
                )
            except Exception:
                pass  # Error marker is best-effort

        if callback:
            try:
                callback(success, error)
            except Exception as e:
                # Log callback failures (daemon thread would otherwise swallow)
                import sys
                print(f"[async_archive] Callback failed: {e}", file=sys.stderr)

    # Start background thread
    thread = threading.Thread(target=_archive_worker, daemon=True)
    thread.start()
