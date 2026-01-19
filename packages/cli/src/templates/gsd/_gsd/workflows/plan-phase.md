# GSD Workflow: Plan Phase

## Purpose

Create atomic task plans for specific phases with XML-formatted execution details, wave groupings for parallel execution, and verification against requirements.

## Overview

This workflow creates detailed execution plans by:
1. Loading context from previous workflows (CONTEXT.md, REQUIREMENTS.md)
2. Conducting targeted research for technical unknowns
3. Breaking phase into maximum 3 atomic tasks
4. Grouping tasks into waves for parallel execution
5. Verifying tasks trace back to requirements

**Output:** `_output/gsd/.planning/PLAN-phase-{N}.md` with complete execution specification.

## Prerequisites

- `_output/gsd/.planning/ROADMAP.md` exists with defined phases
- `_output/gsd/.planning/PROJECT.md` exists with goals
- `_output/gsd/.planning/REQUIREMENTS.md` exists with V1/V2 requirements
- Phase number specified by user
- Optional: `_output/gsd/.planning/CONTEXT.md` from discuss-phase

## Process

### Step 1: Phase Validation

1. Read `_output/gsd/.planning/ROADMAP.md`
2. Verify requested phase exists
3. Check phase readiness:
   - Previous phases completed (if applicable)
   - No blockers preventing this phase

```markdown
## Phase {N}: {Phase Name}

**Status:** {Current status}
**Dependencies:** {Previous phases}
**Ready to Plan:** Yes/No

{If not ready, explain why and stop}
```

### Step 2: Load Context

Gather all relevant context for planning:

**Required:**
1. Read `_output/gsd/.planning/PROJECT.md` - Overall goals
2. Read `_output/gsd/.planning/ROADMAP.md` - Phase description and tasks
3. Read `_output/gsd/.planning/REQUIREMENTS.md` - V1/V2 requirements for this phase
4. Read `_output/gsd/.planning/STATE.md` - Current decisions and blockers

**If Available:**
5. Read `_output/gsd/.planning/CONTEXT.md` - Decisions from discuss-phase
6. Read `_output/gsd/.planning/CODEBASE.md` - For brownfield projects
7. Read `_output/gsd/.planning/RESEARCH.md` - Existing research

**Context Summary:**
```markdown
## Planning Context for Phase {N}

### From CONTEXT.md (discuss-phase decisions)
- {Decision 1}
- {Decision 2}

### Requirements to Implement
- V1-F01: {Requirement}
- V1-F02: {Requirement}

### Constraints
- {From PROJECT.md}

### Prior Decisions
- {From STATE.md}
```

### Step 3: Research Phase

If the phase involves unfamiliar patterns or technologies, conduct targeted research.

**Research Triggers:**
- Tasks reference unfamiliar libraries
- Integration with external APIs
- Performance-critical requirements
- Security-sensitive operations
- No existing patterns in codebase

**Research Process:**
1. Identify specific knowledge gaps
2. Spawn research agent(s) to investigate:
   - API documentation
   - Best practices
   - Similar implementations
   - Security considerations
3. Update `_output/gsd/.planning/RESEARCH.md` with findings

**Research Agent Instructions:**
```xml
<research>
  <topic>{What to research}</topic>
  <questions>
    - {Specific question 1}
    - {Specific question 2}
  </questions>
  <output>
    Update _output/gsd/.planning/RESEARCH.md Phase {N} section with:
    - Relevant files/patterns found
    - External documentation references
    - Recommended approach
    - Risks identified
  </output>
</research>
```

**Skip Research If:**
- Familiar patterns
- Clear implementation path
- User opts out
- No technical unknowns

### Step 4: Task Breakdown

Break the phase into **maximum 3 atomic tasks**.

**Task Design Principles:**
- Each task should be independently verifiable
- Each task should be committable separately
- Tasks should be ordered logically (dependencies first)
- Each task should take 15-60 minutes to complete
- If more than 3 tasks needed, phase needs splitting

**Task Structure:**
```markdown
### Task 1: {Title}

**Objective:** {One sentence - what this accomplishes}
**Requirements:** {V1-F01, V1-F02 - which requirements this implements}
**Wave:** {1, 2, or 3 - for parallel execution}
**Dependencies:** {None, or Task X}
```

### Step 5: Wave Analysis

Group tasks into waves for parallel execution.

**Wave Principles:**
- Wave 1: Foundation tasks with no dependencies
- Wave 2: Tasks that depend on Wave 1
- Wave 3: Final integration/cleanup tasks

**Wave Analysis:**
```markdown
## Wave Groupings

### Wave 1 (Can Execute in Parallel)
- Task 1: {No dependencies}
- Task 2: {No dependencies}

### Wave 2 (Depends on Wave 1)
- Task 3: {Depends on Task 1}

### Wave 3 (Final Integration)
- {If needed}
```

**Parallelization Rules:**
- Tasks in same wave can run simultaneously
- Each task gets fresh 200k context
- Wave completes when all tasks in it complete
- Next wave starts after previous wave completes

### Step 6: Task Specification

For each task, create detailed XML specification:

