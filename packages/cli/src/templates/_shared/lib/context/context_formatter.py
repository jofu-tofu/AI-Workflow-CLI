"""Formatting module for context display output.

Consolidates output formatting previously in discovery.py and context_enforcer.py (both now deleted).
All functions accept a ContextState (from context_store.py) with fields:
    id, summary, mode, last_active, plan_path, handoff_path,
    tasks[], last_session, session_ids, status, method, tags
"""
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..base.utils import parse_iso_timestamp

MODE_DISPLAY_MAP = {
    "idle": "",
    "has_plan": "[Plan Ready]",
    "active": "[Active]",
}


def get_mode_display(mode: str) -> str:
    """Get bracketed display string for mode, or empty for idle."""
    return MODE_DISPLAY_MAP.get(mode, "")


def format_relative_time(iso_timestamp: Optional[str]) -> str:
    """Format ISO timestamp as '2 hours ago', 'yesterday', etc."""
    if not iso_timestamp:
        return "unknown"
    dt = parse_iso_timestamp(iso_timestamp)
    if not dt:
        return iso_timestamp[:16]
    now = datetime.now()
    if dt.tzinfo is not None:
        try:
            dt = dt.replace(tzinfo=None)
        except Exception:
            return iso_timestamp[:16]
    diff = now - dt
    if diff.days == 0:
        hours = diff.seconds // 3600
        if hours == 0:
            minutes = diff.seconds // 60
            if minutes == 0:
                return "just now"
            return "1 minute ago" if minutes == 1 else f"{minutes} minutes ago"
        return "1 hour ago" if hours == 1 else f"{hours} hours ago"
    if diff.days == 1:
        return "yesterday"
    if diff.days < 7:
        return f"{diff.days} days ago"
    return dt.strftime("%Y-%m-%d")


# ── Internal helpers ───────────────────────────────────────────────

def _task_attr(task, key: str, default: str = "") -> str:
    """Extract attribute from a task (dict or object)."""
    return task.get(key, default) if isinstance(task, dict) else getattr(task, key, default)


def _build_restore_sections(ctx, project_root: Path = None) -> str:
    """Build restore sections from last_session, tasks, and plan_path."""
    sections = []
    last_session = getattr(ctx, "last_session", None) or {}

    if last_session:
        saved_at = last_session.get("saved_at", "")
        if saved_at:
            reason = last_session.get("save_reason", "")
            reason_display = reason.replace("_", " ") if reason else "unknown"
            sections.append(f"**Last session ended:** {format_relative_time(saved_at)} ({reason_display})")

    tasks = getattr(ctx, "tasks", None) or []
    if tasks:
        buckets = {"completed": [], "in_progress": [], "pending": [], "blocked": []}
        for t in tasks:
            s = _task_attr(t, "status", "pending")
            if s in buckets:
                buckets[s].append(_task_attr(t, "subject"))
        if any(buckets.values()):
            sections.extend(["", f"### Previous Work ({len(tasks)} tasks)", ""])
            marks = {"completed": "[x]", "in_progress": "[~]", "pending": "[ ]", "blocked": "[!]"}
            for status, mark in marks.items():
                for subj in buckets[status]:
                    sections.append(f"- {mark} {subj}")

    plan_path = getattr(ctx, "plan_path", None)
    if plan_path:
        sections.extend(["", "### Plan", f"Read the plan at: `{plan_path}`"])

    git_state = last_session.get("git_state", {}) if last_session else {}
    if git_state:
        branch = git_state.get("branch", "unknown")
        uncommitted = git_state.get("uncommitted_files", [])
        last_commit = git_state.get("last_commit_short", "")
        unc_str = ", ".join(uncommitted[:5]) if uncommitted else "none"
        if len(uncommitted) > 5:
            unc_str += f" (+{len(uncommitted) - 5} more)"
        sections.extend(["", "### Git State", f"Branch: {branch} | Uncommitted: {unc_str}"])
        if last_commit:
            sections.append(f"Last commit: {last_commit}")

    return "\n".join(sections)


