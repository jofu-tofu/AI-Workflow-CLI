# Handoff Workflow

Generate a handoff document summarizing the current session's work, decisions, and pending items. Optionally update a plan document to track completed vs remaining tasks.

## Triggers

- `/handoff` command
- `/handoff path/to/PLAN.md` - with plan document integration
- Phrases like "write a handoff", "create a session summary", "document what we did", "end session with notes"

## Philosophy

Handoffs exist to minimize the token and time cost of session startup. A precise handoff lets the next session hit the ground running without rediscovering context through Explore agents or file searches.

**Think: "What would I need to continue this work with zero prior context?"**

Key principles:
- **Absolute paths over vague references** — `C:\project\src\auth\handler.ts:45` not "handler.ts line 45"
- **Specific locations over general areas** — Name the function/class/section, not just the file
- **Enough detail to skip discovery** — Include enough context that the next session doesn't need to grep or search
- **Self-contained decisions** — Capture the "why" and the "why not" so alternatives aren't re-explored

A good handoff pays for itself in the first minute of the next session.

## Arguments

- `$ARGUMENTS` - Optional path to a plan document. If provided, the handoff will:
  1. Mark completed items in the plan with `[x]`
  2. Add notes about partial progress
  3. Append a "Session Progress" section to the plan

## Process

### Step 1: Gather Information

1. Review conversation history for:
   - Completed tasks and implementations
   - Key decisions and their rationale
   - Failed approaches (to avoid repeating)
   - External context (deadlines, stakeholder requirements)

2. Look for TODOs/FIXMEs mentioned in session

3. **If plan document provided**: Read the plan and identify:
   - Tasks that are now completed
   - Tasks that are partially done
   - Tasks that were attempted but blocked
   - New tasks discovered during implementation

### Step 2: Generate Document

Use this template. The `<!-- SECTION: name -->` markers are required for the save script to parse sections into sharded files.

```markdown
---
title: Session Handoff
date: {ISO timestamp}
session_id: {conversation ID if available}
project: {project name from package.json, Cargo.toml, or directory name}
plan_document: {path to plan if provided, or "none"}
---

# Session Handoff — {Date}

<!-- SECTION: summary -->
## Summary
{2-3 sentences covering: (1) session goal, (2) what changed technically, (3) current state}

Example: "Session goal: Implement JWT refresh tokens. Added refresh token generation in `C:\project\src\auth\tokens.ts:145-203` and rotation endpoint. Feature works but needs rate-limiting before production (see Pending Issues)."

<!-- SECTION: completed -->
## Work Completed

**Bad (requires exploration):**
- Fixed auth bug
- Updated tests

**Good (exploration-free):**
- Auth: Fixed JWT validation race condition in `C:\project\src\auth\handler.ts:67-89`
  - Issue: Token validation happened after user session creation → security gap
  - Fix: Moved validation to middleware, added async lock
  - Tests updated: `C:\project\tests\auth\handler.test.ts:45` now covers concurrent validation

{Your work completed here, following the "Good" example format with absolute paths}

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
1. {Actionable item with absolute path and line number, e.g., C:\path\to\file.ts:123}

<!-- SECTION: files -->
## Files Modified
{Absolute paths with line numbers for significant changes. Skip formatting-only edits.}

<!-- SECTION: context -->
## Context for Future Sessions
{Non-obvious context: env quirks, stakeholder requirements}

```

### Step 3: Update Plan Document (if provided)

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

### Step 4: Save and Update Status

Instead of writing the file directly, pipe your handoff content to the save script:

```bash
bun .aiwcli/_shared/scripts/save_handoff.ts <<'EOF'
{Your complete handoff markdown content from Step 2}
EOF
```

The script will automatically find the active context and create the handoff folder structure.

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

After saving, confirm:
- Handoff folder location
- Number of dead ends documented (if any)
- Plan update summary (if plan was provided)
