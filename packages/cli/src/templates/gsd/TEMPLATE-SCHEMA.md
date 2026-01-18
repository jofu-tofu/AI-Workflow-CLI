# GSD Template Schema

## Directory Structure

```
packages/cli/src/templates/gsd/
├── _gsd/                    # Core files (copied to projects)
│   ├── templates/*.template # Document templates with {{PLACEHOLDERS}}
│   └── workflows/*.md       # Workflow definitions
├── .claude/commands/gsd/    # Claude Code slash commands
├── .windsurf/workflows/gsd/ # Windsurf workflows
├── .gitignore               # Ignores _output/gsd/.planning/
├── GSD-README.md            # User documentation
├── TEMPLATE-SCHEMA.md       # This file
└── MIGRATION.md             # Breaking changes guide
```

---

## Templates (`_gsd/templates/`)

Use `.template` extension with `{{VARIABLE_NAME}}` placeholders.

| Template | Purpose | Key Placeholders |
|----------|---------|------------------|
| PROJECT.md | Project vision and goals | PROJECT_NAME, DATE |
| REQUIREMENTS.md | V1/V2 requirements | PROJECT_NAME, PHASE_NUMBER |
| ROADMAP.md | Phase breakdown | PROJECT_NAME, DATE |
| CONTEXT.md | Discussion decisions | PROJECT_NAME, PHASE_NUMBER, PHASE_NAME |
| RESEARCH.md | Research findings | PROJECT_NAME, PHASE_NUMBER, PHASE_NAME |
| STATE.md | Project state tracking | PROJECT_NAME, DATE |
| PLAN.md | Phase execution plan | PHASE_NUMBER, PHASE_NAME, DATE |
| SUMMARY.md | Change history | PROJECT_NAME, DATE |
| ISSUES.md | Deferred enhancements | PROJECT_NAME, DATE |

---

## Workflows (`_gsd/workflows/`)

### Core Loop (5)
| Workflow | Purpose |
|----------|---------|
| new-project | Unified discovery, requirements, roadmap |
| discuss-phase | Pre-planning decision capture |
| plan-phase | Task planning with wave groupings |
| execute-phase | Wave-based parallel execution |
| verify-work | Conversational UAT with auto-diagnosis |

### Utility (9)
| Workflow | Purpose |
|----------|---------|
| research-phase | Standalone research |
| list-phase-assumptions | View assumptions |
| remove-phase | Remove and renumber |
| new-milestone | Start next version |
| debug | Systematic debugging |
| add-todo | Capture ideas |
| check-todos | List pending |
| help | Command reference |
| whats-new | Version updates |

### Context Management (3)
| Workflow | Purpose |
|----------|---------|
| progress | Show current position |
| pause-work | Create handoff |
| resume-work | Restore from handoff |

### Roadmap (2)
| Workflow | Purpose |
|----------|---------|
| add-phase | Append new phase |
| insert-phase | Insert urgent phase |

### Brownfield (1)
| Workflow | Purpose |
|----------|---------|
| map-codebase | Analyze existing code |

### Milestone (1)
| Workflow | Purpose |
|----------|---------|
| complete-milestone | Archive version |

**Total: 21 workflows**

---

## Output Structure

All outputs in `_output/gsd/.planning/`:

```
_output/gsd/.planning/
├── PROJECT.md               # Project vision
├── REQUIREMENTS.md          # V1/V2 requirements
├── ROADMAP.md               # Phase breakdown
├── CONTEXT.md               # Discussion decisions
├── RESEARCH.md              # Research findings
├── STATE.md                 # Current status
├── PLAN-phase-{N}.md        # Phase plans
├── VERIFICATION-phase-{N}.md # UAT reports
├── PLAN-fix-phase-{N}.md    # Fix plans
├── SUMMARY.md               # Commit history
├── ISSUES.md                # Deferred items
├── CODEBASE.md              # Brownfield analysis
├── HANDOFF.md               # Context for resume
├── MILESTONE-{version}.md   # Milestone summaries
├── todos/{date}-{title}.md  # Captured ideas
└── archive/v{version}/      # Milestone archives
```

---

## XML Task Format

Plans use XML-structured tasks for parallel execution:

```xml
<task id="1" wave="1">
  <title>Clear, actionable title</title>
  <objective>What this accomplishes.</objective>
  <requirements>
    - V1-F01: Requirement text
  </requirements>
  <action>
    1. File: path/to/file.ts - Change: description
  </action>
  <decisions>
    - Decision from CONTEXT.md
  </decisions>
  <verification>
    - [ ] Test to run
  </verification>
  <rollback>git revert HEAD</rollback>
  <acceptance_criteria>
    - [ ] Testable criterion
  </acceptance_criteria>
</task>
```

---

## IDE Integration

**Claude Code:** Commands at `.claude/commands/gsd/`, invoked as `/gsd:command-name`
**Windsurf:** Workflows at `.windsurf/workflows/gsd/`

Both contain lightweight stubs that load full workflows from `_gsd/workflows/`.

---

## Extension

**New Workflow:**
1. Create `_gsd/workflows/{name}.md`
2. Create stubs in `.claude/commands/gsd/` and `.windsurf/workflows/gsd/`
3. Update GSD-README.md and this schema

**New Template:**
1. Create `_gsd/templates/{NAME}.md.template`
2. Document placeholders in this schema
3. Create workflow that uses it

---

## Version History

| Version | Changes |
|---------|---------|
| 2.0.0 | 5-core loop, `_output/gsd/.planning/`, wave execution, 9 utilities, 3 new templates |
| 1.0.0 | Initial release, `_GSD_OUTPUT/`, 13 workflows, 6 templates |

---

**Repository:** https://github.com/jofu-tofu/AI-Workflow-CLI
