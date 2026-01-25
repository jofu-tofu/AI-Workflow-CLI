"""Handoff document generator for context-aware session management.

Creates structured handoff documents when a session needs to transfer
work to a new session (typically due to context window limits).

Handoff documents capture:
- Links to active plan and context folder
- Current task state from events.jsonl
- Work in progress summary
- Next steps for continuation
"""
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..base.atomic_write import atomic_write
from ..base.constants import get_context_handoffs_dir, get_context_dir
from ..base.utils import eprint, now_iso
from ..context.event_log import (
    append_event,
    get_current_state,
    get_pending_tasks,
    Task,
    EVENT_HANDOFF_CREATED,
)


@dataclass
class HandoffDocument:
    """Structured handoff document content."""
    context_id: str
    context_summary: str
    session_id: str
    reason: str  # e.g., "low_context", "user_requested", "error_recovery"
    created_at: str

    # Links
    plan_path: Optional[str] = None
    context_folder: str = ""
    events_log_path: str = ""

    # Task state
    active_tasks: List[Dict[str, Any]] = field(default_factory=list)
    completed_tasks_this_session: List[Dict[str, Any]] = field(default_factory=list)

    # Context summary
    work_summary: str = ""
    next_steps: List[str] = field(default_factory=list)
    important_notes: List[str] = field(default_factory=list)

    # File path (set after saving)
    file_path: Optional[str] = None


def generate_handoff_document(
    context_id: str,
    reason: str = "low_context",
    work_summary: str = "",
    next_steps: Optional[List[str]] = None,
    important_notes: Optional[List[str]] = None,
    completed_this_session: Optional[List[str]] = None,
    project_root: Path = None
) -> Optional[HandoffDocument]:
    """
    Generate and save a handoff document for a context.

    This creates a markdown document capturing current work state,
    saves it to the context's handoffs folder, and records the event.

    Args:
        context_id: Context identifier
        reason: Why handoff is happening (low_context, user_requested, etc.)
        work_summary: Summary of current work in progress
        next_steps: List of next steps for continuation
        important_notes: Important decisions or context to preserve
        completed_this_session: List of task subjects completed this session
        project_root: Project root directory

    Returns:
        HandoffDocument with file_path set, or None on failure
    """
    from ..context.context_manager import get_context, update_handoff_status

    context = get_context(context_id, project_root)
    if not context:
        eprint(f"[handoff] ERROR: Context '{context_id}' not found")
        return None

    # Generate session ID
    session_id = str(uuid.uuid4())[:8]

    # Get current state
    state = get_current_state(context_id, project_root)
    pending_tasks = get_pending_tasks(context_id, project_root)

    # Build document
    now = now_iso()
    context_dir = get_context_dir(context_id, project_root)

    doc = HandoffDocument(
        context_id=context_id,
        context_summary=context.summary,
        session_id=session_id,
        reason=reason,
        created_at=now,
        plan_path=context.in_flight.artifact_path if context.in_flight else None,
        context_folder=str(context_dir),
        events_log_path=str(context_dir / "events.jsonl"),
        active_tasks=[_task_to_dict(t) for t in pending_tasks],
        completed_tasks_this_session=[
            {"subject": s} for s in (completed_this_session or [])
        ],
        work_summary=work_summary,
        next_steps=next_steps or [],
        important_notes=important_notes or [],
    )

    # Compute file path BEFORE rendering markdown
    handoffs_dir = get_context_handoffs_dir(context_id, project_root)
    handoffs_dir.mkdir(parents=True, exist_ok=True)

    # Filename: YYYY-MM-DD-session-{session_id}.md
    date_str = datetime.now().strftime("%Y-%m-%d")
    filename = f"{date_str}-session-{session_id}.md"
    file_path = handoffs_dir / filename

    # Set file_path on doc BEFORE rendering markdown
    doc.file_path = str(file_path)

    # Generate markdown content
    markdown = _render_handoff_markdown(doc)

    # Save to handoffs folder

    success, error = atomic_write(file_path, markdown)
    if not success:
        eprint(f"[handoff] ERROR: Failed to write handoff document: {error}")
        return None

    # Record event
    append_event(
        context_id,
        EVENT_HANDOFF_CREATED,
        project_root,
        path=str(file_path),
        reason=reason,
        session_id=session_id
    )

    # Update context in_flight state
    update_handoff_status(context_id, str(file_path), project_root)

    eprint(f"[handoff] Created handoff document: {file_path}")
    return doc


def _task_to_dict(task: Task) -> Dict[str, Any]:
    """Convert Task to dictionary for handoff document."""
    return {
        "id": task.id,
        "subject": task.subject,
        "status": task.status,
        "description": task.description,
    }


