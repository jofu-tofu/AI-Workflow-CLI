# GSD File Reference

Complete reference for all files created and managed by the GSD system.

---

## Output Directory

All GSD outputs are stored in:

```
_output/gsd/.planning/
```

This directory is gitignored by default to keep planning artifacts separate from source code.

---

## File Overview

| File | Created By | Purpose |
|------|------------|---------|
| `PROJECT.md` | `new-project` | Vision, goals, success criteria |
| `REQUIREMENTS.md` | `new-project` | V1/V2 requirements with traceability |
| `ROADMAP.md` | `new-project` | Phase sequence and status |
| `STATE.md` | `new-project` | Decisions, blockers, progress |
| `CONTEXT.md` | `discuss-phase` | Pre-planning decisions |
| `RESEARCH.md` | `research-phase` | Research findings |
| `PLAN-phase-{N}.md` | `plan-phase` | XML task specifications |
| `VERIFICATION-phase-{N}.md` | `verify-work` | UAT reports |
| `SUMMARY.md` | `execute-phase` | Commit history |
| `ISSUES.md` | Various | Deferred enhancements |
| `CODEBASE.md` | `map-codebase` | Brownfield analysis |
| `HANDOFF.md` | `pause-work` | Resumption documentation |
| `MILESTONE-{version}.md` | `complete-milestone` | Version archive |

---

## Detailed File Descriptions

### PROJECT.md

**Created by:** `/gsd:new-project`

**Purpose:** Captures the project vision and high-level goals.

**Contents:**
- Project name and description
- Vision statement
- Goals (what success looks like)
- Success criteria (measurable outcomes)
- Constraints and assumptions
- Out of scope items

**Example Structure:**
```markdown
# Project: Docker CLI Tool

## Vision
A simple CLI for managing Docker containers.

## Goals
1. List running containers
2. Start/stop containers by name
3. View container logs

## Success Criteria
- [ ] Can list containers in < 1 second
- [ ] Works on Linux, macOS, Windows
```

---

### REQUIREMENTS.md

**Created by:** `/gsd:new-project`

**Purpose:** Structured requirements with unique IDs for traceability.

**Requirement Categories:**
- **V1 (Must Have):** Core functionality required for MVP
- **V2 (Should Have):** Important but not blocking

**Requirement Types:**
- **F** - Functional (features)
- **N** - Non-functional (performance, security, etc.)

**Example Structure:**
```markdown
# Requirements

## V1 - Must Have

### Functional
- [V1-F01] List all running containers
- [V1-F02] Start container by name
- [V1-F03] Stop container by name

### Non-Functional
- [V1-N01] Response time < 1 second
- [V1-N02] Works offline

## V2 - Should Have

### Functional
- [V2-F01] Container health monitoring
- [V2-F02] Log streaming
```

---

### ROADMAP.md

**Created by:** `/gsd:new-project`

**Purpose:** Phase-based execution plan with status tracking.

**Example Structure:**
```markdown
# Roadmap

## Phase 1: Project Setup
**Status:** ✅ Complete
**Requirements:** V1-F01, V1-N01

## Phase 2: Core Commands
**Status:** 🔄 In Progress
**Requirements:** V1-F02, V1-F03

## Phase 3: Error Handling
**Status:** ⏳ Pending
**Requirements:** V1-N02
```

---

### STATE.md

**Created by:** `/gsd:new-project`

**Purpose:** Persistent state tracking across sessions.

**Contents:**
- Current phase and task
- Key decisions made
- Active blockers
- Progress metrics
- Session notes

**Example Structure:**
```markdown
# State

## Current Position
- **Phase:** 2
- **Task:** 1 of 3
- **Wave:** 1

## Decisions
- Using Commander.js for CLI parsing (Phase 1)
- JSON output format for machine readability (Phase 2)

## Blockers
- None currently

## Progress
- Phase 1: 100%
- Phase 2: 33%
- Overall: 45%
```

---

### CONTEXT.md

**Created by:** `/gsd:discuss-phase`

**Purpose:** Captures pre-planning decisions for a phase.

**Decision Categories:**
- Visual/UI decisions
- API/Data decisions
- Content/Copy decisions
- Organization decisions
- Assumptions