**XML Format:**
```xml
<task id="1" wave="1">
  <title>{Clear, actionable title}</title>

  <objective>
    What this task accomplishes in one sentence.
  </objective>

  <requirements>
    - V1-F01: {Requirement text}
    - V1-N01: {Requirement text}
  </requirements>

  <action>
    Specific, concrete steps to take:

    1. {First step}
       - File: path/to/file.ts
       - Change: {What to modify}

    2. {Second step}
       - File: path/to/file.ts
       - Change: {What to modify}

    3. {Third step}
       ...
  </action>

  <decisions>
    Decisions from CONTEXT.md that apply:
    - {Decision 1}
    - {Decision 2}
  </decisions>

  <verification>
    How to verify this task is complete:

    - [ ] {Specific test to run}
    - [ ] {Behavior to check}
    - [ ] {Output to validate}
    - [ ] All requirements marked implemented
  </verification>

  <rollback>
    How to undo if needed:

    ```bash
    git revert HEAD
    ```

    Or:
    - {File to restore}
    - {Configuration to revert}
  </rollback>

  <acceptance_criteria>
    - [ ] {Criterion 1 - testable}
    - [ ] {Criterion 2 - testable}
    - [ ] {Criterion 3 - testable}
  </acceptance_criteria>
</task>
```

### Step 7: Requirements Verification Loop

Verify all phase requirements are covered by tasks.

**Process:**
1. List all requirements tagged to this phase
2. For each requirement, confirm which task implements it
3. Flag any uncovered requirements

```markdown
## Requirements Traceability

| Requirement | Task | Status |
|-------------|------|--------|
| V1-F01 | Task 1 | ✅ Covered |
| V1-F02 | Task 2 | ✅ Covered |
| V1-N01 | Task 1 | ✅ Covered |
| V1-F03 | - | ❌ NOT COVERED |

{If uncovered requirements exist:}
⚠️ Warning: V1-F03 is not covered by any task.
Options:
1. Add task to cover it
2. Move to different phase
3. Confirm it's deferred
```

**If gaps found:**
- Ask user how to handle
- Add task, move requirement, or confirm deferral
- Update plan accordingly

### Step 8: Generate PLAN.md

Create `_output/gsd/.planning/PLAN-phase-{N}.md`:

```markdown
# Plan - Phase {N}: {Phase Name}

**Created:** {Date}
**Status:** Draft
**Requirements Coverage:** {X}/{Y} requirements

## Overview

{Brief description of what this phase accomplishes}

## Context Applied

**From discuss-phase:**
{List key decisions from CONTEXT.md}

**From research:**
{List key findings from RESEARCH.md}

## Wave Summary

| Wave | Tasks | Can Parallelize |
|------|-------|-----------------|
| 1 | Task 1, 2 | Yes |
| 2 | Task 3 | After Wave 1 |

## Tasks

### Task 1: {Title}

{Full XML specification}

---

### Task 2: {Title}

{Full XML specification}

---

### Task 3: {Title}

{Full XML specification}

---

## Requirements Traceability

{Table from Step 7}

## Phase Verification

When all tasks complete, verify:
- [ ] {Phase criterion 1 from ROADMAP.md}
- [ ] {Phase criterion 2 from ROADMAP.md}
- [ ] All requirements marked implemented
- [ ] No regressions introduced

## Estimated Execution

- **Wave 1:** {N} tasks, can run in parallel
- **Wave 2:** {N} tasks, sequential after Wave 1
- **Total:** {N} tasks

---

**Next:** Run `/gsd:execute-phase` to begin execution
```

### Step 9: Update STATE.md

Document plan creation:

```markdown
## Current Status

**Phase:** {N} - {Phase Name}
**Status:** Planned (ready for execution)
**Last Updated:** {Date}

## Progress

- ✅ Phase {N} plan created
- Next: Execute Phase {N}
```

### Step 10: Plan Review

Present plan to user:

```markdown
## Plan Summary - Phase {N}

### Tasks

| # | Title | Wave | Requirements |
|---|-------|------|--------------|
| 1 | {Title} | 1 | V1-F01, V1-N01 |
| 2 | {Title} | 1 | V1-F02 |
| 3 | {Title} | 2 | V1-F03 |

### Requirements Coverage

✅ {X}/{Y} requirements covered
{If gaps: ⚠️ {Y-X} requirements not covered - see plan for details}

### Execution Strategy

- Wave 1: {N} tasks (parallel)
- Wave 2: {N} tasks (after Wave 1)

### Plan Location

`_output/gsd/.planning/PLAN-phase-{N}.md`

### Ready to Execute?

Review the plan and confirm it looks correct.

**Next:** Run `/gsd:execute-phase` to begin wave-based execution.
```

Ask for confirmation before proceeding.

## Output Files

- `_output/gsd/.planning/PLAN-phase-{N}.md` - Complete execution plan
- `_output/gsd/.planning/RESEARCH.md` - Updated with phase research (if conducted)
- Updated `_output/gsd/.planning/STATE.md` - Plan status

## Next Steps

After plan confirmation:
1. **Run `/gsd:execute-phase`** - Wave-based parallel execution

## Success Criteria

- [ ] Maximum 3 tasks defined
- [ ] Each task has complete XML specification
- [ ] Tasks grouped into waves
- [ ] All requirements traced to tasks
- [ ] Decisions from CONTEXT.md applied
- [ ] Research conducted if needed
- [ ] Verification and rollback steps provided
- [ ] User confirms plan correctness

## Notes

**Why Maximum 3 Tasks?**
- Maintains fresh 200k token context per execution
- Prevents context degradation from long sessions
- Ensures atomic, focused work
- Makes rollback easier if issues occur

**Why Wave Analysis?**
- Enables parallel execution for speed
- Makes dependencies explicit
- Helps estimate execution time
- Prevents blocked work

**Requirements Traceability:**
- Every task should implement at least one requirement
- Every V1 requirement should be covered
- Gaps trigger explicit decisions
- Creates audit trail for verification
