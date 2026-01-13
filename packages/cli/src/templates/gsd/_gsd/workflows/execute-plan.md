# GSD Workflow: Execute Plan

## Purpose

Execute task plans via fresh subagent contexts to prevent degradation and ensure focused work.

## Prerequisites

- _GSD_OUTPUT/PLAN-phase-{N}.md exists
- Tasks are well-defined with XML specifications
- User has confirmed the plan

## Process

### Step 1: Locate Active Plan

1. Find the most recent _GSD_OUTPUT/PLAN-phase-{N}.md file
2. Verify it has status: Draft or In Progress
3. Read all task specifications

### Step 2: Subagent Execution Strategy

For each task in the plan:

**Launch Fresh Subagent:**
```xml
<execution>
  <context>
    - Fresh 200k token context per task
    - No degradation from previous tasks
    - Clean slate for focused work
  </context>

  <input>
    - Task XML specification
    - Relevant project files (_GSD_OUTPUT/PROJECT.md, _GSD_OUTPUT/STATE.md, _GSD_OUTPUT/CODEBASE.md)
    - Current codebase state
  </input>

  <process>
    1. Subagent reads task specification
    2. Subagent executes action steps
    3. Subagent runs verification steps
    4. Subagent creates atomic git commit
    5. Subagent reports completion
  </process>

  <output>
    - Code changes committed
    - Verification results
    - Any issues encountered
  </output>
</execution>
```

### Step 3: Task Execution Loop

For each task (1-3 tasks per plan):

1. **Pre-Execution:**
   - Update _GSD_OUTPUT/PLAN-phase-{N}.md: Mark task as "In Progress"
   - Update _GSD_OUTPUT/STATE.md: Add "Working on: Task {N}"

2. **Execute via Subagent:**
   - Spawn fresh Claude Code agent
   - Provide task XML + project context
   - Agent executes task implementation
   - Agent runs verification steps
   - Agent creates atomic commit

3. **Post-Execution:**
   - Verify commit was created
   - Run verification criteria manually if needed
   - Update _GSD_OUTPUT/PLAN-phase-{N}.md: Mark task as "Completed"
   - Update _GSD_OUTPUT/SUMMARY.md: Add commit details
   - Update _GSD_OUTPUT/STATE.md: Progress notes

4. **Error Handling:**
   - If verification fails: Stop execution
   - Create issue in _GSD_OUTPUT/ISSUES.md
   - Ask user: Fix now or defer?
   - If defer: Mark remaining tasks as "Blocked"

### Step 4: Atomic Commits

Each task MUST result in a separate git commit:

**Commit Message Format:**
```
[Phase {N}] Task {M}: Brief description

- Specific change 1
- Specific change 2
- Specific change 3

Verification: [What was tested]
```

### Step 5: Verification Checkpoint

After each task:
1. Run automated tests if they exist
2. Manual verification of acceptance criteria
3. Check for regressions
4. Confirm changes match specification

If any verification fails:
- Do NOT proceed to next task
- Document failure in _GSD_OUTPUT/STATE.md
- Offer to create fix plan

### Step 6: Phase Completion Check

After all tasks complete:
1. Review phase completion criteria from _GSD_OUTPUT/ROADMAP.md
2. Verify all criteria met
3. If complete: Recommend `/gsd:verify-work {N}`
4. If incomplete: Recommend `/gsd:plan-fix`

## Output Files Updated

- `_GSD_OUTPUT/PLAN-phase-{N}.md` - Task status updates
- `_GSD_OUTPUT/SUMMARY.md` - Commit history
- `_GSD_OUTPUT/STATE.md` - Progress tracking
- Git history - Atomic commits per task

## Success Criteria

- [ ] All tasks executed in fresh contexts
- [ ] Atomic commits created per task
- [ ] All verification steps passed
- [ ] No regressions introduced
- [ ] STATE.md reflects current progress

## Key Benefits

**Fresh Context Per Task:**
- No context degradation
- Full 200k tokens available
- Better code generation quality
- Fewer errors from confusion

**Atomic Commits:**
- Easy rollback if needed
- Clear change history
- Facilitates code review
- Supports git bisect for debugging
