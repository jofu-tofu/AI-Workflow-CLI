# GSD Workflow: Pause Work

## Purpose

Create comprehensive handoff documentation when suspending work, enabling seamless resumption later by you or others.

## Use Case

Use this when:
- Need to context-switch to different project
- Work blocked by external dependency
- Taking break from project
- Handing off to another person
- Backing up current state for safety

## Process

### Step 1: Capture Current State

Gather complete project context:

1. **Work In Progress:**
   - What phase/task is active?
   - What's partially complete?
   - What files are modified but uncommitted?

2. **Immediate Context:**
   - What were you just doing?
   - What were you about to do next?
   - What's in working memory?

3. **Blockers:**
   - What's blocking progress?
   - External dependencies waiting on?
   - Decisions that need to be made?

4. **Recent Changes:**
   ```bash
   git log -5 --oneline
   git status
   git diff
   ```

### Step 2: Create Handoff Document

Generate `_output/gsd/.planning/HANDOFF.md`:

```markdown
# Project Handoff - {{PROJECT_NAME}}

**Paused:** {Date and Time}
**Paused By:** {Name/AI}
**Reason:** {Why work is being paused}

## Current Status

**Phase:** {N} / {Total} - {Phase Name}
**Task:** {Current task} - {Status}
**Last Commit:** {commit hash} - {commit message}

## What I Was Doing

{Detailed description of current work}

**Files Modified:**
- `file1.ts` - {What changes were made}
- `file2.ts` - {What changes were made}

**Uncommitted Changes:**
{Output of git diff or "None"}

## What I Was About To Do Next

1. {Next immediate step}
2. {Following step}
3. {Then this}

## Current Mental Model

{Explain the approach, reasoning, or strategy}

**Key Decisions Made:**
- {Decision 1 and why}
- {Decision 2 and why}

**Assumptions:**
- {Assumption 1}
- {Assumption 2}

## Blockers

### Active Blockers
1. **{Blocker Title}**
   - **Issue:** {What's blocking}
   - **Dependency:** {What/who we're waiting on}
   - **Impact:** {What this prevents}
   - **Workaround:** {If any}

### Potential Issues
{Concerns or questions that haven't been resolved}

## Environment Setup

**Dependencies:**
- Node version: {version}
- Package manager: {npm/yarn/bun}
- Other tools: {list}

**Configuration:**
- Environment variables needed: {list}
- Special setup steps: {list}

**Running the project:**
```bash
{Commands to build/run/test}
```

## Project Context

**Read these files first:**
1. `_output/gsd/.planning/PROJECT.md` - Project vision and goals
2. `_output/gsd/.planning/ROADMAP.md` - Phase breakdown
3. `_output/gsd/.planning/STATE.md` - Current decisions
4. `_output/gsd/.planning/PLAN-phase-{N}.md` - Current execution plan (if exists)

**Recent important commits:**
{git log with descriptions of last few major changes}

## Questions for Resumption

{List any questions that should be answered before resuming}

1. {Question 1}
2. {Question 2}

## How to Resume

### Quick Start

1. Read this handoff document completely
2. Read the "Project Context" files above
3. Review uncommitted changes (if any)
4. Run tests to verify environment: `{test command}`
5. Continue from "What I Was About To Do Next" section

### If Resuming After Long Break

1. Read all handoff docs
2. Read full ROADMAP.md and STATE.md
3. Review recent commit history
4. Rebuild mental model of architecture
5. Run full test suite
6. Consider using `/gsd:progress` to orient yourself
7. May want to re-verify previous work

## Backup Information

**Git Status:**
{Full output of git status}

**Last Known Good State:**
Commit: {hash}
Date: {date}
Message: {message}

---

**To Resume:** Run `/gsd:resume-work`
**Created by:** Get Shit Done - Pause Workflow
```

### Step 3: Save Working Changes

If there are uncommitted changes:

**Option A: Commit WIP**
```bash
git add .
git commit -m "WIP: Pausing work on {task description}

Current state: {brief description}

See HANDOFF.md for resumption details."
```

**Option B: Stash Changes**
```bash
git stash save "WIP: {task description} - see HANDOFF.md"
echo "Stash reference: $(git stash list | head -1)" >> HANDOFF.md
```

**Option C: Create WIP Branch**
```bash
git checkout -b wip/{feature-name}-{date}
git add .
git commit -m "WIP: Snapshot for resumption"
git checkout main
echo "WIP branch: wip/{feature-name}-{date}" >> HANDOFF.md
```

### Step 4: Update STATE.md

Add pause note to `_output/gsd/.planning/STATE.md`:

```markdown
## Current Status

**Status:** ⏸️ PAUSED
**Paused:** {Date}
**Reason:** {Brief reason}
**See:** HANDOFF.md for resumption details

{Previous status content}
```

### Step 5: Create Resumption Checklist

Add to HANDOFF.md:

```markdown
## Resumption Checklist

Before continuing work:
- [ ] Read this entire handoff document
- [ ] Read _output/gsd/.planning/PROJECT.md, _output/gsd/.planning/ROADMAP.md, _output/gsd/.planning/STATE.md
- [ ] Review recent commits (git log)
- [ ] Restore uncommitted changes (if stashed/branched)
- [ ] Run tests to verify environment works
- [ ] Verify blockers are resolved (if any)
- [ ] Understand "What I Was About To Do Next"
- [ ] Ready to continue!
```

### Step 6: Final Commit

Commit the handoff documentation:

```bash
git add _output/gsd/.planning/HANDOFF.md _output/gsd/.planning/STATE.md
git commit -m "Pause: Create handoff documentation

Work paused on Phase {N} - {Phase Name}
See HANDOFF.md for resumption details

Reason: {Brief reason}"
```

### Step 7: Confirmation

Show user:

```markdown
⏸️ Work Paused Successfully

Handoff documentation created: `_output/gsd/.planning/HANDOFF.md`

**Current state preserved:**
- Handoff document with full context
- {Committed WIP / Stashed changes / WIP branch created}
- `_output/gsd/.planning/STATE.md` updated
- All changes committed

**To resume later:**
Run `/gsd:resume-work` and follow the checklist in `_output/gsd/.planning/HANDOFF.md`

{If blockers exist:}
⚠️ Active blockers documented - resolve before resuming
```

## Output Files

- `_output/gsd/.planning/HANDOFF.md` - Complete handoff documentation
- Updated `_output/gsd/.planning/STATE.md` - Marked as paused
- Git commit - Handoff documentation
- Optional: WIP commit/stash/branch

## Success Criteria

- [ ] Complete context captured
- [ ] Current work state documented
- [ ] Next steps clearly listed
- [ ] Blockers identified
- [ ] Environment setup documented
- [ ] Resumption checklist created
- [ ] Changes safely committed/stashed
- [ ] Future self (or other person) can resume smoothly

## Notes

**When to Pause:**
- Before context-switching
- When blocked externally
- End of work session (good practice)
- Before major changes
- When handing off

**Handoff Quality:**
- More detail is better than less
- Write for someone with no context
- Include your thought process
- Document the "why" not just "what"
- Future you will thank present you!
