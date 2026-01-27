# GSD Workflow: New Project

## Purpose

Initialize a complete project from ideation to roadmap in a single unified workflow. This workflow guides discovery, conducts research, generates requirements, and produces a complete project plan.

## Overview

This is the entry point for all new GSD projects. It combines project discovery with roadmap creation to ensure projects start with complete context.

**Outputs:**
- `_output/gsd/.planning/` directory structure
- `_output/gsd/.planning/PROJECT.md` - Vision and goals
- `_output/gsd/.planning/REQUIREMENTS.md` - V1/V2 requirements
- `_output/gsd/.planning/ROADMAP.md` - Phase breakdown
- `_output/gsd/.planning/STATE.md` - Project state tracking
- `_output/gsd/.planning/ISSUES.md` - Future enhancements
- `_output/gsd/.planning/SUMMARY.md` - Change history

## Process

### Step 0: Initialize Planning Directory

Create the `_output/gsd/.planning/` directory structure:

```bash
mkdir -p _output/gsd/.planning/todos
mkdir -p _output/gsd/.planning/archive
```

This creates:
- `_output/gsd/.planning/` - Main output directory for all project documentation
- `_output/gsd/.planning/todos/` - Subdirectory for captured ideas and notes
- `_output/gsd/.planning/archive/` - Subdirectory for milestone archives

### Step 1: Discovery Questions

Gather project context through guided questioning.

**Core Questions:**

1. **What problem are you solving?**
   - What's the core pain point?
   - Who experiences this problem?
   - How severe is this problem?

2. **What's the desired outcome?**
   - What does success look like?
   - How will you measure it?
   - What's the minimum viable solution?

3. **What are the constraints?**
   - Time limitations?
   - Technical requirements?
   - Resource availability?
   - Integration requirements?

4. **Who is this for?**
   - Target audience/users?
   - Stakeholders?
   - Personas if available?

5. **What's explicitly out of scope?**
   - What are you NOT building?
   - What features are deferred?
   - What could be phase 2+?

6. **What's the technical context?**
   - New (greenfield) or existing (brownfield)?
   - Tech stack preferences?
   - Deployment targets?

**For Brownfield Projects:**
- Run `/gsd:map-codebase` first
- Or ask: What existing code will this interact with?

### Step 2: Research Phase (Optional)

If the project involves unfamiliar technology or patterns, spawn research agents:

**Research Triggers:**
- User mentions unfamiliar technology
- Integration with external systems
- Complex domain requirements
- Performance-critical requirements

**Research Process:**
1. Identify knowledge gaps from discovery answers
2. Spawn research agent(s) to gather information:
   - Documentation lookup
   - Best practices research
   - Similar implementation patterns
3. Capture findings in `_output/gsd/.planning/RESEARCH.md`
4. Surface key findings to user for validation

**Skip Research If:**
- Project uses familiar technologies
- Requirements are straightforward
- User explicitly opts out

### Step 3: Synthesize Requirements

Transform discovery answers into structured requirements.

**Process:**
1. Categorize responses into functional vs non-functional
2. Prioritize into V1 (must have) vs V2 (should have)
3. Identify acceptance criteria for each requirement
4. Link requirements to potential phases

**Generate `_output/gsd/.planning/REQUIREMENTS.md`:**
- Use `.aiwcli/_gsd/templates/REQUIREMENTS.md.template`
- Fill in V1 requirements (MVP scope)
- Note V2 requirements (future scope)
- Create traceability placeholders

### Step 4: Generate PROJECT.md

Create the project vision document.

**Process:**
1. Use `.aiwcli/_gsd/templates/PROJECT.md.template`
2. Replace `{{PROJECT_NAME}}` with project name
3. Replace `{{DATE}}` with current date
4. Fill in all sections based on discovery responses
5. Write file to `_output/gsd/.planning/PROJECT.md`

**Include:**
- Clear vision statement
- Measurable goals (linked to requirements)
- Success criteria
- Constraints (technical, time, resources)
- Target users
- Out of scope items

### Step 5: Design Roadmap

Break the project into logical phases.

**Phase Design Principles:**
- Each phase should be independently deployable if possible
- Phases should build on each other logically
- Each phase should have clear deliverables
- Maximum value delivery early (MVP first)
- Maximum 3-8 phases total

**Common Phase Patterns:**

*Simple Project (3-4 phases):*
1. Foundation/Setup
2. Core Functionality
3. Polish & Deploy

*Standard Project (5-6 phases):*
1. Foundation/Setup
2. Core Feature A
3. Core Feature B
4. Integration & Testing
5. Polish & Documentation
6. Deploy & Monitor