def _mode_label(ctx) -> str:
    """Get unbracketed mode label for inline display, defaulting to 'Active'."""
    d = get_mode_display(getattr(ctx, "mode", "idle"))
    return d.strip("[]") if d else "Active"


def _resume_block(ctx, project_root, mode_text, instructions):
    """Common pattern: resume header + restore + instructions."""
    lines = [f"## Resuming Context: {ctx.id}", "", f"**Summary:** {ctx.summary}", f"**Mode:** {mode_text}"]
    restore = _build_restore_sections(ctx, project_root)
    if restore:
        lines.append(restore)
    lines.extend(["", "---", "", "**Instructions:**"])
    lines.extend(instructions)
    return "\n".join(lines)


# ── Public formatters ──────────────────────────────────────────────

def format_handoff_continuation(ctx, project_root: Path = None) -> str:
    """Format output when resuming a context with a pending handoff."""
    handoff_path = getattr(ctx, "handoff_path", None) or ""
    lines = [
        f"## Resuming Context: {ctx.id} (Handoff Available)", "",
        f"**Summary:** {ctx.summary}",
        f"**Mode:** Implementing (handoff from previous session)", "",
    ]
    try:
        hf = Path(handoff_path)
        if hf.exists():
            lines.extend(["### Previous Session Handoff", "", hf.read_text(encoding="utf-8"), ""])
        else:
            lines.extend([f"*Handoff document not found at `{handoff_path}`*", ""])
    except Exception as e:
        lines.extend([f"*Handoff document at `{handoff_path}` could not be read: {e}*", ""])
    restore = _build_restore_sections(ctx, project_root)
    if restore:
        lines.append(restore)
    lines.extend(["", "---", "", "**Instructions:**",
        "1. Review the handoff document above - especially dead ends",
        "2. Check the plan file for remaining tasks",
        "3. Continue implementation from where the previous session left off"])
    return "\n".join(lines)


def format_plan_continuation(ctx, project_root: Path = None) -> str:
    """Format output for pending plan implementation (mode=has_plan)."""
    return _resume_block(ctx, project_root, "Pending Implementation", [
        "1. Review the plan and previous work above",
        "2. Continue from where the previous session left off"])


def format_active_continuation(ctx, project_root: Path = None) -> str:
    """Format output for ongoing implementation (mode=active)."""
    return _resume_block(ctx, project_root, "Implementing", [
        "1. Review the plan and previous work above",
        "2. Continue from where the previous session left off"])


def format_context_list(contexts: list) -> str:
    """Format list of contexts for display."""
    if not contexts:
        return "No active contexts found."
    lines = ["## Active Contexts\n"]
    for i, ctx in enumerate(contexts, 1):
        time_str = format_relative_time(ctx.last_active)
        md = get_mode_display(getattr(ctx, "mode", "idle"))
        si = f" {md}" if md else ""
        lines.append(f"**{i}. {ctx.id}**{si}")
        lines.append(f"   {ctx.summary}")
        if ctx.method:
            lines.append(f"   Method: {ctx.method} | Last active: {time_str}")
        else:
            lines.append(f"   Last active: {time_str}")
        lines.append("")
    return "\n".join(lines)


def format_context_created(ctx) -> str:
    """Format notification for a newly created context."""
    return "\n".join([
        f"## Context Created: {ctx.id}", "", f"**Summary:** {ctx.summary}", "",
        "A new context has been created for this work.",
        "Tasks created with TaskCreate will be persisted to this context."])


