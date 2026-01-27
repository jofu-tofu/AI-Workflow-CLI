# GSD Workflows

Complete reference for all GSD workflows and commands.

---

## Workflow Location

All canonical workflow files are stored in:

```
_gsd/workflows/
```

IDE-specific command stubs reference these canonical workflows:
- Claude Code: `.claude/commands/gsd/`
- Windsurf: `.windsurf/workflows/gsd/`

---

## Workflow Categories

| Category | Workflows |
|----------|-----------|
| **Core Loop** | new-project, discuss-phase, plan-phase, execute-phase, verify-work |
| **Planning** | research-phase, list-phase-assumptions |
| **Roadmap** | add-phase, insert-phase, remove-phase |
| **Context** | progress, pause-work, resume-work |
| **Milestones** | complete-milestone, new-milestone |
| **Utilities** | debug, add-todo, check-todos, help, whats-new |
| **Brownfield** | map-codebase |

---

## Core Loop Workflows

### new-project

**Command:** `/gsd:new-project`

**Purpose:** Initialize a new project with full discovery.

**Process:**
1. Conduct discovery conversation
2. Extract vision and goals
3. Gather V1/V2 requirements
4. Create phase roadmap
5. Initialize state tracking

**Creates:**
- `PROJECT.md`
- `REQUIREMENTS.md`
- `ROADMAP.md`
- `STATE.md`
- `ISSUES.md`

**When to Use:**
- Starting a greenfield project
- After `map-codebase` for brownfield projects

---

### discuss-phase

**Command:** `/gsd:discuss-phase [N]`

**Purpose:** Capture decisions before planning.

**Process:**
1. Load phase context from ROADMAP.md
2. Open discussion for each decision category
3. Record decisions and assumptions
4. Save to CONTEXT.md

**Creates/Updates:**
- `CONTEXT.md`

**When to Use:**
- Before complex phases
- When requirements need clarification
- To document architectural decisions

---

### plan-phase

**Command:** `/gsd:plan-phase [N]`

**Purpose:** Create atomic task plan with waves.

**Process:**
1. Load phase from ROADMAP.md
2. Load decisions from CONTEXT.md (if exists)
3. Create max 3 tasks
4. Group into waves
5. Link to requirements
6. Add verification/rollback steps

**Creates:**
- `PLAN-phase-{N}.md`

**When to Use:**
- After discuss-phase (recommended)
- When ready to implement a phase

---

### execute-phase

**Command:** `/gsd:execute-phase`

**Purpose:** Execute tasks with fresh context.

**Process:**
1. Load current plan
2. Execute Wave 1 tasks (parallel where possible)
3. Make atomic commits
4. Execute subsequent waves
5. Update STATE.md

**Updates:**
- `STATE.md`
- `SUMMARY.md`

**When to Use:**
- After plan-phase
- When ready to implement

---

### verify-work

**Command:** `/gsd:verify-work [N]`

**Purpose:** Conversational UAT with auto-diagnosis.

**Process:**
1. Run automated checks
2. Present verification items one-by-one
3. Record user confirmations
4. Auto-diagnose failures
5. Create fix plans if needed

**Creates/Updates:**
- `VERIFICATION-phase-{N}.md`
- `STATE.md`

**When to Use:**
- After execute-phase
- Before moving to next phase

---

## Planning Workflows

### research-phase

**Command:** `/gsd:research-phase [N]`

**Purpose:** Conduct standalone research for a phase.

**Process:**
1. Identify research topics
2. Gather information
3. Compare options
4. Make recommendations
5. Document findings

**Creates/Updates:**
- `RESEARCH.md`

**When to Use:**
- Before discuss-phase for complex topics
- When evaluating technology options
- For unfamiliar domains

---

### list-phase-assumptions

**Command:** `/gsd:list-phase-assumptions [N]`

**Purpose:** Show assumptions and their status.

**Process:**
1. Load CONTEXT.md
2. Extract assumptions
3. Check assumption status
4. Display with validation status

**When to Use:**
- To review assumptions before execution
- To identify risks

---

## Roadmap Workflows

### add-phase

**Command:** `/gsd:add-phase`

**Purpose:** Append new phase to end of roadmap.

**Process:**
1. Load ROADMAP.md
2. Gather new phase details
3. Append to phase list
4. Update STATE.md

**Updates:**
- `ROADMAP.md`
- `STATE.md`

**When to Use:**
- When scope expands
- To add V2 features

---

### insert-phase

**Command:** `/gsd:insert-phase [N]`

**Purpose:** Insert urgent phase (renumbers subsequent).

**Process:**
1. Load ROADMAP.md
2. Gather urgent phase details
3. Insert at position N
4. Renumber subsequent phases
5. Update references

**Updates:**
- `ROADMAP.md`
- `STATE.md`
- Plan files (renumbered)

**When to Use:**
- For urgent requirements
- Critical bug fixes
- Blocking dependencies

**Caution:** Use sparingly - renumbering can cause confusion.

---

### remove-phase

**Command:** `/gsd:remove-phase [N]`

**Purpose:** Remove a phase (renumbers subsequent).

