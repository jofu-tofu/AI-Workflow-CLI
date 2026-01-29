#!/usr/bin/env python3
"""Save a handoff document with folder-based sharding.

Usage:
    python .aiwcli/_shared/scripts/save_handoff.py <context_id> <<'EOF'
    # Your handoff markdown content here (with <!-- SECTION: name --> markers)
    EOF

Or with a file:
    python .aiwcli/_shared/scripts/save_handoff.py <context_id> < handoff.md

This script:
1. Parses sections from incoming markdown using <!-- SECTION: name --> markers
2. Creates a timestamped folder at _output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/
3. Writes sharded files:
   - index.md (main entry point with navigation)
   - completed-work.md, dead-ends.md, decisions.md, pending.md, context.md
   - plan.md (copy of original plan if it exists)
4. Records the event in events.jsonl (informational only)
"""
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SHARED_ROOT))

from lib.context.context_manager import get_context
from lib.base.utils import eprint
from lib.base.atomic_write import atomic_write
from lib.base.constants import get_handoff_folder_path


def parse_frontmatter(content: str) -> tuple[Dict[str, str], str]:
    """Parse YAML frontmatter from markdown content.

    Returns:
        Tuple of (frontmatter dict, remaining content)
    """
    frontmatter = {}
    remaining = content

    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            fm_lines = parts[1].strip().split('\n')
            for line in fm_lines:
                if ':' in line:
                    key, value = line.split(':', 1)
                    frontmatter[key.strip()] = value.strip()
            remaining = parts[2].strip()

    return frontmatter, remaining


def parse_handoff_sections(content: str) -> Dict[str, str]:
    """Parse markdown content by section markers.

    Looks for <!-- SECTION: name --> markers and extracts content between them.

    Returns:
        Dict mapping section names to their content
    """
    sections = {}
    current_section = None
    current_content = []

    for line in content.split('\n'):
        if line.strip().startswith('<!-- SECTION:'):
            # Save previous section
            if current_section:
                sections[current_section] = '\n'.join(current_content).strip()
            # Extract new section name
            match = re.search(r'<!-- SECTION:\s*(\S+)\s*-->', line)
            if match:
                current_section = match.group(1)
                current_content = []
        elif current_section:
            current_content.append(line)

    # Save final section
    if current_section:
        sections[current_section] = '\n'.join(current_content).strip()

    return sections


