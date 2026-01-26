#!/usr/bin/env python3
"""Save a handoff document and set context status to handoff_pending.

Usage:
    python .aiwcli/_shared/scripts/save_handoff.py <context_id> <<'EOF'
    # Your handoff markdown content here
    EOF

Or with a file:
    python .aiwcli/_shared/scripts/save_handoff.py <context_id> < handoff.md

This script:
1. Reads handoff markdown content from stdin
2. Saves it to _output/contexts/{context_id}/handoffs/HANDOFF-{HHMM}.md
3. Sets in_flight.mode = "handoff_pending"
4. Records the event in events.jsonl

The handoff will be automatically picked up by the next session.
"""
import sys
from datetime import datetime
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SHARED_ROOT))

from lib.context.context_manager import update_handoff_status, get_context
from lib.base.utils import eprint, atomic_write


def main():
    if len(sys.argv) < 2:
        print("Usage: python save_handoff.py <context_id> < content.md", file=sys.stderr)
        print("       python save_handoff.py <context_id> <<'EOF'", file=sys.stderr)
        print("       ... markdown content ...", file=sys.stderr)
        print("       EOF", file=sys.stderr)
        sys.exit(1)

    context_id = sys.argv[1]

    # Read content from stdin
    content = sys.stdin.read()
    if not content.strip():
        print("Error: No content provided via stdin", file=sys.stderr)
        sys.exit(1)

    # Project root is the parent of .aiwcli
    project_root = SHARED_ROOT.parent.parent

    # Verify context exists
    context = get_context(context_id, project_root)
    if not context:
        print(f"Error: Context not found: {context_id}", file=sys.stderr)
        sys.exit(1)

    # Create handoffs directory
    handoffs_dir = project_root / "_output" / "contexts" / context_id / "handoffs"
    handoffs_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%H%M")
    filename = f"HANDOFF-{timestamp}.md"
    file_path = handoffs_dir / filename

    # Handle filename collision (add suffix if file exists)
    counter = 1
    while file_path.exists():
        filename = f"HANDOFF-{timestamp}-{counter}.md"
        file_path = handoffs_dir / filename
        counter += 1

    # Save the handoff document
    try:
        success, error = atomic_write(file_path, content)
        if not success:
            print(f"Error: Failed to write handoff: {error}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Error: Failed to write handoff: {e}", file=sys.stderr)
        sys.exit(1)

    # Update context status
    try:
        update_handoff_status(context_id, str(file_path), project_root)
    except Exception as e:
        eprint(f"[save_handoff] Warning: Status update failed: {e}")
        # Don't exit - file was saved successfully

    # Output success message
    print(f"✓ Saved handoff: {file_path}")
    print(f"✓ Set status to handoff_pending for context: {context_id}")
    print()
    print("The next session will automatically offer to resume from this handoff.")


if __name__ == "__main__":
    main()
