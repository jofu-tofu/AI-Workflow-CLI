# GSD Workflow: Execute Phase

## Purpose

Execute task plans via wave-based parallel execution, using fresh subagent contexts for each task to prevent degradation and maximize throughput.

## Overview

This workflow executes plans created by `/gsd:plan-phase`:
1. Loads plan with wave groupings
2. Executes each wave (tasks in parallel within waves)
3. Creates atomic commits per task
4. Tracks progress in STATE.md
5. Halts on failures for diagnosis

**Supersedes:** `/gsd:execute-plan` (sequential execution - now deprecated)

## Prerequisites

- `_output/gsd/.planning/PLAN-phase-{N}.md` exists with wave groupings
- User has confirmed the plan
- All tasks have complete XML specifications
- No blockers in `_output/gsd/.planning/STATE.md`

## Process

### Step 1: Load Active Plan

1. Find `_output/gsd/.planning/PLAN-phase-{N}.md` for the specified or current phase
2. Parse wave groupings
3. Verify plan status is "Draft" or "In Progress"
4. Load all task XML specifications

```markdown
## Plan Loaded

**Phase:** {N} - {Phase Name}
**Total Tasks:** {count}
**Wave Distribution:**
- Wave 1: {count} tasks (parallel)
- Wave 2: {count} tasks (after Wave 1)
- Wave 3: {count} tasks (after Wave 2)

**Status:** Ready to execute
```

### Step 2: Pre-Execution Check

Before starting any tasks:

1. **Git Status:**
   ```bash
   git status
   ```
   - Ensure working directory is clean
   - No uncommitted changes
   - On correct branch

2. **Environment Verification:**
   - Run tests to verify baseline: `npm test` or equivalent
   - Confirm build succeeds
   - Check for blocking issues

3. **Context Files:**
   - Read `_output/gsd/.planning/STATE.md` for current state
   - Load `_output/gsd/.planning/CONTEXT.md` decisions
   - Have `_output/gsd/.planning/REQUIREMENTS.md` available

**If issues found:**
- Stop and resolve before proceeding
- Don't start tasks with broken baseline

### Step 3: Wave Execution Loop

Execute tasks wave by wave.

**For Each Wave:**

```markdown
## Executing Wave {W}

**Tasks in this wave:** {count}
**Can parallelize:** Yes (tasks have no dependencies within wave)

Starting parallel execution...
```

### Step 4: Task Execution (Per Task)

For each task in the current wave, spawn fresh subagent:

**Subagent Context:**
```xml
<execution>
  <context>
    Fresh 200k token context for this task only.
    No pollution from previous tasks.
    Clean slate for focused work.
  </context>

  <inputs>
    - Task XML specification from PLAN-phase-{N}.md
    - Relevant project files (PROJECT.md, STATE.md, CONTEXT.md)
    - Codebase access
    - Requirements context
  </inputs>

  <process>
    1. Read task specification completely
    2. Read decisions from CONTEXT.md
    3. Execute action steps in order
    4. Run verification steps
    5. Create atomic git commit
    6. Report completion with results
  </process>

  <output>
    - Code changes committed
    - Verification results
    - Any issues encountered
    - Commit hash
  </output>
</execution>
```

**Task Lifecycle:**

1. **Mark In Progress:**
   - Update `_output/gsd/.planning/PLAN-phase-{N}.md`: Task status → "In Progress"
   - Update `_output/gsd/.planning/STATE.md`: "Working on: Task {M}"

2. **Execute via Subagent:**
   - Spawn fresh Claude Code agent with task context
   - Agent executes task implementation
   - Agent runs verification steps
   - Agent creates atomic commit

3. **Verify Completion:**
   - Confirm commit was created
   - Run verification criteria
   - Check for regressions (run tests)

4. **Update Status:**
   - Mark task complete in PLAN-phase-{N}.md
   - Update `_output/gsd/.planning/SUMMARY.md` with commit
   - Update `_output/gsd/.planning/STATE.md` with progress

### Step 5: Parallel Execution Strategy

For tasks in the same wave:

**Parallel Spawn:**
```markdown
## Wave {W} - Parallel Execution

Spawning {N} agents simultaneously:

| Task | Agent | Status |
|------|-------|--------|
| Task 1 | Agent A | 🔄 Running |
| Task 2 | Agent B | 🔄 Running |

Waiting for all tasks to complete...
```

**Completion Tracking:**
```markdown
## Wave {W} - Complete

| Task | Agent | Result | Commit |
|------|-------|--------|--------|
| Task 1 | Agent A | ✅ Success | abc123 |
| Task 2 | Agent B | ✅ Success | def456 |

All Wave {W} tasks complete.
Proceeding to Wave {W+1}...
```

### Step 6: Atomic Commits

Each task MUST result in a separate git commit:

