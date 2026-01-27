# GSD Documentation Index

**Get Shit Done (GSD)** - A meta-prompting and context engineering system for AI-assisted development.

---

## Quick Navigation

| Document | Description |
|----------|-------------|
| [Core Loop](./core-loop.md) | The 5 essential commands for project execution |
| [File Reference](./file-reference.md) | All GSD files and their purposes |
| [Templates](./templates.md) | Template file specifications |
| [Workflows](./workflows.md) | Complete workflow documentation |

---

## What is GSD?

GSD is a structured workflow system for managing projects from ideation to completion. It emphasizes:

- **5 Core Loop Commands** - Unified workflow from project to verification
- **Wave-Based Execution** - Parallel task execution with fresh context per task
- **Requirements Traceability** - V1/V2 requirements linked to phases and tasks
- **Conversational UAT** - Interactive verification with auto-diagnosis
- **Persistent State** - Continuous tracking of decisions, blockers, and progress

---

## Core Concepts

### 1. The 5-Command Core Loop

Every GSD project follows this cycle:

```
new-project → discuss-phase → plan-phase → execute-phase → verify-work
     ↑                                                          │
     └──────────────────────────────────────────────────────────┘
```

### 2. Wave-Based Execution

Tasks are grouped into waves for parallel execution:
- Wave 1 tasks run in parallel
- Wave 2 waits for Wave 1 to complete
- Fresh 200k context per task
- No context degradation

### 3. Maximum 3 Tasks Per Plan

Each plan contains at most 3 tasks to:
- Maintain focused sessions
- Enable easier review
- Support simpler rollback
- Create natural break points

### 4. XML-Formatted Task Specs

```xml
<task id="1" wave="1">
  <objective>What this accomplishes</objective>
  <requirements>V1-F01, V1-N01</requirements>
  <action>Specific steps with file paths</action>
  <verification>How to verify</verification>
  <rollback>How to undo</rollback>
</task>
```

---

## File Structure

All GSD outputs are stored in `_output/gsd/.planning/`:

```
_output/gsd/.planning/
├── PROJECT.md          # Vision and goals
├── REQUIREMENTS.md     # V1/V2 requirements
├── ROADMAP.md          # Phase sequence
├── STATE.md            # Decisions and progress
├── CONTEXT.md          # Phase discussions
├── RESEARCH.md         # Research findings
├── PLAN-phase-{N}.md   # Task plans per phase
├── VERIFICATION-{N}.md # UAT reports
├── SUMMARY.md          # Commit history
├── ISSUES.md           # Deferred enhancements
├── CODEBASE.md         # Brownfield analysis
└── HANDOFF.md          # Resumption docs
```

---

## Command Categories

### Core Loop (5 Commands)
| Command | Purpose |
|---------|---------|
| `/gsd:new-project` | Initialize project |
| `/gsd:discuss-phase [N]` | Capture decisions |
| `/gsd:plan-phase [N]` | Create task plan |
| `/gsd:execute-phase` | Execute tasks |
| `/gsd:verify-work [N]` | UAT verification |

### Planning & Research
| Command | Purpose |
|---------|---------|
| `/gsd:research-phase [N]` | Standalone research |
| `/gsd:list-phase-assumptions [N]` | Show assumptions |

### Roadmap Management
| Command | Purpose |
|---------|---------|
| `/gsd:add-phase` | Append new phase |
| `/gsd:insert-phase [N]` | Insert urgent phase |
| `/gsd:remove-phase [N]` | Remove phase |

### Context Management
| Command | Purpose |
|---------|---------|
| `/gsd:progress` | Show current position |
| `/gsd:pause-work` | Create handoff |
| `/gsd:resume-work` | Restore from handoff |

### Milestones
| Command | Purpose |
|---------|---------|
| `/gsd:complete-milestone` | Archive version |
| `/gsd:new-milestone` | Start v2, v3, etc. |

### Utilities
| Command | Purpose |
|---------|---------|
| `/gsd:debug` | Systematic debugging |
| `/gsd:add-todo` | Capture ideas |
| `/gsd:check-todos` | List pending todos |
| `/gsd:help` | Command reference |
| `/gsd:whats-new` | Recent updates |

### Brownfield
| Command | Purpose |
|---------|---------|
| `/gsd:map-codebase` | Analyze existing code |

---

## Design Principles

1. **Atomic Commits** - One commit per task for clear history
2. **Fresh Context** - Each task gets full 200k context
3. **Requirements Traceability** - V1 (must have) vs V2 (should have)
4. **Conversational UAT** - One-by-one verification with auto-diagnosis
5. **Persistent State** - STATE.md never forgets decisions

---

## Getting Started

### New Project (Greenfield)
```bash
/gsd:new-project
```

### Existing Codebase (Brownfield)
```bash
/gsd:map-codebase
/gsd:new-project
```

### Check Progress
```bash
/gsd:progress
```

---

## Related Documentation

- [GSD-README.md](../../GSD-README.md) - User-facing readme
- [TEMPLATE-SCHEMA.md](../../TEMPLATE-SCHEMA.md) - Schema reference
- [MIGRATION.md](../../MIGRATION.md) - Breaking changes

---

**Documentation Version:** 1.0
**Last Updated:** 2026-01-18