def get_git_status() -> str:
    """Get current git status."""
    try:
        result = subprocess.run(
            ['git', 'status', '--short'],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip() or "(no changes)"
    except Exception:
        return "(git status unavailable)"


def get_plan_path_from_context(context_id: str, project_root: Path) -> Optional[Path]:
    """Get the plan path from context.json if available."""
    context = get_context(context_id, project_root)
    if not context or not context.in_flight:
        return None

    artifact_path = context.in_flight.artifact_path
    if artifact_path:
        plan_path = Path(artifact_path)
        if plan_path.exists():
            return plan_path

    return None


def generate_index(
    frontmatter: Dict[str, str],
    sections: Dict[str, str],
    git_status: str,
    has_plan: bool,
) -> str:
    """Generate the index.md file with summary and navigation."""
    now = datetime.now()

    lines = [
        "---",
        "type: handoff",
        f"context_id: {frontmatter.get('context_id', 'unknown')}",
        f"created_at: {now.isoformat()}",
        f"session_id: {frontmatter.get('session_id', 'unknown')}",
        f"project: {frontmatter.get('project', 'unknown')}",
        f"plan_path: {frontmatter.get('plan_document', 'none')}",
        "---",
        "",
        f"# Session Handoff - {now.strftime('%Y-%m-%d %H:%M')}",
        "",
    ]

    # Summary section
    summary = sections.get('summary', '').strip()
    if summary:
        # Extract just the content (skip the ## Summary header if present)
        summary_lines = summary.split('\n')
        summary_text = '\n'.join(
            line for line in summary_lines
            if not line.strip().startswith('##')
        ).strip()
        lines.extend([
            "## Summary",
            summary_text,
            "",
        ])

    # Navigation table
    lines.extend([
        "## Quick Navigation",
        "",
        "| Document | Purpose | Priority |",
        "|----------|---------|----------|",
        "| [Dead Ends](./dead-ends.md) | Failed approaches - DO NOT RETRY | Read First |",
        "| [Pending](./pending.md) | Next steps and blockers | Action Items |",
        "| [Completed Work](./completed-work.md) | Tasks finished this session | Reference |",
        "| [Decisions](./decisions.md) | Technical choices and rationale | Reference |",
    ])

    if has_plan:
        lines.append("| [Plan](./plan.md) | Original plan being implemented | Reference |")

    lines.extend([
        "| [Context](./context.md) | External requirements and notes | Reference |",
        "",
        "## Continuation Instructions",
        "",
        "To continue this work in a new session:",
        "1. This index document provides the overview",
        "2. **Read [Dead Ends](./dead-ends.md) first** to avoid repeating failed approaches",
        "3. Check [Pending](./pending.md) for immediate next steps",
        "4. Reference other documents as needed",
        "",
        "## Git Status at Handoff",
        "```",
        git_status,
        "```",
        "",
    ])

    return '\n'.join(lines)


def write_section_file(folder: Path, filename: str, title: str, content: str) -> bool:
    """Write a section file with header."""
    lines = [
        f"# {title}",
        "",
        content if content else "(No content for this section)",
        "",
    ]

    file_path = folder / filename
    success, error = atomic_write(file_path, '\n'.join(lines))
    if not success:
        eprint(f"[save_handoff] Warning: Failed to write {filename}: {error}")
        return False
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python save_handoff.py <context_id> < content.md", file=sys.stderr)
        print("       python save_handoff.py <context_id> <<'EOF'", file=sys.stderr)
        print("       ... markdown content with <!-- SECTION: name --> markers ...", file=sys.stderr)
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

    # Parse frontmatter and sections
    frontmatter, body = parse_frontmatter(content)
    sections = parse_handoff_sections(body)

    eprint(f"[save_handoff] Parsed {len(sections)} sections: {list(sections.keys())}")

    # Create handoff folder
    handoff_folder = get_handoff_folder_path(context_id, project_root)
    handoff_folder.mkdir(parents=True, exist_ok=True)
    eprint(f"[save_handoff] Created folder: {handoff_folder}")

    # Get git status
    git_status = get_git_status()

    # Check for plan
    plan_path = get_plan_path_from_context(context_id, project_root)
    has_plan = plan_path is not None

    # Copy plan if exists
    if plan_path:
        try:
            plan_content = plan_path.read_text(encoding='utf-8')
            plan_dest = handoff_folder / "plan.md"
            success, error = atomic_write(plan_dest, plan_content)
            if success:
                eprint(f"[save_handoff] Copied plan from {plan_path}")
            else:
                eprint(f"[save_handoff] Warning: Failed to copy plan: {error}")
        except Exception as e:
            eprint(f"[save_handoff] Warning: Failed to read plan: {e}")

    # Write index.md
    index_content = generate_index(frontmatter, sections, git_status, has_plan)
    index_path = handoff_folder / "index.md"
    success, error = atomic_write(index_path, index_content)
    if not success:
        print(f"Error: Failed to write index.md: {error}", file=sys.stderr)
        sys.exit(1)

    # Write section files
    section_mapping = {
        'completed': ('completed-work.md', 'Work Completed'),
        'dead-ends': ('dead-ends.md', 'Dead Ends - Do Not Retry'),
        'decisions': ('decisions.md', 'Key Decisions'),
        'pending': ('pending.md', 'Pending Issues'),
        'next-steps': ('pending.md', None),  # Append to pending.md
        'files': ('completed-work.md', None),  # Append to completed-work.md
        'context': ('context.md', 'Context for Future Sessions'),
    }

    # Track which files we've written with their content
    file_contents: Dict[str, list] = {}

    for section_name, (filename, title) in section_mapping.items():
        section_content = sections.get(section_name, '')
        if not section_content:
            continue

        if title is None:
            # Append mode - add to existing content
            if filename not in file_contents:
                file_contents[filename] = []
            file_contents[filename].append(section_content)
        else:
            # Write mode - set as main content with title
            if filename not in file_contents:
                file_contents[filename] = [f"# {title}", "", section_content]
            else:
                # Insert title at beginning if not present
                file_contents[filename] = [f"# {title}", ""] + file_contents[filename] + ["", section_content]

    # Write all accumulated content
    for filename, content_parts in file_contents.items():
        file_path = handoff_folder / filename
        full_content = '\n'.join(content_parts) + '\n'
        success, error = atomic_write(file_path, full_content)
        if not success:
            eprint(f"[save_handoff] Warning: Failed to write {filename}: {error}")

    # Ensure all expected files exist (even if empty)
    expected_files = ['completed-work.md', 'dead-ends.md', 'decisions.md', 'pending.md', 'context.md']
    titles = {
        'completed-work.md': 'Work Completed',
        'dead-ends.md': 'Dead Ends - Do Not Retry',
        'decisions.md': 'Key Decisions',
        'pending.md': 'Pending Issues & Next Steps',
        'context.md': 'Context for Future Sessions',
    }

    for filename in expected_files:
        file_path = handoff_folder / filename
        if not file_path.exists():
            write_section_file(handoff_folder, filename, titles[filename], "")

    # Output success message (ASCII-safe for Windows)
    print(f"[OK] Created handoff folder: {handoff_folder}")
    print(f"  - index.md (entry point with navigation)")

    files_created = [f.name for f in handoff_folder.iterdir() if f.is_file() and f.name != 'index.md']
    print(f"  - {', '.join(sorted(files_created))}")

    print()
    print("Handoff document saved. Use this folder for context in the next session.")


if __name__ == "__main__":
    main()