**Commit Message Format:**
```
[Phase {N}] Task {M}: {Brief description}

- {Specific change 1}
- {Specific change 2}
- {Specific change 3}

Requirements: {V1-F01, V1-F02}
Verification: {What was tested}

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

**Commit Rules:**
- One commit per task (no batching)
- Clear message describing changes
- Reference requirements implemented
- Note verification performed

### Step 7: Failure Handling

If any task fails:

**Immediate Stop:**
```markdown
## ⚠️ Execution Halted

**Failed Task:** Task {M} in Wave {W}
**Error:** {Error description}

### Failure Details

```
{Error output or test failures}
```

### Impact

- Wave {W}: {N-1} tasks succeeded, 1 failed
- Wave {W+1}: Not started (blocked)
- Remaining: {count} tasks

### Options

1. **Diagnose and Fix**
   - Run `/gsd:verify-work` to diagnose
   - Auto-diagnosis will create fix plan

2. **Rollback Task**
   - `git revert {commit}` for failed task
   - Re-attempt after fixing

3. **Skip Task**
   - Mark as blocked
   - Continue with non-dependent tasks

**Recommendation:** Run `/gsd:verify-work` to diagnose the failure.
```

**Do NOT:**
- Continue to next wave if current wave has failures
- Silently skip failed tasks
- Leave status updates incomplete

### Step 8: Wave Progress Tracking

After each wave completes:

```markdown
## Wave {W} Complete

### Results

| Task | Status | Commit |
|------|--------|--------|
| Task 1 | ✅ | abc123 |
| Task 2 | ✅ | def456 |

### Progress

- ✅ Wave 1: Complete (2/2 tasks)
- 🔄 Wave 2: Starting
- ⏳ Wave 3: Pending

### Files Updated

- `_output/gsd/.planning/PLAN-phase-{N}.md` - Task statuses
- `_output/gsd/.planning/SUMMARY.md` - Commit history
- `_output/gsd/.planning/STATE.md` - Progress

### Next

Proceeding to Wave 2...
```

### Step 9: Phase Completion

When all waves complete successfully:

1. **Verify All Tasks:**
   - Confirm all tasks marked complete
   - All commits exist
   - No uncommitted changes

2. **Update PLAN.md:**
   - Status: Complete
   - All tasks: ✅ Complete
   - Completion date

3. **Update STATE.md:**
   ```markdown
   ## Current Status

   **Phase:** {N} - {Phase Name}
   **Status:** Executed (pending verification)
   **Last Updated:** {Date}

   ## Progress

   - ✅ All {N} tasks complete
   - ✅ {N} commits created
   - Next: Verify Phase {N}
   ```

4. **Update SUMMARY.md:**
   - Add all commits from this phase
   - Note phase execution complete

### Step 10: Final Summary

Present completion summary:

```markdown
## Phase {N} Execution Complete

### Summary

| Metric | Value |
|--------|-------|
| Total Tasks | {N} |
| Tasks Completed | {N} |
| Commits Created | {N} |
| Waves Executed | {W} |

### Commits

| Hash | Task | Description |
|------|------|-------------|
| abc123 | Task 1 | {Description} |
| def456 | Task 2 | {Description} |
| ... | ... | ... |

### Requirements Implemented

- ✅ V1-F01: {Description}
- ✅ V1-F02: {Description}
- ✅ V1-N01: {Description}

### Files Updated

- `_output/gsd/.planning/PLAN-phase-{N}.md` - Marked complete
- `_output/gsd/.planning/SUMMARY.md` - Commits logged
- `_output/gsd/.planning/STATE.md` - Status updated

### Next Step

**Run `/gsd:verify-work {N}`** to verify phase completion with user acceptance testing.
```

## Output Files

- Updated `_output/gsd/.planning/PLAN-phase-{N}.md` - Task completion statuses
- Updated `_output/gsd/.planning/SUMMARY.md` - Commit history
- Updated `_output/gsd/.planning/STATE.md` - Phase progress
- Git commits - One per task

## Success Criteria

- [ ] All waves executed in order
- [ ] All tasks in each wave completed
- [ ] Atomic commits created per task
- [ ] No failures left unaddressed
- [ ] State files updated accurately
- [ ] Ready for verification

## Notes

**Why Wave-Based?**
- Parallelization speeds up execution
- Fresh context per task prevents degradation
- Dependencies respected through wave ordering
- Easy to identify and isolate failures

**Why Fresh Context?**
- Full 200k tokens available per task
- No confusion from previous tasks
- Better code generation quality
- Cleaner mental model

**Parallel Execution Limits:**
- Default: 3 parallel agents max
- Can adjust based on system resources
- Each agent needs memory/CPU
- Network/API rate limits may apply

**Rollback Strategy:**
- Each commit is atomic
- Can revert individual tasks
- Git bisect works for debugging
- Clear history for code review
