# Get Shit Done (GSD) Template

A meta-prompting and context engineering system for Claude Code that enables spec-driven development through atomic task planning and subagent execution.

## Overview

The GSD template provides a structured workflow for managing projects from ideation to completion, emphasizing:

- **Fresh Context**: Each task executes in a clean 200k token context to prevent degradation
- **Atomic Tasks**: Maximum 3 tasks per plan to maintain focus
- **XML-Formatted Plans**: Clear, structured execution specifications
- **Persistent State**: Continuous tracking of decisions, blockers, and progress
- **Modular Phases**: Break complex projects into manageable phases

## Installation

```bash
aiw init --method gsd --ide claude
```

This installs:
- `_gsd/` - Core workflow files and templates
- `.claude/commands/gsd/` - Claude IDE slash commands

## Core Commands

| Command | Purpose |
|---------|---------|
| `/gsd:new-project` | Extract ideas through guided questions, create PROJECT.md |
| `/gsd:create-roadmap` | Generate roadmap and persistent state tracking |
| `/gsd:map-codebase` | Analyze existing codebases for brownfield projects |
| `/gsd:plan-phase [N]` | Create atomic task plans for specific phases |
| `/gsd:execute-plan` | Run plans via fresh subagent contexts |
| `/gsd:progress` | Display current position and next steps |
| `/gsd:verify-work [N]` | User acceptance testing for phases/plans |
| `/gsd:plan-fix [plan]` | Address UAT issues with targeted fixes |
| `/gsd:complete-milestone` | Archive versions and prepare sequels |
| `/gsd:add-phase` | Append phases to roadmap |
| `/gsd:insert-phase [N]` | Inject urgent work between phases |
| `/gsd:pause-work` | Create handoff files for suspended work |
| `/gsd:resume-work` | Restore from previous sessions |

## Workflow

### 1. Start a New Project

```bash
/gsd:new-project
```

Creates:
- `PROJECT.md` - Vision, goals, success criteria
- `ROADMAP.md` - Phase sequence
- `STATE.md` - Decisions and progress
- `ISSUES.md` - Deferred enhancements
- `todos/` - Idea capture

### 2. Create Roadmap

```bash
/gsd:create-roadmap
```

Breaks project into phases (typically 3-8 phases), each with:
- Clear deliverables
- 3-10 tasks
- Verification criteria

### 3. Plan a Phase

```bash
/gsd:plan-phase 1
```

Creates `PLAN-phase-1.md` with maximum 3 atomic tasks, each containing:
- Objective
- XML-formatted implementation
- Acceptance criteria
- Verification steps
- Rollback procedure

### 4. Execute the Plan

```bash
/gsd:execute-plan
```

Executes each task in fresh subagent context:
- Clean 200k tokens per task
- Atomic git commits
- Verification after each task
- Blocks on failures

### 5. Verify Work

```bash
/gsd:verify-work 1
```

User acceptance testing:
- Automated checks (tests, linting, build)
- Manual verification guided prompts
- Issue tracking
- Approval or fix planning

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

- **PROJECT.md** - Project vision and goals
- **ROADMAP.md** - Phase sequence and completion status
- **STATE.md** - Persistent decisions, blockers, progress
- **PLAN-phase-{N}.md** - XML-structured atomic tasks with verification
- **SUMMARY.md** - Commit history and changes
- **ISSUES.md** - Deferred enhancements tracking
- **CODEBASE.md** - Analysis for brownfield projects (optional)
- **HANDOFF.md** - Resumption documentation (created by pause-work)

## Templates

Template files in `_gsd/templates/` provide starting structure for:
- PROJECT.md
- ROADMAP.md
- STATE.md
- PLAN.md
- SUMMARY.md
- ISSUES.md

## Design Principles

### Fresh Context Per Task
- Prevents context degradation
- Full 200k tokens available
- Better code quality
- Fewer errors

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
<task>
  <action>
    Specific, concrete action with file paths and exact changes
  </action>
  <verification>
    How to verify: tests, behaviors, outputs
  </verification>
  <rollback>
    How to undo: git commands, files to restore
  </rollback>
</task>
```

### Persistent State Tracking
- STATE.md captures all decisions
- Blockers documented with context
- Progress visible at all times
- Handoff-ready documentation

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

✅ **No Context Degradation** - Fresh agent per task
✅ **Clear Progress Tracking** - Always know where you are
✅ **Easy Rollback** - Atomic commits + rollback specs
✅ **Handoff Ready** - Pause/resume anytime
✅ **Quality Focus** - UAT built into workflow
✅ **Persistent Memory** - STATE.md never forgets
✅ **Brownfield Support** - Works with existing code
✅ **Flexible Phases** - Add/insert as needed

## Recommended Usage

1. **Greenfield**: new-project → create-roadmap → plan-phase → execute-plan → verify-work
2. **Brownfield**: map-codebase → new-project → create-roadmap → plan-phase → execute-plan → verify-work
3. **Quick Check**: progress (shows current position + next step)
4. **Context Switch**: pause-work (before switching) → resume-work (when returning)
5. **Issues Found**: verify-work → plan-fix → execute-plan → verify-work

## Credits

Based on [get-shit-done](https://github.com/glittercowboy/get-shit-done) by glittercowboy.

Adapted for AIW CLI template system with full workflow documentation and Claude Code integration.
