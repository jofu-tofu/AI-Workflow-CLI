# GSD Workflow: Plan Phase

## Purpose

Create atomic task plans for specific phases with XML-formatted execution details.

## Prerequisites

- ROADMAP.md exists with defined phases
- STATE.md is initialized
- Phase number specified by user

## Process

### Step 1: Phase Validation

1. Read ROADMAP.md
2. Verify requested phase exists
3. Check if phase is ready to be planned:
   - Previous phases completed (if applicable)
   - No blockers preventing this phase

### Step 2: Context Gathering

Collect relevant context:
1. Read PROJECT.md for overall goals
2. Read ROADMAP.md for phase description
3. Read STATE.md for current decisions and blockers
4. Read CODEBASE.md if it exists (for brownfield projects)

### Step 3: Task Breakdown

Break the phase into **maximum 3 atomic tasks**:

**Task Design Principles:**
- Each task should be independently verifiable
- Each task should be committable separately
- Tasks should be ordered logically (dependencies first)
- Each task should take 15-60 minutes to complete
- If more than 3 tasks needed, this indicates the phase needs splitting

### Step 4: Task Specification

For each task, define:

1. **Objective:** One sentence - what this task accomplishes
2. **Implementation:** XML-formatted execution steps
3. **Acceptance Criteria:** Checklist of completion requirements
4. **Verification:** How to test/verify completion
5. **Rollback:** How to undo if needed

**XML Format Template:**
```xml
<task>
  <action>
    Specific, concrete action to take.
    Include file paths, function names, exact changes.
  </action>
  <verification>
    How to verify this works:
    - Run specific tests
    - Check specific behaviors
    - Validate specific outputs
  </verification>
  <rollback>
    How to undo this change if needed:
    - git revert command
    - Configuration to restore
    - Files to delete
  </rollback>
</task>
```

### Step 5: Generate PLAN.md

Use `_gsd/templates/PLAN.md.template`:

1. Replace `{{PHASE_NUMBER}}` with phase number
2. Replace `{{PHASE_NAME}}` with phase name from ROADMAP.md
3. Replace `{{DATE}}` with current date
4. Fill in all tasks with complete details
5. Create file as `PLAN-phase-{N}.md`

### Step 6: Plan Review

Show the user:
- Complete plan with all 3 tasks
- Estimated effort per task
- Dependencies between tasks
- Overall phase completion criteria

Ask for confirmation before proceeding.

## Next Steps

Recommend running `/gsd:execute-plan` to execute the plan with fresh subagent context.

## Success Criteria

- [ ] Maximum 3 tasks defined
- [ ] Each task has complete XML specification
- [ ] Acceptance criteria clear and testable
- [ ] Verification and rollback steps provided
- [ ] User confirms plan looks correct

## Notes

**Why Maximum 3 Tasks?**
- Maintains fresh 200k token context per execution
- Prevents context degradation from long-running sessions
- Ensures atomic, focused work sessions
- Makes rollback easier if issues occur
