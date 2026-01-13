# GSD Workflow: Progress

## Purpose

Display current project position, completed work, and recommended next steps.

## Process

### Step 1: Read Project State

Collect information from:
1. `_GSD_OUTPUT/PROJECT.md` - Project goals and vision
2. `_GSD_OUTPUT/ROADMAP.md` - All phases and their status
3. `_GSD_OUTPUT/STATE.md` - Current position and blockers
4. `_GSD_OUTPUT/PLAN-phase-*.md` - Any active plans
5. `_GSD_OUTPUT/SUMMARY.md` - Commit history
6. Git log - Recent commits

### Step 2: Analyze Progress

Calculate:
1. **Phase Progress:**
   - Total phases in roadmap
   - Phases completed
   - Current phase
   - Phases remaining

2. **Task Progress (if in active phase):**
   - Total tasks in current plan
   - Tasks completed
   - Tasks in progress
   - Tasks blocked

3. **Recent Activity:**
   - Last 5 commits
   - Last updated file
   - Last modified `_GSD_OUTPUT/STATE.md` entry

### Step 3: Identify Blockers

From `_GSD_OUTPUT/STATE.md`:
- Active blockers
- Blockers resolved
- Pending decisions needed

### Step 4: Determine Next Steps

Based on current state, recommend:

**If no plan exists:**
- "Run `/gsd:plan-phase {N}` to create execution plan for Phase {N}"

**If plan exists but not started:**
- "Run `/gsd:execute-plan` to begin working on Phase {N}"

**If plan in progress:**
- "Continue executing tasks {X}-{Y} in Phase {N}"
- Show which specific task is next

**If phase complete but not verified:**
- "Run `/gsd:verify-work {N}` to verify Phase {N} completion"

**If phase verified:**
- "Phase {N} complete! Run `/gsd:plan-phase {N+1}` to start next phase"

**If blockers exist:**
- "Resolve blockers: [list blockers]"
- "Or run `/gsd:pause-work` to create handoff"

### Step 5: Generate Progress Report

Create formatted output:

```markdown
# Progress Report - {{PROJECT_NAME}}

## Current Status
📍 **Position:** Phase {N} / {Total} - {Phase Name}
⚡ **Status:** {In Progress | Blocked | Ready for Verification}
📅 **Last Updated:** {Date}

## Phase Progress
{Progress bar visualization}
- ✅ Phases Completed: {N}
- 🔄 Current Phase: {Phase Name}
- ⏳ Phases Remaining: {N}

## Current Phase Details
**Phase {N}: {Phase Name}**
- Task 1: ✅ Completed
- Task 2: 🔄 In Progress
- Task 3: ⏳ Pending

## Recent Activity
{Last 5 commits with brief descriptions}

## Active Blockers
{List blockers or "None"}

## Next Recommended Action
{Specific command to run next}

---
**Generated:** {Timestamp}
```

### Step 6: Visual Progress Indicator

Create simple ASCII progress bar:
```
Phase Progress: [████████░░░░░░░░░░] 40% (2/5 phases)
Task Progress:  [████████████░░░░░░] 67% (2/3 tasks)
```

## Output

Display progress report to user in clear, actionable format.

## Success Criteria

- [ ] Current position clearly displayed
- [ ] Progress metrics calculated correctly
- [ ] Blockers surfaced if present
- [ ] Next steps clearly recommended
- [ ] User understands where they are and what to do next

## Notes

This command should be:
- Fast to execute (no heavy computation)
- Clear and scannable
- Actionable (always recommend next step)
- Encouraging (celebrate completed work)
