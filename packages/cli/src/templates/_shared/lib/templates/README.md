# Shared Templates Module

Centralized templates and formatters for consistent context management output across discovery, handoff, and hooks.

## Purpose

This module eliminates duplication by providing a single source of truth for:
- Mode displays (planning, implementing, etc.)
- Status icons (pending, in_progress, completed)
- Task rendering formatters
- Context continuation headers
- Plan context templates
- Handoff reason formatting

## Modules

### `formatters.py`

Core formatters and constants for context management output.

#### Constants

```python
MODE_DISPLAY_MAP = {
    "planning": "[Planning]",
    "pending_implementation": "[Plan Ready]",
    "implementing": "[Implementing]",
    "handoff_pending": "[Handoff Pending]",
    "none": "",
}

STATUS_ICON_MAP = {
    "pending": "⬜",
    "in_progress": "🔄",
    "blocked": "🚫",
    "completed": "✅",
}

REASON_MAP = {
    "low_context": "Context window running low",
    "user_requested": "User requested handoff",
    "error_recovery": "Error recovery",
    "session_end": "Session ending",
}
```

#### Functions

**`get_mode_display(mode: str) -> str`**

Get display string for in-flight mode.

```python
>>> get_mode_display("planning")
"[Planning]"
>>> get_mode_display("none")
""
```

**`get_status_icon(status: str) -> str`**

Get emoji icon for task status.

```python
>>> get_status_icon("pending")
"⬜"
>>> get_status_icon("completed")
"✅"
```

**`render_task_item(task, show_description=True, max_description_length=100) -> str`**

Render single task with status icon and subject.

```python
task = {"status": "pending", "subject": "Fix bug", "description": "Details"}
>>> render_task_item(task)
"- ⬜ [PENDING] Fix bug\n  - Details"
```

**`render_task_list(tasks, header="Active Tasks", show_description=True) -> str`**

Render list of tasks with header.

```python
tasks = [{"status": "pending", "subject": "Task 1", "description": "Details"}]
>>> render_task_list(tasks, header="My Tasks")
"### My Tasks\n\n- ⬜ [PENDING] Task 1\n  - Details\n"
```

**`format_continuation_header(header_type: str, context_id: str) -> str`**

Format continuation header for various scenarios.

```python
>>> format_continuation_header("resuming", "my-context")
"## RESUMING FROM HANDOFF: my-context"
```

Types: `context`, `resuming`, `implementing`, `handoff`

**`format_reason(reason: str) -> str`**

Format handoff reason code as human-readable string.

```python
>>> format_reason("low_context")
"Context window running low"
```

### `plan_context.py`

Plan context templates for the add_plan_context hook.

**`get_evaluation_context_reminder() -> str`**

Returns the evaluation context reminder template that prompts Claude to add evaluation context to plans.

**`get_questions_offer_template() -> str`**

Returns the clarifying questions offer template shown on first plan write.

## Usage

### In Discovery Functions

```python
from ..templates.formatters import (
    get_mode_display,
    get_status_icon,
    format_continuation_header,
)

# Display mode status
mode_display = get_mode_display(context.in_flight.mode)
status = f"Context: {context.id} {mode_display}"

# Render task with icon
icon = get_status_icon(task.status)
output = f"{icon} {task.subject}"

# Create continuation header
header = format_continuation_header("implementing", context.id)
```

### In Document Generator

```python
from ..templates.formatters import render_task_list, format_reason

# Render task list section
tasks_md = render_task_list(doc.active_tasks, header="Active Tasks")
lines.append(tasks_md)

# Format handoff reason
reason_text = format_reason(doc.reason)
```

### In Hooks

```python
from templates.plan_context import (
    get_evaluation_context_reminder,
    get_questions_offer_template,
)

# Get plan context templates
CONTEXT_REMINDER = get_evaluation_context_reminder()
QUESTIONS_OFFER = get_questions_offer_template()
```

## Dependent Files

Files that import from this module:

- `.aiwcli/_shared/lib/context/discovery.py`
  - Uses: `get_mode_display`, `get_status_icon`, `format_continuation_header`

- `.aiwcli/_shared/lib/handoff/document_generator.py`
  - Uses: `render_task_list`, `format_continuation_header`, `format_reason`

- `.aiwcli/_cc-native/hooks/add_plan_context.py`
  - Uses: `get_evaluation_context_reminder`, `get_questions_offer_template`

## Design Principles

1. **Single Source of Truth**: Each constant/function exists in one location only
2. **Backward Compatible**: All functions preserve existing output formats
3. **Type Flexible**: Functions handle both Task objects and dicts
4. **Fail-Safe**: Use `.get()` with defaults for missing keys

## Testing

```bash
# Test imports
cd .aiwcli
python -c "from _shared.lib.templates.formatters import get_mode_display; \
           assert get_mode_display('planning') == '[Planning]'"

# Test task rendering
python -c "from _shared.lib.templates.formatters import get_status_icon; \
           assert get_status_icon('pending') != ''"
```

## Synchronization

Changes to this module must be synchronized to the template directory:

```bash
# After editing
cp .aiwcli/_shared/lib/templates/*.py \
   packages/cli/src/templates/_shared/lib/templates/
```

See `CLAUDE.md` for template synchronization requirements.