**Process:**
1. Confirm removal
2. Archive phase content
3. Remove from ROADMAP.md
4. Renumber subsequent phases

**Updates:**
- `ROADMAP.md`
- `STATE.md`

**When to Use:**
- When requirements change
- Phase becomes unnecessary

---

## Context Workflows

### progress

**Command:** `/gsd:progress`

**Purpose:** Show current position and next steps.

**Displays:**
- Current phase and task
- Completion percentages
- Active blockers
- Recommended next action

**When to Use:**
- Start of session
- After returning from break
- To orient yourself

---

### pause-work

**Command:** `/gsd:pause-work`

**Purpose:** Create handoff documentation.

**Process:**
1. Capture current context
2. Document next steps
3. List active blockers
4. Capture mental model
5. Create resumption checklist

**Creates:**
- `HANDOFF.md`

**When to Use:**
- Before context switch
- End of work session
- Handing off to another person

---

### resume-work

**Command:** `/gsd:resume-work`

**Purpose:** Restore context from handoff.

**Process:**
1. Load HANDOFF.md
2. Rebuild mental model
3. Check blockers
4. Verify environment
5. Show next actions

**When to Use:**
- After pause-work
- Starting new session
- Taking over from handoff

---

## Milestone Workflows

### complete-milestone

**Command:** `/gsd:complete-milestone`

**Purpose:** Archive version and prepare sequel.

**Process:**
1. Verify all phases complete
2. Create milestone archive
3. Git tag release
4. Archive to `archive/v{version}/`
5. Prepare for next version

**Creates:**
- `MILESTONE-{version}.md`
- Git tag
- Archive directory

**When to Use:**
- All V1 requirements complete
- Ready for release
- Starting V2 planning

---

### new-milestone

**Command:** `/gsd:new-milestone`

**Purpose:** Start v2, v3, etc.

**Process:**
1. Load completed milestone
2. Carry over V2 requirements
3. Add new requirements
4. Create new roadmap
5. Reset state

**Creates:**
- New `PROJECT.md` (version updated)
- New `REQUIREMENTS.md`
- New `ROADMAP.md`
- New `STATE.md`

**When to Use:**
- After complete-milestone
- Starting next major version

---

## Utility Workflows

### debug

**Command:** `/gsd:debug`

**Purpose:** Systematic debugging workflow.

**Process:**
1. Describe the problem
2. Identify symptoms
3. Form hypotheses
4. Test each hypothesis
5. Implement fix
6. Verify resolution

**When to Use:**
- Encountering bugs
- Test failures
- Unexpected behavior

---

### add-todo

**Command:** `/gsd:add-todo`

**Purpose:** Capture ideas for later.

**Process:**
1. Capture idea
2. Categorize (enhancement, fix, research)
3. Add to ISSUES.md

**Updates:**
- `ISSUES.md`

**When to Use:**
- During work when ideas arise
- To avoid scope creep
- To track future enhancements

---

### check-todos

**Command:** `/gsd:check-todos`

**Purpose:** List pending todos.

**Displays:**
- Deferred enhancements
- Known issues
- Technical debt items

**When to Use:**
- Planning next phase
- Looking for quick wins
- Reviewing backlog

---

### help

**Command:** `/gsd:help`

**Purpose:** Show command reference.

**Displays:**
- All available commands
- Brief descriptions
- Usage examples

**When to Use:**
- Learning GSD
- Forgetting command names
- Quick reference

---

### whats-new

**Command:** `/gsd:whats-new`

**Purpose:** Show recent GSD updates.

**Displays:**
- Recent changes
- New features
- Breaking changes

**When to Use:**
- After GSD update
- Checking for new features

---

## Brownfield Workflow

### map-codebase

**Command:** `/gsd:map-codebase`

**Purpose:** Analyze existing codebase.

**Process:**
1. Scan project structure
2. Identify technology stack
3. Analyze architecture patterns
4. Document pain points
5. Assess technical debt
6. Create SWOT analysis

**Creates:**
- `CODEBASE.md`

**When to Use:**
- Before new-project on existing code
- Taking over a project
- Architecture assessment

---

## Workflow Execution Order

### Greenfield Project

```
1. new-project
2. discuss-phase 1 (optional)
3. plan-phase 1
4. execute-phase
5. verify-work 1
6. [repeat 2-5 for each phase]
7. complete-milestone
```

### Brownfield Project

```
1. map-codebase
2. new-project
3. [continue as greenfield]
```

### Context Switch

```
1. pause-work
[switch context]
2. resume-work
3. progress
4. [continue work]
```

---

## Workflow File Structure

```
_gsd/workflows/
├── new-project.md
├── discuss-phase.md
├── plan-phase.md
├── execute-phase.md
├── verify-work.md
├── research-phase.md
├── list-phase-assumptions.md
├── add-phase.md
├── insert-phase.md
├── remove-phase.md
├── progress.md
├── pause-work.md
├── resume-work.md
├── complete-milestone.md
├── new-milestone.md
├── debug.md
├── add-todo.md
├── check-todos.md
├── help.md
├── whats-new.md
└── map-codebase.md
```

---

**Back to:** [Index](./index.md) | [Core Loop](./core-loop.md)