*Complex Project (7-8 phases):*
1. Foundation/Architecture
2. Data Layer
3. Core Feature A
4. Core Feature B
5. Advanced Features
6. Integration
7. Testing & QA
8. Deploy & Monitor

**For Each Phase Define:**
- Name: Clear, descriptive title
- Description: What this phase accomplishes
- Tasks: 3-10 concrete tasks (high-level)
- Dependencies: Previous phases required
- Verification Criteria: How to know it's complete

### Step 6: Generate ROADMAP.md

Create the roadmap document.

**Process:**
1. Use `.aiwcli/_gsd/templates/ROADMAP.md.template`
2. Replace placeholders with project info
3. Add all phases with:
   - Status: ⏳ Pending for all initial phases
   - Description
   - High-level tasks
   - Verification criteria
4. Write file to `_output/gsd/.planning/ROADMAP.md`

### Step 7: Initialize STATE.md

Create the state tracking document.

**Process:**
1. Use `.aiwcli/_gsd/templates/STATE.md.template`
2. Set initial state:
   - Phase: 1 (ready to start)
   - Status: Planning complete
3. Document key decisions from discovery
4. Add initial next steps
5. Write file to `_output/gsd/.planning/STATE.md`

### Step 8: Initialize Supporting Files

Create remaining project files:

**`_output/gsd/.planning/ISSUES.md`:**
- Use `.aiwcli/_gsd/templates/ISSUES.md.template`
- Add any V2+ items as future enhancements
- Add technical debt considerations

**`_output/gsd/.planning/SUMMARY.md`:**
- Use `.aiwcli/_gsd/templates/SUMMARY.md.template`
- Initialize with project creation entry

### Step 9: User Confirmation

Present the complete project setup for review:

```markdown
## Project Setup Complete

### Files Created

✅ `_output/gsd/.planning/PROJECT.md` - Project vision and goals
✅ `_output/gsd/.planning/REQUIREMENTS.md` - V1/V2 requirements (X V1, Y V2)
✅ `_output/gsd/.planning/ROADMAP.md` - Phase breakdown (N phases)
✅ `_output/gsd/.planning/STATE.md` - Project state tracking
✅ `_output/gsd/.planning/ISSUES.md` - Future enhancements
✅ `_output/gsd/.planning/SUMMARY.md` - Change history

### Roadmap Overview

| Phase | Name | Est. Tasks |
|-------|------|------------|
| 1 | [Name] | X tasks |
| 2 | [Name] | Y tasks |
| ... | ... | ... |

### V1 Requirements Summary

- X functional requirements
- Y non-functional requirements

### Ready to Start?

The project is configured. Next recommended action:

**Run `/gsd:discuss-phase 1`** to clarify Phase 1 details before planning.

Or **Run `/gsd:plan-phase 1`** to create detailed execution plan for Phase 1.
```

Ask user to confirm:
- Does the project scope look correct?
- Is the phase breakdown reasonable?
- Any adjustments needed?

## Output Files

All files created in `_output/gsd/.planning/` directory:
- `PROJECT.md` - Project vision and goals
- `REQUIREMENTS.md` - V1/V2 requirements with traceability
- `ROADMAP.md` - Phase breakdown with verification criteria
- `STATE.md` - Current state and decisions
- `ISSUES.md` - Deferred enhancements
- `SUMMARY.md` - Change/commit history
- `RESEARCH.md` - Research findings (if research conducted)

## Next Steps

Recommend the following workflow:

1. **If requirements are clear:** `/gsd:plan-phase 1`
2. **If clarifications needed:** `/gsd:discuss-phase 1`
3. **For brownfield projects:** `/gsd:map-codebase` (if not already done)
4. **To review setup:** `/gsd:progress`

## Success Criteria

- [ ] `_output/gsd/.planning/` directory created with proper structure
- [ ] `PROJECT.md` created with complete vision
- [ ] `REQUIREMENTS.md` created with V1/V2 separation
- [ ] `ROADMAP.md` created with 3-8 logical phases
- [ ] `STATE.md` initialized with current position
- [ ] All supporting files initialized
- [ ] User confirms project setup accuracy
- [ ] Clear next steps provided

## Notes

**Why Unified Workflow?**
- Single entry point reduces confusion
- Ensures all foundational documents exist
- Creates complete context before any planning
- Prevents orphaned projects without roadmaps

**When to Skip Research:**
- Familiar technology stack
- Simple CRUD operations
- User has clear technical direction
- Time constraints (user explicitly opts out)

**When to Add Research:**
- New framework or library
- Complex integrations
- Performance-critical features
- Security-sensitive operations
