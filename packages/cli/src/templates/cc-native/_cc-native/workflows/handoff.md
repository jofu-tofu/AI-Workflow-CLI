# Handoff Workflow

Generate a handoff document summarizing the current session's work, decisions, and pending items.

## Triggers

- `/handoff` command
- Phrases like "write a handoff", "create a session summary", "document what we did", "end session with notes"

## Process

### Step 1: Gather Information

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

### Step 2: Get Timestamp

**IMPORTANT**: Before creating the handoff file, get the current local time:

```bash
date "+%Y-%m-%d-%H%M"
```

Use this output for the filename timestamp. Do NOT guess or use any other time source.

### Step 3: Determine Output Location

1. **Check for active task folder**:
   - Look for most recent `.state.json` file in `~/.claude/plans/`
   - If found and contains `task_folder` key, use that path

2. **Fallback: Create session folder**:
   - Sanitize session_id for use as folder name (alphanumeric, hyphens, max 32 chars)
   - Path: `_output/cc-native/sessions/{YYYY-MM-DD}/session-{sanitized_id}/`

3. **Write to handoffs subfolder**:
   - **Output**: `{task_folder_or_session_folder}/handoffs/HANDOFF-{HHMM}.md`

**Examples**:
- With task folder: `_output/cc-native/plans/2025-01-14/my-feature/handoffs/HANDOFF-1430.md`
- Standalone session: `_output/cc-native/sessions/2025-01-14/session-abc123/handoffs/HANDOFF-1430.md`

### Step 4: Generate Document

Use this template:

```markdown
---
title: Session Handoff
date: {ISO timestamp}
session_id: {conversation ID if available}
project: {project name from package.json, Cargo.toml, or directory name}
---

# Session Handoff — {Date}

## Summary
{2-3 sentences: what's different now vs. session start}

## Work Completed
{Grouped by category if multiple areas. Specific file:function references.}

## Dead Ends — Do Not Retry
{Approaches that were tried and failed. Critical for avoiding wasted effort in future sessions.}

### {Problem/Goal attempted}
| Approach Tried | Why It Failed | Time Spent |
|----------------|---------------|------------|
| {What was attempted} | {Specific reason: error, incompatibility, performance, etc.} | {Rough estimate} |

**What to try instead**: {If known, suggest alternative direction}

## Key Decisions
{Technical choices with rationale. Format: **Decision**: Rationale. Trade-off: X.}

## Pending Issues
- [ ] {Issue} — {severity: HIGH/MED/LOW} {optional workaround note}

## Next Steps
1. {Actionable item with file:line reference if applicable}

## Files Modified
{Significant changes only. Skip formatting-only edits.}

## Context for Future Sessions
{Non-obvious context: env quirks, stakeholder requirements}

```

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
✓ Created _output/cc-native/plans/2025-01-14/my-feature/handoffs/HANDOFF-1430.md

To continue next session:
  "Load _output/cc-native/plans/2025-01-14/my-feature/handoffs/HANDOFF-1430.md and continue from next steps"

⚠️  {N} dead ends documented — avoid re-attempting these approaches
```

## Success Criteria

- [ ] Handoff document created in task folder's `handoffs/` subfolder
- [ ] Dead ends section captures all failed approaches with specific details
- [ ] Next steps are actionable with file references
- [ ] Git status reflects current state
