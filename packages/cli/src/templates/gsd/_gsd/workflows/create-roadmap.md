# GSD Workflow: Create Roadmap

## Purpose

Generate a phased roadmap based on _GSD_OUTPUT/PROJECT.md goals and establish persistent state tracking.

## Prerequisites

- _GSD_OUTPUT/PROJECT.md must exist
- Read and understand project vision and goals

## Process

### Step 1: Analyze Project Scope

Read _GSD_OUTPUT/PROJECT.md and identify:
1. All stated goals
2. Success criteria
3. Technical constraints
4. Timeline constraints

### Step 2: Design Phase Structure

Break the project into logical phases (typically 3-8 phases):

**Phase Design Principles:**
- Each phase should be completable in a reasonable timeframe
- Phases should build on each other logically
- Each phase should have clear deliverables
- Maximum value delivery early (prioritize MVP features)

**Common Phase Patterns:**
1. Foundation/Setup
2. Core Functionality
3. Advanced Features
4. Polish/Optimization
5. Documentation/Deployment

### Step 3: Define Phase Details

For each phase, specify:
- **Name:** Clear, descriptive title
- **Description:** What this phase accomplishes
- **Tasks:** 3-10 concrete tasks (not detailed yet)
- **Verification Criteria:** How to know it's complete

### Step 4: Generate ROADMAP.md

Use `_gsd/templates/ROADMAP.md.template` to create the roadmap:

1. Replace `{{PROJECT_NAME}}` with project name
2. Replace `{{DATE}}` with current date
3. Add all phases in sequence
4. Set first phase status to ⏳ Pending
5. Write file to _GSD_OUTPUT/ROADMAP.md

### Step 5: Initialize STATE.md

Update _GSD_OUTPUT/STATE.md with:
- Current phase: Phase 1
- Initial decisions made
- Next steps: Create plan for Phase 1

### Step 6: Confirmation

Show the user:
- Complete phase breakdown
- Estimated scope of each phase
- Recommended starting point

## Next Steps

Recommend running `/gsd:plan-phase 1` to create detailed execution plan for Phase 1.

## Success Criteria

- [ ] _GSD_OUTPUT/ROADMAP.md created with all phases
- [ ] Each phase has clear description and tasks
- [ ] _GSD_OUTPUT/STATE.md initialized
- [ ] User confirms phase breakdown makes sense