def _render_handoff_markdown(doc: HandoffDocument) -> str:
    """Render handoff document as markdown."""
    lines = [
        f"# Session Handoff: {doc.context_id}",
        "",
        f"**Created**: {doc.created_at}",
        f"**Context ID**: {doc.context_id}",
        f"**Session ID**: {doc.session_id}",
        f"**Reason**: {_format_reason(doc.reason)}",
        "",
        "## Links",
        "",
    ]

    # Plan link
    if doc.plan_path:
        lines.append(f"- **Plan**: [{Path(doc.plan_path).name}]({doc.plan_path})")

    lines.extend([
        f"- **Context Folder**: `{doc.context_folder}`",
        f"- **Events Log**: `{doc.events_log_path}`",
        "",
        "## Current State",
        "",
    ])

    # Active tasks
    if doc.active_tasks:
        lines.append("### Active Tasks")
        lines.append("")
        for task in doc.active_tasks:
            status_icon = {
                "pending": "⬜",
                "in_progress": "🔄",
                "blocked": "🚫",
            }.get(task.get("status", "pending"), "⬜")

            status_text = f"[{task.get('status', 'pending').upper()}]"
            lines.append(f"- {status_icon} {status_text} {task.get('subject', 'Unknown')}")
            if task.get("description"):
                desc = task['description']
                if len(desc) > 100:
                    lines.append(f"  - {desc[:100]}...")
                else:
                    lines.append(f"  - {desc}")
        lines.append("")
    else:
        lines.append("### Active Tasks")
        lines.append("")
        lines.append("No active tasks.")
        lines.append("")

    # Completed this session
    if doc.completed_tasks_this_session:
        lines.append("### Completed This Session")
        lines.append("")
        for task in doc.completed_tasks_this_session:
            lines.append(f"- [DONE] {task.get('subject', 'Unknown')}")
        lines.append("")

    # Work summary
    if doc.work_summary:
        lines.extend([
            "## Context Summary",
            "",
            doc.work_summary,
            "",
        ])

    # Next steps
    if doc.next_steps:
        lines.extend([
            "## Next Steps",
            "",
        ])
        for i, step in enumerate(doc.next_steps, 1):
            lines.append(f"{i}. {step}")
        lines.append("")

    # Important notes
    if doc.important_notes:
        lines.extend([
            "## Important Notes",
            "",
        ])
        for note in doc.important_notes:
            lines.append(f"- {note}")
        lines.append("")

    # Continuation prompt
    lines.extend([
        "---",
        "",
        "**Continuation Prompt**:",
        "```",
        f'Continue working on context "{doc.context_id}".',
        "",
        f"Handoff document: {doc.file_path or 'See above'}",
        "",
        "Read the handoff document, restore tasks with TaskCreate, and continue implementation.",
        "```",
    ])

    return "\n".join(lines)


def _format_reason(reason: str) -> str:
    """Format reason code as human-readable string."""
    reason_map = {
        "low_context": "Context window running low",
        "user_requested": "User requested handoff",
        "error_recovery": "Error recovery",
        "session_end": "Session ending",
    }
    return reason_map.get(reason, reason)


def get_handoff_continuation_prompt(doc: HandoffDocument) -> str:
    """
    Generate the prompt to paste into new session for continuation.

    Args:
        doc: HandoffDocument with file_path set

    Returns:
        Prompt string for continuing work
    """
    return f"""Continue working on context "{doc.context_id}".

Handoff document: {doc.file_path}

Read the handoff document, restore tasks with TaskCreate, and continue implementation."""


def get_low_context_warning(context_remaining_percent: int, context_id: str) -> str:
    """
    Generate system reminder for low context warning.

    This is injected by the UserPromptSubmit hook when context is low.

    Args:
        context_remaining_percent: Percentage of context remaining
        context_id: Current context identifier

    Returns:
        System reminder markdown
    """
    return f"""<system-reminder>
## LOW CONTEXT WARNING ({context_remaining_percent}% remaining)

Your context window is running low. Please:

1. **Finish current task** if 1-2 steps away, OR save current progress
2. **Create handoff document** by calling:
   ```python
   from _shared.lib.handoff import generate_handoff_document
   doc = generate_handoff_document(
       context_id="{context_id}",
       reason="low_context",
       work_summary="<describe current work>",
       next_steps=["<step 1>", "<step 2>"],
       important_notes=["<key decision 1>"]
   )
   ```
3. **Ask permission** to clear and paste continuation prompt

After creating handoff, ask the user:
"Context is low. I've created a handoff document. May I clear and continue in a new session?"
</system-reminder>"""
