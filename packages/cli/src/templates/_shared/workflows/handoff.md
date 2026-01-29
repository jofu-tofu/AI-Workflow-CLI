# Handoff Workflow

Generate a handoff document summarizing the current session's work, decisions, and pending items. Optionally update a plan document to track completed vs remaining tasks.

## Triggers

- `/handoff` command
- `/handoff path/to/PLAN.md` - with plan document integration
- Phrases like "write a handoff", "create a session summary", "document what we did", "end session with notes"

## Arguments

- `$ARGUMENTS` - Optional path to a plan document. If provided, the handoff will:
  1. Mark completed items in the plan with `[x]`
  2. Add notes about partial progress
  3. Append a "Session Progress" section to the plan

## Process

### Step 1: Get Context ID

Extract the `context_id` from the system reminder injected by the context enforcer hook.

Look for the pattern in the system reminder:
```
Active Context: {context_id}
```

If no active context is found, inform the user and stop - handoffs require an active context.

### Step 2: Gather Information

1. Review conversation history for:
   - Completed tasks and implementations
   - Key decisions and their rationale
   - Failed approaches (to avoid repeating)
   - External context (deadlines, stakeholder requirements)

2. Check git status if available:
   ```bash
   git status --short
   git diff --stat
   ```

3. Look for TODOs/FIXMEs mentioned in session

4. **If plan document provided**: Read the plan and identify:
   - Tasks that are now completed
   - Tasks that are partially done
   - Tasks that were attempted but blocked
   - New tasks discovered during implementation

### Step 3: Generate Document

Use this template. The `<!-- SECTION: name -->` markers are required for the save script to parse sections into sharded files.

```markdown
---
title: Session Handoff
date: {ISO timestamp}
session_id: {conversation ID if available}
project: {project name from package.json, Cargo.toml, or directory name}
context_id: {context_id from Step 1}
plan_document: {path to plan if provided, or "none"}
---

# Session Handoff — {Date}

<!-- SECTION: summary -->
## Summary
{2-3 sentences: what's different now vs. session start}

<!-- SECTION: completed -->
## Work Completed
{Grouped by category if multiple areas. Specific file:function references.}

<!-- SECTION: dead-ends -->
## Dead Ends — Do Not Retry

These approaches were attempted and failed. Do not retry without addressing the root cause.

| Approach | Why It Failed | Time Spent | Alternative |
|----------|---------------|------------|-------------|
| {What was attempted} | {Specific reason} | {Rough estimate} | {What to try instead} |

<!-- SECTION: decisions -->
## Key Decisions
{Technical choices with rationale. Format: **Decision**: Rationale. Trade-off: X.}

<!-- SECTION: pending -->
## Pending Issues
- [ ] {Issue} — {severity: HIGH/MED/LOW} {optional workaround note}

<!-- SECTION: next-steps -->
## Next Steps
1. {Actionable item with file:line reference if applicable}

<!-- SECTION: files -->
## Files Modified
{Significant changes only. Skip formatting-only edits.}

<!-- SECTION: context -->
## Context for Future Sessions
{Non-obvious context: env quirks, stakeholder requirements}

```

### Step 4: Update Plan Document (if provided)

If a plan document path was provided in `$ARGUMENTS`:

1. **Read the plan document**
2. **Identify completed items**:
   - Find checkboxes `- [ ]` that match completed work
   - Change them to `- [x]`
3. **Add progress notes** to items that are partially complete:
   - Append `(partial: {brief status})` to the line
4. **Append Session Progress section** at the bottom:

```markdown

---

## Session Progress Log

### {Date} — Session {session_id or timestamp}

**Completed this session:**
- [x] {Task from plan that was completed}
- [x] {Another completed task}

**Partially completed:**
- {Task} — {current state, what remains}

**Blocked/Deferred:**
- {Task} — {reason, what's needed}

**New items discovered:**
- [ ] {New task not in original plan}
- [ ] {Another new task}

---
```

5. **If no plan document was provided**:
   - Skip plan creation - the handoff document serves as the session record

### Step 5: Save and Update Status

Instead of writing the file directly, pipe your handoff content to the save script:

```bash
python .aiwcli/_shared/scripts/save_handoff.py "{context_id}" <<'EOF'
{Your complete handoff markdown content from Step 3}
EOF
```

This script:
1. Creates a folder at `_output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/`
2. Parses sections and writes sharded files (index.md, completed-work.md, dead-ends.md, etc.)
3. Copies the current plan (if any) to plan.md
4. Records the event in the context's event log (informational only)

Use the handoff folder for context in the next session.

## Dead Ends Section Guidelines

This section is critical for preventing context rot across sessions. Be specific:

**Bad (too vague):**
> - Tried using library X, didn't work

**Good (actionable):**
> ### Fixing the race condition in SessionStore
> | Approach Tried | Why It Failed |
> |----------------|---------------|
> | `async-mutex` package | Deadlock when nested calls to `getSession()` |
> | Redis WATCH/MULTI | Our Redis 6.x cluster doesn't support WATCH in cluster mode |
> | In-memory lock Map | Works single-node but breaks in horizontal scaling |
>
> **What to try instead**: Upgrade to Redis 7.x which supports WATCH in cluster mode, or use Redlock algorithm

**Capture these dead ends:**
- Packages/libraries that had incompatibilities
- Approaches that caused new bugs or regressions
- Solutions that worked locally but failed in CI/staging/prod
- Configurations that conflicted with existing setup
- Rabbit holes that consumed significant time without progress

## Post-Generation Output

After creating file, output:

```
✓ Created handoff folder: _output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/
  - index.md (entry point with navigation)
  - completed-work.md, dead-ends.md, decisions.md, pending.md, context.md
  - plan.md (copy of current plan, if any)

To continue next session:
  The index.md will be automatically suggested when you start a new session.
  Read dead-ends.md first to avoid repeating failed approaches.

⚠️  {N} dead ends documented — avoid re-attempting these approaches
```

If plan was updated:
```
✓ Updated plan document: {path}
   - {N} items marked complete
   - {N} items partially complete
   - {N} new items added
```

## Success Criteria

- [ ] Handoff folder created at `handoffs/{YYYY-MM-DD-HHMM}/`
- [ ] index.md contains summary and navigation table
- [ ] All section files created (completed-work.md, dead-ends.md, etc.)
- [ ] Dead ends use structured table format for quick scanning
- [ ] plan.md copied from context if plan exists
- [ ] Next steps are actionable with file references
- [ ] Git status included in index.md
- [ ] If plan provided: checkboxes updated to reflect completion status
- [ ] If plan provided: Session Progress Log appended
- [ ] Context state updated to indicate handoff pending
