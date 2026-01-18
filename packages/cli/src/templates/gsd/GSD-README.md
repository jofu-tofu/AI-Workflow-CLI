# Get Shit Done (GSD) Template

A meta-prompting and context engineering system for Claude Code that enables spec-driven development through atomic task planning, wave-based parallel execution, and conversational UAT.

## Overview

The GSD template provides a structured workflow for managing projects from ideation to completion, emphasizing:

- **5 Core Loop Commands**: Unified workflow from project to verification
- **Wave-Based Execution**: Parallel task execution with fresh context per task
- **Requirements Traceability**: V1/V2 requirements linked to phases and tasks
- **Conversational UAT**: Interactive verification with auto-diagnosis
- **Persistent State**: Continuous tracking of decisions, blockers, and progress

## Installation

```bash
aiw init --method gsd --ide claude
```

This installs:
- `_gsd/` - Core workflow files and templates
- `.claude/commands/gsd/` - Claude IDE slash commands
- `.planning/` - Output directory for project documentation

## Core Loop (5 Commands)

| Command | Purpose |
|---------|---------|
| `/gsd:new-project` | Initialize project with discovery, requirements, and roadmap |
| `/gsd:discuss-phase [N]` | Capture decisions before planning |
| `/gsd:plan-phase [N]` | Create atomic task plan with wave groupings |
| `/gsd:execute-phase` | Wave-based parallel execution |
| `/gsd:verify-work [N]` | Conversational UAT with auto-diagnosis |

## Utility Commands

### Planning & Research
| Command | Purpose |
|---------|---------|
| `/gsd:research-phase [N]` | Standalone research for a phase |
| `/gsd:list-phase-assumptions [N]` | Show assumptions and their status |

### Roadmap Management
| Command | Purpose |
|---------|---------|
| `/gsd:add-phase` | Append new phase to roadmap |
| `/gsd:insert-phase [N]` | Insert urgent phase (renumbers) |
| `/gsd:remove-phase [N]` | Remove phase (renumbers) |

### Context Management
| Command | Purpose |
|---------|---------|
| `/gsd:progress` | Show current position and next steps |
| `/gsd:pause-work` | Create handoff for context switch |
| `/gsd:resume-work` | Restore from handoff |

### Milestones
| Command | Purpose |
|---------|---------|
| `/gsd:complete-milestone` | Archive version, prepare sequel |
| `/gsd:new-milestone` | Start v2, v3, etc. |

### Utilities
| Command | Purpose |
|---------|---------|
| `/gsd:debug` | Systematic debugging workflow |
| `/gsd:add-todo` | Capture ideas for later |
| `/gsd:check-todos` | List pending todos |
| `/gsd:help` | Command reference |
| `/gsd:whats-new` | Recent updates |

### Brownfield
| Command | Purpose |
|---------|---------|
| `/gsd:map-codebase` | Analyze existing codebase |

## Workflow

### 1. Start a New Project

```bash
/gsd:new-project
```

Creates in `.planning/`:
- `PROJECT.md` - Vision, goals, success criteria
- `REQUIREMENTS.md` - V1/V2 requirements
- `ROADMAP.md` - Phase sequence
- `STATE.md` - Decisions and progress
- `ISSUES.md` - Deferred enhancements

### 2. Discuss Phase (Optional)

```bash
/gsd:discuss-phase 1
```

Captures pre-planning decisions:
- Visual/UI decisions
- API/Data decisions
- Content/Copy decisions
- Organization decisions
- Assumptions

Creates `CONTEXT.md` with decisions for planning.

### 3. Plan a Phase

```bash
/gsd:plan-phase 1
```

Creates `PLAN-phase-1.md` with:
- Maximum 3 atomic tasks
- Wave groupings for parallel execution
- Requirements traceability
- XML-formatted implementation specs
- Verification and rollback steps

### 4. Execute the Phase

```bash
/gsd:execute-phase
```

Executes tasks wave by wave:
- Wave 1 tasks run in parallel
- Wave 2 waits for Wave 1 to complete
- Fresh 200k context per task
- Atomic git commits per task

### 5. Verify Work

```bash
/gsd:verify-work 1
```

Conversational UAT:
- Automated checks (tests, linting, build)
- One-by-one manual verification
- Auto-diagnosis for failures
- Integrated fix planning
- Approval or fix cycle

### 6. Check Progress

```bash
/gsd:progress
```

