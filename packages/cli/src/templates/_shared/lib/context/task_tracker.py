"""Task tracker — direct state.json CRUD for tasks.

Writes tasks directly to the tasks[] array in state.json,
bypassing events.jsonl for faster, simpler task operations.

All functions do their own I/O to avoid circular imports with
context_store.py.
"""
import json
import re
from pathlib import Path
from typing import Dict, List, Optional

from ..base.atomic_write import atomic_write
from ..base.constants import get_context_dir
from ..base.utils import eprint, now_iso


# ---------------------------------------------------------------------------
# Internal I/O (avoids circular import with context_store)
# ---------------------------------------------------------------------------

def _state_path(context_id: str, project_root: Path = None) -> Path:
    return get_context_dir(context_id, project_root) / "state.json"


def _load_state(context_id: str, project_root: Path = None) -> Optional[dict]:
    sp = _state_path(context_id, project_root)
    if not sp.exists():
        return None
    try:
        return json.loads(sp.read_text(encoding="utf-8"))
    except Exception as e:
        eprint(f"[task_tracker] WARNING: Failed to read state.json: {e}")
        return None


def _save_state(context_id: str, state_data: dict, project_root: Path = None) -> bool:
    sp = _state_path(context_id, project_root)
    content = json.dumps(state_data, indent=2, ensure_ascii=False)
    success, error = atomic_write(sp, content)
    if not success:
        eprint(f"[task_tracker] WARNING: Failed to write state.json: {error}")
    return success


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_next_task_id(context_id: str, project_root: Path = None) -> str:
    """Scan tasks[] for highest aiw-N, return aiw-(N+1)."""
    state = _load_state(context_id, project_root)
    tasks = state.get("tasks", []) if state else []

    max_num = 0
    for t in tasks:
        tid = t.get("id", "")
        m = re.match(r"^aiw-(\d+)$", tid)
        if m:
            max_num = max(max_num, int(m.group(1)))

    return f"aiw-{max_num + 1}"


def add_task(
    context_id: str,
    subject: str,
    description: str = "",
    active_form: str = "",
    session_id: str = "",
    project_root: Path = None,
) -> Optional[dict]:
    """Add a new task to state.json tasks[] and return the task dict."""
    state = _load_state(context_id, project_root)
    if state is None:
        return None

    task_id = generate_next_task_id(context_id, project_root)
    task = {
        "id": task_id,
        "subject": subject,
        "description": description,
        "active_form": active_form,
        "status": "pending",
        "created_at": now_iso(),
        "completed_at": None,
        "evidence": "",
        "work_summary": "",
        "files_changed": [],
        "session_id": session_id,
    }

    state.setdefault("tasks", []).append(task)
    state["last_active"] = now_iso()

    if _save_state(context_id, state, project_root):
        return task
    return None


def update_task(
    context_id: str,
    task_id: str,
    status: str = None,
    evidence: str = "",
    work_summary: str = "",
    files_changed: List[str] = None,
    session_id: str = "",
    project_root: Path = None,
) -> bool:
    """Find task by task_id in tasks[], update fields, return True on success."""
    state = _load_state(context_id, project_root)
    if state is None:
        return False

    for task in state.get("tasks", []):
        if task.get("id") == task_id:
            if status is not None:
                task["status"] = status
                if status == "completed":
                    task["completed_at"] = now_iso()
            if evidence:
                task["evidence"] = evidence
            if work_summary:
                task["work_summary"] = work_summary
            if files_changed is not None:
                task["files_changed"] = files_changed
            if session_id:
                task["session_id"] = session_id
            state["last_active"] = now_iso()
            return _save_state(context_id, state, project_root)

    eprint(f"[task_tracker] Task '{task_id}' not found in context '{context_id}'")
    return False


def delete_task(context_id: str, task_id: str, project_root: Path = None) -> bool:
    """Remove task from tasks[] and return True on success."""
    state = _load_state(context_id, project_root)
    if state is None:
        return False

    tasks = state.get("tasks", [])
    original_len = len(tasks)
    state["tasks"] = [t for t in tasks if t.get("id") != task_id]

    if len(state["tasks"]) == original_len:
        eprint(f"[task_tracker] Task '{task_id}' not found in context '{context_id}'")
        return False

    state["last_active"] = now_iso()
    return _save_state(context_id, state, project_root)


def get_tasks(context_id: str, project_root: Path = None) -> List[dict]:
    """Return tasks[] from state.json."""
    state = _load_state(context_id, project_root)
    if state is None:
        return []
    return state.get("tasks", [])


def generate_task_summary(context_id: str, project_root: Path = None) -> str:
    """Partition tasks and format as markdown checklist."""
    tasks = get_tasks(context_id, project_root)
    if not tasks:
        return "No tasks in this context."

    completed = [t for t in tasks if t.get("status") == "completed"]
    in_progress = [t for t in tasks if t.get("status") == "in_progress"]
    pending = [t for t in tasks if t.get("status") == "pending"]
    blocked = [t for t in tasks if t.get("status") == "blocked"]

    lines = [f"### Tasks ({len(tasks)} total)", ""]

    for t in completed:
        ws = f"\n  Work: {t['work_summary']}" if t.get("work_summary") else ""
        lines.append(f"- [x] {t['id']}: {t['subject']}{ws}")
    for t in in_progress:
        lines.append(f"- [~] {t['id']}: {t['subject']}")
    for t in pending:
        lines.append(f"- [ ] {t['id']}: {t['subject']}")
    for t in blocked:
        lines.append(f"- [!] {t['id']}: {t['subject']}")

    return "\n".join(lines)
