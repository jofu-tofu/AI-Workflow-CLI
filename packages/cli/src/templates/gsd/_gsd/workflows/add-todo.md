# GSD Workflow: Add Todo

## Purpose

Capture ideas, tasks, and notes without disrupting current work. Quick way to record thoughts for later.

## Process

### Step 1: Capture Input

Ask user what to capture:
- Idea for future feature?
- Bug to investigate later?
- Note or reminder?
- Enhancement suggestion?

### Step 2: Categorize

```markdown
## New Todo

**Category:** {Idea / Bug / Note / Enhancement}
**Priority:** {Low / Medium / High}
**Related Phase:** {Phase N or "General"}

**Description:**
{User's input}

**Context:**
{Current state when captured}
```

### Step 3: Save to Todos

Create file in `.planning/todos/`:

```markdown
# Todo: {Brief title}

**Created:** {Date}
**Category:** {Category}
**Priority:** {Priority}

## Description

{Full description}

## Context

- Current phase: {N}
- Working on: {Current task}
- Notes: {Any relevant context}

## Status

- [ ] Captured
- [ ] Reviewed
- [ ] Addressed
```

**Filename:** `.planning/todos/{date}-{brief-title}.md`

### Step 4: Confirmation

```markdown
✅ Todo captured!

**File:** .planning/todos/{filename}.md
**Category:** {Category}
**Priority:** {Priority}

Use `/gsd:check-todos` to review all captured items.
```

## Output

- New file in `.planning/todos/`
