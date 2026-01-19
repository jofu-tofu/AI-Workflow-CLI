# GSD Workflow: Help

## Purpose

Display command reference and workflow guidance for GSD system.

## Process

Display comprehensive help:

```markdown
# GSD - Get Shit Done

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
| `/gsd:help` | This help message |
| `/gsd:whats-new` | Recent updates |

### Brownfield
| Command | Purpose |
|---------|---------|
| `/gsd:map-codebase` | Analyze existing codebase |

## Typical Workflows

### New Greenfield Project
1. `/gsd:new-project` - Discovery and roadmap
2. `/gsd:discuss-phase 1` - Clarify phase 1
3. `/gsd:plan-phase 1` - Create plan
4. `/gsd:execute-phase` - Run tasks
5. `/gsd:verify-work 1` - UAT
6. Repeat for each phase

### Brownfield Project
1. `/gsd:map-codebase` - Analyze existing code
2. `/gsd:new-project` - Define goals
3. Continue as greenfield

### Context Switching
1. `/gsd:pause-work` - Before switching
2. (Work on other project)
3. `/gsd:resume-work` - When returning

### Quick Progress Check
1. `/gsd:progress` - See where you are

## Output Directory

All GSD files are stored in `_output/gsd/.planning/`:
- `PROJECT.md` - Vision and goals
- `REQUIREMENTS.md` - V1/V2 requirements
- `ROADMAP.md` - Phase breakdown
- `STATE.md` - Current status
- `CONTEXT.md` - Discussion decisions
- `RESEARCH.md` - Research findings
- `PLAN-phase-{N}.md` - Execution plans
- `VERIFICATION-phase-{N}.md` - UAT reports
- `SUMMARY.md` - Commit history
- `ISSUES.md` - Future enhancements
- `HANDOFF.md` - Context for resume
- `todos/` - Captured ideas
- `archive/` - Milestone archives
```

## Output

Display only
