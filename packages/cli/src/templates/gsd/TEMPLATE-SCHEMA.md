# GSD Template Schema Documentation

## Overview

The Get Shit Done (GSD) template is a structured workflow system for AI-assisted development. This document explains the template structure, how it works, and conventions for documentation.

## Directory Structure

```
packages/cli/src/templates/gsd/
├── GSD-README.md                        # Main template overview
├── TEMPLATE-SCHEMA.md                   # This file - schema documentation
├── MIGRATION.md                         # Breaking changes and migration guide
├── .gitignore                           # Ignores .planning/ directory
├── _gsd/                                # Core template files (copied to user projects)
│   ├── templates/                       # Document templates with {{placeholders}}
│   │   ├── PROJECT.md.template          # Project vision template
│   │   ├── REQUIREMENTS.md.template     # V1/V2 requirements template
│   │   ├── ROADMAP.md.template          # Phase roadmap template
│   │   ├── CONTEXT.md.template          # Discussion decisions template
│   │   ├── RESEARCH.md.template         # Research findings template
│   │   ├── STATE.md.template            # Persistent state tracking template
│   │   ├── PLAN.md.template             # Phase plan template (XML tasks)
│   │   ├── SUMMARY.md.template          # Change summary template
│   │   └── ISSUES.md.template           # Deferred issues template
│   └── workflows/                       # Workflow method definitions
│       ├── new-project.md               # Core: Unified project + roadmap
│       ├── discuss-phase.md             # Core: Pre-planning decisions
│       ├── plan-phase.md                # Core: Task planning with waves
│       ├── execute-phase.md             # Core: Wave-based execution
│       ├── verify-work.md               # Core: Conversational UAT
│       ├── research-phase.md            # Utility: Standalone research
│       ├── list-phase-assumptions.md    # Utility: View assumptions
│       ├── remove-phase.md              # Utility: Remove and renumber
│       ├── new-milestone.md             # Utility: Start next version
│       ├── debug.md                     # Utility: Systematic debugging
│       ├── add-todo.md                  # Utility: Capture ideas
│       ├── check-todos.md               # Utility: List pending
│       ├── help.md                      # Utility: Command reference
│       ├── whats-new.md                 # Utility: Version updates
│       ├── progress.md                  # Context: Show position
│       ├── pause-work.md                # Context: Create handoff
│       ├── resume-work.md               # Context: Restore from handoff
│       ├── map-codebase.md              # Brownfield: Analyze code
│       ├── add-phase.md                 # Roadmap: Append phase
│       ├── insert-phase.md              # Roadmap: Insert phase
│       └── complete-milestone.md        # Milestone: Archive version
├── .claude/                             # Claude Code integration
│   └── commands/
│       └── gsd/                         # Slash commands for Claude IDE
│           └── *.md                     # One file per command
└── .windsurf/                           # Windsurf IDE integration
    └── workflows/
        └── gsd/                         # Workflows for Windsurf
            └── *.md                     # One file per workflow
```

## Template Components

### 1. Templates (`_gsd/templates/`)

Template files use the `.template` extension and contain placeholder variables in the format `{{VARIABLE_NAME}}`.

**Example from PROJECT.md.template:**
```markdown
# {{PROJECT_NAME}}

**Created:** {{DATE}}

## Vision

{{VISION}}
```

**Placeholder Conventions:**
- Use UPPERCASE_WITH_UNDERSCORES for variable names
- Common placeholders:
  - `{{PROJECT_NAME}}` - Name of the project
  - `{{DATE}}` - Current date (YYYY-MM-DD format)
  - `{{VERSION}}` - Version number (for milestones)
  - `{{PHASE_NUMBER}}` - Phase number in roadmap
  - `{{PHASE_NAME}}` - Phase name from roadmap

### 2. Templates List

| Template | Purpose | Key Placeholders |
|----------|---------|------------------|
| PROJECT.md.template | Project vision and goals | PROJECT_NAME, DATE |
| REQUIREMENTS.md.template | V1/V2 requirements | PROJECT_NAME, PHASE_NUMBER |
| ROADMAP.md.template | Phase breakdown | PROJECT_NAME, DATE |
| CONTEXT.md.template | Discussion decisions | PROJECT_NAME, PHASE_NUMBER, PHASE_NAME |
| RESEARCH.md.template | Research findings | PROJECT_NAME, PHASE_NUMBER, PHASE_NAME |
| STATE.md.template | Project state tracking | PROJECT_NAME, DATE |
| PLAN.md.template | Phase execution plan | PHASE_NUMBER, PHASE_NAME, DATE |
| SUMMARY.md.template | Change history | PROJECT_NAME, DATE |
| ISSUES.md.template | Deferred enhancements | PROJECT_NAME, DATE |

### 3. Workflows (`_gsd/workflows/`)

Workflow files define step-by-step processes for AI agents to follow.