def format_active_context_reminder(ctx, project_root: Path = None, include_restore: bool = False) -> str:
    """Format system reminder: lightweight (per-prompt) or rich (first-bind restore)."""
    time_str = format_relative_time(ctx.last_active)
    label = _mode_label(ctx)
    if include_restore:
        lines = [f"## Resuming Context: {ctx.id}", "", f"**Summary:** {ctx.summary}", f"**Mode:** {label}"]
        restore = _build_restore_sections(ctx, project_root)
        if restore:
            lines.append(restore)
        lines.extend(["", "---", "", "**Instructions:**",
            "1. Review the previous work above",
            "2. Continue from where the previous session left off"])
    else:
        lines = [
            f"## Active Context: {ctx.id}", "", f"**Summary:** {ctx.summary}",
            f"**Mode:** {label}", f"**Last Active:** {time_str}", "",
            f'All work belongs to context "{ctx.id}".',
            "Tasks created with TaskCreate will be persisted to this context."]
    return "\n".join(lines)


# ── Picker / command feedback ──────────────────────────────────────

def format_context_picker_stderr(contexts: list) -> str:
    """Format the boxed picker shown on stderr when blocking for selection."""
    lines = ["",
        "+----------------------------------------------------------------+",
        "|                   CONTEXT SELECTION REQUIRED                   |",
        "+----------------------------------------------------------------+"]
    selectable_count = 0
    for i, ctx in enumerate(contexts, 1):
        time_str = format_relative_time(ctx.last_active)
        mode = getattr(ctx, "mode", "idle")
        is_selectable = mode == "active" or getattr(ctx, "handoff_path", None)
        if is_selectable:
            selectable_count += 1
        status = ""
        if getattr(ctx, "handoff_path", None):
            status = " [Handoff Ready]"
        elif get_mode_display(mode):
            status = f" {get_mode_display(mode)}"
        summary = ctx.summary[:45] + "..." if len(ctx.summary) > 48 else ctx.summary
        sel_tag = " [selectable]" if is_selectable else " [end only]"
        lines.append(f"|  ^{i}  {ctx.id}{status}{sel_tag}")
        lines.append(f"|       {summary}")
        lines.append(f"|       [{time_str}]")
        lines.append("|")
    lines.extend([
        "+----------------------------------------------------------------+",
        "|  Usage:                                                        |",
        "|    ^S<N>                 - Select context by number            |",
        "|    ^E<N>                 - End/complete context by number      |",
        "|    ^S:query              - Select by ID match (race-safe)       |",
        "|    ^E:query              - End by ID match (race-safe)         |",
        "|    ^E<N>+                - End context N and all after         |",
        "|    ^E*                   - End ALL contexts                    |",
        "|    ^E1E2S3               - End #1 and #2, select #3           |",
        "|    ^E:fooS:bar           - End 'foo...', select 'bar...'       |",
        "|    ^0 work description   - Create new context (10+ chars)     |",
        "+----------------------------------------------------------------+"])
    if selectable_count == 0:
        lines.extend([
            "|  NOTE: No selectable contexts.                                |",
            "|        Use ^E<N> to end old contexts, then ^0 to create new.  |",
            "+----------------------------------------------------------------+"])
    lines.append("")
    return "\n".join(lines)


def format_command_feedback(ended_contexts: list, selected_context=None) -> str:
    """Format feedback about caret command operations performed."""
    lines = []
    if ended_contexts:
        lines.extend(["## Contexts Ended", ""])
        for ctx in ended_contexts:
            s = ctx.summary[:50] + "..." if len(ctx.summary) > 50 else ctx.summary
            lines.append(f"- **{ctx.id}**: {s}")
        lines.append("")
    if selected_context:
        label = _mode_label(selected_context)
        time_str = format_relative_time(selected_context.last_active)
        lines.extend([
            f"## Active Context: {selected_context.id}", "",
            f"**Summary:** {selected_context.summary}",
            f"**Mode:** {label}", f"**Last Active:** {time_str}", "",
            f'All work belongs to context "{selected_context.id}".',
            "Tasks created with TaskCreate will be persisted to this context."])
    return "\n".join(lines)