**Example Structure:**
```markdown
# Phase 2 Context

## Decisions

### API/Data
- Use Docker SDK directly, not CLI wrapper
- Return JSON for all commands

### Organization
- One file per command
- Shared utilities in lib/

## Assumptions
- Docker daemon is running
- User has Docker permissions
```

---

### RESEARCH.md

**Created by:** `/gsd:research-phase`

**Purpose:** Captures research findings for informed planning.

**Example Structure:**
```markdown
# Research: Docker Integration

## Findings

### Docker SDK Options
1. **dockerode** - Most popular, Node.js native
2. **docker-api** - Lightweight alternative

### Recommendation
Use dockerode for better community support.

## References
- https://github.com/apocas/dockerode
```

---

### PLAN-phase-{N}.md

**Created by:** `/gsd:plan-phase`

**Purpose:** XML-structured atomic task specifications.

**Key Elements:**
- Maximum 3 tasks per plan
- Wave groupings for parallel execution
- Requirements traceability
- Verification steps
- Rollback procedures

**Example Structure:**
```markdown
# Plan: Phase 2

## Tasks

<task id="1" wave="1">
  <objective>Create list command</objective>
  <requirements>V1-F01</requirements>
  <action>
    1. Create src/commands/list.ts
    2. Implement container listing
    3. Add JSON output support
  </action>
  <verification>
    - Command runs without error
    - Output is valid JSON
  </verification>
  <rollback>
    - rm src/commands/list.ts
  </rollback>
</task>

<task id="2" wave="1">
  <objective>Create start command</objective>
  <requirements>V1-F02</requirements>
  ...
</task>
```

---

### VERIFICATION-phase-{N}.md

**Created by:** `/gsd:verify-work`

**Purpose:** UAT report with pass/fail status.

**Example Structure:**
```markdown
# Verification: Phase 2

## Automated Checks
- [x] Tests pass
- [x] Linting pass
- [x] Build succeeds

## Manual Verification
- [x] List command shows running containers
- [x] Output is valid JSON
- [ ] Start command works (FAILED)

## Issues Found
1. Start command missing error handling

## Next Steps
- Fix start command error handling
```

---

### SUMMARY.md

**Created by:** `/gsd:execute-phase`

**Purpose:** Commit history and change log.

**Example Structure:**
```markdown
# Summary

## Phase 2 Commits

### Task 1: Create list command
**Commit:** abc1234
**Files:**
- src/commands/list.ts (created)
- src/lib/docker.ts (modified)

### Task 2: Create start command
**Commit:** def5678
**Files:**
- src/commands/start.ts (created)
```

---

### ISSUES.md

**Created by:** Various commands

**Purpose:** Track deferred enhancements and known issues.

**Example Structure:**
```markdown
# Issues

## Deferred Enhancements
- [ ] Add container health monitoring (V2-F01)
- [ ] Implement log streaming (V2-F02)

## Known Issues
- Performance degrades with > 100 containers
```

---

### CODEBASE.md

**Created by:** `/gsd:map-codebase`

**Purpose:** Analysis of existing codebase for brownfield projects.

**Contents:**
- Technology stack
- Architecture patterns
- Pain points
- Technical debt
- SWOT analysis

---

### HANDOFF.md

**Created by:** `/gsd:pause-work`

**Purpose:** Context for resuming work later.

**Contents:**
- Current state summary
- Next steps
- Active blockers
- Mental model
- Environment setup
- Resumption checklist

---

### MILESTONE-{version}.md

**Created by:** `/gsd:complete-milestone`

**Purpose:** Archive of completed milestone.

**Contents:**
- Version summary
- Completed requirements
- Known issues
- Release notes

---

## File Relationships

```
PROJECT.md ─────────────────────────────────────┐
     │                                          │
     ▼                                          │
REQUIREMENTS.md ──► ROADMAP.md ──► STATE.md ◄──┤
     │                   │             │        │
     │                   ▼             │        │
     │            CONTEXT.md           │        │
     │                   │             │        │
     ▼                   ▼             │        │
PLAN-phase-{N}.md ◄─────┘             │        │
     │                                 │        │
     ▼                                 │        │
SUMMARY.md ────────────────────────────┘        │
     │                                          │
     ▼                                          │
VERIFICATION-phase-{N}.md ──────────────────────┘
```

---

**Next:** [Templates](./templates.md) | [Workflows](./workflows.md)