**Workflow File Structure:**
```markdown
# GSD Workflow: [Workflow Name]

## Purpose

Brief description of what this workflow achieves.

## Prerequisites

What must exist before running this workflow.

## Process

### Step 1: [Step Name]

Detailed instructions for the first step.

### Step 2: [Step Name]

Detailed instructions for the second step.

## Output Files

What files are created or modified.

## Next Steps

What the user should do after this workflow completes.

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2
```

### 4. IDE Integrations

**Claude Code (`.claude/commands/gsd/`):**
- Commands invoked as `/gsd:command-name`
- YAML frontmatter with description
- Directive to load full workflow from `_gsd/workflows/`

**Windsurf (`.windsurf/workflows/gsd/`):**
- Workflows accessible through Windsurf IDE
- Quick reference with link to full workflow

## Workflow Organization

### Core Loop (5 Commands)
| Workflow | Purpose |
|----------|---------|
| new-project | Unified discovery, requirements, and roadmap |
| discuss-phase | Pre-planning decision capture |
| plan-phase | Task planning with wave groupings |
| execute-phase | Wave-based parallel execution |
| verify-work | Conversational UAT with auto-diagnosis |

### Utility Commands (9)
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

### Roadmap Management (2)
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

## Output Directory Structure

All GSD outputs go to `.planning/`:

```
.planning/
├── PROJECT.md                  # Project vision
├── REQUIREMENTS.md             # V1/V2 requirements
├── ROADMAP.md                  # Phase breakdown
├── CONTEXT.md                  # Discussion decisions
├── RESEARCH.md                 # Research findings
├── STATE.md                    # Current status
├── PLAN-phase-{N}.md          # Phase plans
├── VERIFICATION-phase-{N}.md  # UAT reports
├── PLAN-fix-phase-{N}.md      # Fix plans (if issues)
├── SUMMARY.md                  # Commit history
├── ISSUES.md                   # Deferred items
├── CODEBASE.md                # Brownfield analysis
├── HANDOFF.md                 # Context for resume
├── MILESTONE-{version}.md     # Milestone summaries
├── todos/                     # Captured ideas
│   └── {date}-{title}.md
└── archive/                   # Milestone archives
    └── v{version}/
```

## XML Task Format

Plans use XML-structured tasks:

```xml
<task id="1" wave="1">
  <title>Clear, actionable title</title>

  <objective>
    What this task accomplishes in one sentence.
  </objective>

  <requirements>
    - V1-F01: Requirement text
    - V1-N01: Requirement text
  </requirements>

  <action>
    Specific, concrete steps:
    1. File: path/to/file.ts
       Change: What to modify
    2. File: path/to/file.ts
       Change: What to modify
  </action>

  <decisions>
    Decisions from CONTEXT.md that apply:
    - Decision 1
    - Decision 2
  </decisions>

  <verification>
    - [ ] Specific test to run
    - [ ] Behavior to check
    - [ ] Output to validate
  </verification>

  <rollback>
    git revert HEAD
  </rollback>

  <acceptance_criteria>
    - [ ] Testable criterion 1
    - [ ] Testable criterion 2
  </acceptance_criteria>
</task>
```

**Why XML?**
- Clear structure for AI parsing
- Easy to extract sections programmatically
- Self-documenting format
- Enforces complete task specifications
- Supports wave attribute for parallel execution

## Installation

When a user runs `aiw init --method gsd --ide claude`, the CLI:

1. Copies `_gsd/` directory to user's project root
2. Copies `.claude/commands/gsd/` to user's `.claude/` directory
3. Creates `.planning/` directory structure
4. Preserves existing files, only adds new ones

## Extension Guidelines

### Adding a New Workflow

1. Create workflow file: `_gsd/workflows/{method-name}.md`
2. Mirror to `.claude/commands/gsd/{method-name}.md`
3. Mirror to `.windsurf/workflows/gsd/{method-name}.md`
4. Update `GSD-README.md` with new command
5. Update this schema file
6. Test the full workflow

### Creating a New Template

1. Add template file: `_gsd/templates/{NAME}.md.template`
2. Document placeholders in schema
3. Create workflow that uses the template
4. Update `GSD-README.md`

## Version History

- **2.0.0** - 5-core loop architecture
  - Output directory: `.planning/`
  - Unified new-project (merged create-roadmap)
  - New discuss-phase workflow
  - Wave-based execute-phase
  - Conversational verify-work (absorbs plan-fix)
  - 9 new utility commands
  - 3 new templates (REQUIREMENTS, CONTEXT, RESEARCH)

- **1.0.0** - Initial release
  - Output directory: `_GSD_OUTPUT/`
  - 13 separate workflows
  - 6 templates

---

**Maintained by:** AI Workflow CLI Contributors
**Repository:** https://github.com/jofu-tofu/AI-Workflow-CLI
