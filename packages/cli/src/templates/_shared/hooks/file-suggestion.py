#!/usr/bin/env python3
"""File suggestion hook for Claude Code.

Suggests relevant files to include in context based on the current session:
- Context file (context.json) for the active context
- Plans from the active context's plans/ directory
- Handoffs from the active context's handoffs/ directory
- Reviews from the active context's reviews/ directory (including cc-native subdirectory)

Hook input (from Claude Code):
{
    "session_id": "abc123",
    "cwd": "/path/to/project",
    ...
}

Hook output:
JSON array of file paths to suggest, or empty array if no suggestions.
["/path/to/file1.md", "/path/to/file2.md"]
"""
import json
import sys
from pathlib import Path
from typing import List, Optional

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.utils import eprint, project_dir
from lib.base.constants import (
    get_context_plans_dir,
    get_context_handoffs_dir,
    get_context_reviews_dir,
    get_context_file_path,
)
from lib.context.context_manager import (
    get_context_by_session_id,
    get_all_in_flight_contexts,
    get_context,
)


def get_context_files(context_id: str, project_root: Path) -> List[str]:
    """
    Get all relevant files for a context.

    Collects:
    - Context file (context.json)
    - Plans (most recent first)
    - Handoffs: index.md from subdirectories (folder-based) OR flat .md files (legacy)
    - Reviews: index.md from subdirectories (folder-based) OR flat review.md (legacy)

    Args:
        context_id: Context identifier
        project_root: Project root path

    Returns:
        List of absolute file paths, sorted by modification time (most recent first)
    """
    files = []

    # Get context.json file first
    context_file = get_context_file_path(context_id, project_root)
    if context_file.exists():
        files.append(str(context_file))
        eprint(f"[file-suggestion] Found context file for {context_id}")

    # Get plans directory
    plans_dir = get_context_plans_dir(context_id, project_root)
    if plans_dir.exists():
        plan_files = list(plans_dir.glob("*.md"))
        # Sort by modification time, most recent first
        plan_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        files.extend([str(p) for p in plan_files])
        eprint(f"[file-suggestion] Found {len(plan_files)} plans in {context_id}")

    # Get handoffs - prefer folder-based (index.md in subdirectories), fall back to legacy
    handoffs_dir = get_context_handoffs_dir(context_id, project_root)
    if handoffs_dir.exists():
        # Find handoff folders (named like YYYY-MM-DD-HHMM or YYYY-MM-DD-HHMM-N)
        handoff_folders = sorted(
            [d for d in handoffs_dir.iterdir() if d.is_dir()],
            key=lambda d: d.name,
            reverse=True  # Most recent first (alphabetically sorts by date)
        )

        if handoff_folders:
            # Use folder-based: get index.md from most recent folder only
            index_file = handoff_folders[0] / "index.md"
            if index_file.exists():
                files.append(str(index_file))
                eprint(f"[file-suggestion] Found handoff folder: {handoff_folders[0].name}")
        else:
            # Legacy support: flat .md files directly in handoffs/
            legacy_handoffs = [f for f in handoffs_dir.glob("*.md") if f.is_file()]
            legacy_handoffs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            if legacy_handoffs:
                files.append(str(legacy_handoffs[0]))  # Only most recent legacy
                eprint(f"[file-suggestion] Found {len(legacy_handoffs)} legacy handoffs in {context_id}")

    # Get reviews - prefer folder-based (index.md in subdirectories), fall back to legacy
    reviews_dir = get_context_reviews_dir(context_id, project_root) / "cc-native"
    if reviews_dir.exists():
        # Find review folders (named like YYYY-MM-DD-HHMM-iteration-N)
        review_folders = sorted(
            [d for d in reviews_dir.iterdir() if d.is_dir()],
            key=lambda d: d.name,
            reverse=True  # Most recent first
        )

        if review_folders:
            # Use folder-based: get index.md from most recent folder only
            index_file = review_folders[0] / "index.md"
            if index_file.exists():
                files.append(str(index_file))
                eprint(f"[file-suggestion] Found review folder: {review_folders[0].name}")
        else:
            # Legacy support: flat review.md directly in cc-native/
            legacy_review = reviews_dir / "review.md"
            if legacy_review.exists():
                files.append(str(legacy_review))
                eprint(f"[file-suggestion] Found legacy review.md in {context_id}")

    return files


def get_active_context_id(session_id: str, project_root: Path) -> Optional[str]:
    """
    Determine the active context for suggestions.

    Priority:
    1. Context bound to current session_id
    2. Single in-flight context (if only one exists)
    3. None (no suggestions if ambiguous)

    Args:
        session_id: Current session identifier
        project_root: Project root path

    Returns:
        Context ID or None
    """
    # Try session_id lookup first
    if session_id and session_id != "unknown":
        context = get_context_by_session_id(session_id, project_root)
        if context:
            eprint(f"[file-suggestion] Found context by session: {context.id}")
            return context.id

    # Fall back to single in-flight context
    in_flight = get_all_in_flight_contexts(project_root)
    if len(in_flight) == 1:
        eprint(f"[file-suggestion] Using single in-flight context: {in_flight[0].id}")
        return in_flight[0].id

    eprint(f"[file-suggestion] No unique context found (in-flight: {len(in_flight)})")
    return None


def main():
    """
    Main entry point for file suggestion hook.

    Reads hook input from stdin, determines active context,
    and outputs file suggestions as JSON array.
    """
    try:
        # Read hook input from stdin
        input_data = sys.stdin.read().strip()

        if not input_data:
            print("[]")
            return

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            eprint("[file-suggestion] Failed to parse input JSON")
            print("[]")
            return

        # Get project root and session ID
        project_root = project_dir(hook_input)
        session_id = hook_input.get("session_id", "unknown")

        eprint(f"[file-suggestion] Session: {session_id[:8]}..., Project: {project_root}")

        # Determine active context
        context_id = get_active_context_id(session_id, project_root)

        if not context_id:
            print("[]")
            return

        # Collect file suggestions
        suggestions = get_context_files(context_id, project_root)

        # Limit suggestions to prevent overwhelming the context
        MAX_SUGGESTIONS = 10
        if len(suggestions) > MAX_SUGGESTIONS:
            eprint(f"[file-suggestion] Limiting suggestions to {MAX_SUGGESTIONS} (was {len(suggestions)})")
            suggestions = suggestions[:MAX_SUGGESTIONS]

        # Output suggestions as JSON array
        eprint(f"[file-suggestion] Suggesting {len(suggestions)} files")
        print(json.dumps(suggestions))

    except Exception as e:
        eprint(f"[file-suggestion] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())
        print("[]")


if __name__ == "__main__":
    main()