Shows:
- Current phase and task
- Completion percentages
- Active blockers
- Recommended next action

## Key Files

All files stored in `.planning/`:

- **PROJECT.md** - Project vision and goals
- **REQUIREMENTS.md** - V1/V2 requirements with traceability
- **ROADMAP.md** - Phase sequence and completion status
- **CONTEXT.md** - Discussion decisions per phase
- **RESEARCH.md** - Research findings
- **STATE.md** - Persistent decisions, blockers, progress
- **PLAN-phase-{N}.md** - XML-structured atomic tasks with waves
- **VERIFICATION-phase-{N}.md** - UAT reports
- **SUMMARY.md** - Commit history and changes
- **ISSUES.md** - Deferred enhancements tracking
- **CODEBASE.md** - Analysis for brownfield projects
- **HANDOFF.md** - Resumption documentation

## Templates

Template files in `_gsd/templates/`:
- PROJECT.md.template
- REQUIREMENTS.md.template
- ROADMAP.md.template
- CONTEXT.md.template
- RESEARCH.md.template
- STATE.md.template
- PLAN.md.template
- SUMMARY.md.template
- ISSUES.md.template

## Design Principles

### 5 Core Loop Commands
- Unified workflow from project to verification
- Each step builds on previous
- Clear handoffs between commands
- Single entry point (new-project)

### Wave-Based Execution
- Tasks grouped by dependencies
- Parallel execution within waves
- Fresh 200k context per task
- No context degradation

### Maximum 3 Tasks Per Plan
- Maintains focused sessions
- Easier to review
- Simpler rollback
- Natural break points

### Atomic Commits
- One commit per task
- Clear change history
- Easy rollback
- Facilitates code review
- Supports git bisect

### XML-Formatted Tasks
```xml
<task id="1" wave="1">
  <objective>What this accomplishes</objective>
  <requirements>V1-F01, V1-N01</requirements>
  <action>Specific steps with file paths</action>
  <decisions>From CONTEXT.md</decisions>
  <verification>How to verify</verification>
  <rollback>How to undo</rollback>
  <acceptance_criteria>Testable criteria</acceptance_criteria>
</task>
```

### Requirements Traceability
- V1 (must have) vs V2 (should have)
- Requirements linked to phases
- Tasks traced to requirements
- Verification against requirements

### Conversational UAT
- One-by-one verification items
- User confirms each item
- Auto-diagnosis on failures
- Integrated fix planning

## Brownfield Projects

For existing codebases:

```bash
/gsd:map-codebase
```

Analyzes:
- Technology stack
- Architecture patterns
- Pain points
- Technical debt

Creates `CODEBASE.md` with SWOT analysis and recommendations.

## Pausing and Resuming

### Pause Work
```bash
/gsd:pause-work
```

Creates `HANDOFF.md` with:
- Current context
- Next steps
- Blockers
- Mental model
- Environment setup
- Resumption checklist

### Resume Work
```bash
/gsd:resume-work
```

Restores context from `HANDOFF.md`:
- Rebuilds mental model
- Checks blockers
- Verifies environment
- Shows next actions

## Milestone Completion

```bash
/gsd:complete-milestone
```

Archives project state:
- Creates `MILESTONE-{version}.md`
- Git tags release
- Archives to `archive/v{version}/`
- Prepares for sequel (v2, v3, etc.)

## Benefits

- **No Context Degradation** - Fresh agent per task
- **Wave-Based Speed** - Parallel execution where possible
- **Requirements Traceability** - From requirements to verification
- **Clear Progress Tracking** - Always know where you are
- **Easy Rollback** - Atomic commits + rollback specs
- **Handoff Ready** - Pause/resume anytime
- **Quality Focus** - Conversational UAT built into workflow
- **Persistent Memory** - STATE.md never forgets
- **Brownfield Support** - Works with existing code
- **Flexible Phases** - Add/insert/remove as needed

## Recommended Usage

1. **Greenfield**: new-project → discuss-phase → plan-phase → execute-phase → verify-work
2. **Brownfield**: map-codebase → new-project → then greenfield flow
3. **Quick Check**: progress (shows current position + next step)
4. **Context Switch**: pause-work → (switch) → resume-work
5. **Issues Found**: verify-work handles diagnosis and fix planning

## Credits

Based on [get-shit-done](https://github.com/glittercowboy/get-shit-done) by glittercowboy.

Adapted for AIW CLI template system with 5-core loop architecture, wave-based execution, and conversational UAT.
