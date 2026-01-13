# GSD Template Schema Documentation

## Overview

The Get Shit Done (GSD) template is a structured workflow system for AI-assisted development. This document explains the template structure, how it works, and conventions for documentation.

## Directory Structure

```
packages/cli/src/templates/gsd/
├── README.md                        # Main template overview
├── TEMPLATE-SCHEMA.md              # This file - schema documentation
├── AIWCLI-README.md                # AI Workflow CLI repository README
├── _gsd/                           # Core template files (copied to user projects)
│   ├── templates/                  # Document templates with {{placeholders}}
│   │   ├── PROJECT.md.template     # Project vision template
│   │   ├── ROADMAP.md.template     # Phase roadmap template
│   │   ├── STATE.md.template       # Persistent state tracking template
│   │   ├── PLAN.md.template        # Phase plan template (XML tasks)
│   │   ├── SUMMARY.md.template     # Change summary template
│   │   └── ISSUES.md.template      # Deferred issues template
│   └── workflows/                  # Workflow method definitions
│       ├── new-project.md
│       ├── create-roadmap.md
│       ├── plan-phase.md
│       ├── execute-plan.md
│       ├── verify-work.md
│       ├── plan-fix.md
│       ├── progress.md
│       ├── pause-work.md
│       ├── resume-work.md
│       ├── map-codebase.md
│       ├── add-phase.md
│       ├── insert-phase.md
│       └── complete-milestone.md
├── .claude/                        # Claude Code integration
│   └── commands/
│       └── gsd/                    # Slash commands for Claude IDE
│           ├── new-project.md
│           ├── create-roadmap.md
│           └── ... (all workflows)
└── .windsurf/                      # Windsurf IDE integration
    └── workflows/
        └── gsd/                    # Workflows for Windsurf
            ├── new-project.md
            ├── create-roadmap.md
            └── ... (all workflows)
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
  - `{{TASK_COUNT}}` - Number of tasks in a plan

### 2. Workflows (`_gsd/workflows/`)

Workflow files define step-by-step processes for AI agents to follow. Each workflow is a markdown file with a specific structure.

**Workflow File Structure:**
```markdown
# GSD Workflow: [Workflow Name]

## Purpose

Brief description of what this workflow achieves.

## Process

### Step 1: [Step Name]

Detailed instructions for the first step.

### Step 2: [Step Name]

Detailed instructions for the second step.

## Next Steps

What the user should do after this workflow completes.

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2
```

### 3. IDE Integrations

**Claude Code (`.claude/commands/gsd/`):**
- Commands invoked as `/gsd:command-name`
- Files mirror the workflow files in `_gsd/workflows/`

**Windsurf (`.windsurf/workflows/gsd/`):**
- Workflows accessible through Windsurf IDE
- Files mirror the workflow files in `_gsd/workflows/`

## Method-Specific README Convention

Every workflow method has a corresponding README file named `{METHOD-NAME}-README.md` that provides:

1. **Purpose** - What this method does and when to use it
2. **Prerequisites** - What must be done before running this method
3. **Execution Order** - Step-by-step user flow
4. **Generated Files** - What files are created/modified
5. **Next Steps** - What to do after completion
6. **Examples** - Sample usage and outputs

**Naming Convention:**
- Workflow file: `new-project.md`
- README file: `NEW-PROJECT-README.md`

**Location:**
All method READMEs are stored in: `packages/cli/src/templates/gsd/methods/`

## Workflow Methods

### Greenfield Projects (New Projects)

1. **new-project** - Extract project ideas, create PROJECT.md
2. **create-roadmap** - Break project into phases with deliverables
3. **plan-phase** - Create atomic task plans (max 3 tasks) for a phase
4. **execute-plan** - Run tasks in fresh subagent contexts
5. **verify-work** - User acceptance testing for completed work
6. **plan-fix** - Address UAT issues with targeted fixes
7. **progress** - Show current position and next steps

### Brownfield Projects (Existing Codebases)

1. **map-codebase** - Analyze existing code, create CODEBASE.md
2. **new-project** - Create project documentation
3. Follow greenfield flow from step 2 onwards

### Context Management

1. **pause-work** - Create handoff documentation (HANDOFF.md)
2. **resume-work** - Restore context from HANDOFF.md

### Roadmap Management

1. **add-phase** - Append new phases to end of roadmap
2. **insert-phase** - Inject urgent work between existing phases

### Milestone Completion

1. **complete-milestone** - Archive project state, tag release, prepare for v2+

## How Templates Are Used

### Installation
When a user runs `aiw init --method gsd --ide claude`, the CLI:

1. Copies `_gsd/` directory to user's project root
2. Copies `.claude/commands/gsd/` to user's project `.claude/` directory
3. Preserves existing files, only adds new ones

### Template Instantiation
Workflows instantiate templates by:

1. Reading template file from `_gsd/templates/`
2. Replacing `{{PLACEHOLDERS}}` with actual values
3. Writing the result to project root (e.g., `PROJECT.md`)

**Example:**
```javascript
// Pseudocode for template instantiation
const template = readFile('_gsd/templates/PROJECT.md.template')
const content = template
  .replace('{{PROJECT_NAME}}', projectName)
  .replace('{{DATE}}', getCurrentDate())
  .replace('{{VISION}}', userVision)
writeFile('PROJECT.md', content)
```

## XML Task Format

Plans use XML-structured tasks for clarity and parseability:

```xml
<task>
  <objective>
    Clear, measurable goal for this task
  </objective>

  <action>
    Specific implementation steps with file paths and exact changes
  </action>

  <verification>
    How to verify success: tests, behaviors, outputs to check
  </verification>

  <rollback>
    How to undo: git commands, files to restore, cleanup steps
  </rollback>
</task>
```

**Why XML?**
- Clear structure for AI parsing
- Easy to extract sections programmatically
- Self-documenting format
- Enforces complete task specifications

## State Management

### Persistent Files
These files track project state across sessions:

- **PROJECT.md** - Never changes (project vision)
- **ROADMAP.md** - Updated as phases complete
- **STATE.md** - Continuously updated (decisions, blockers, progress)
- **PLAN-phase-{N}.md** - Created per phase, archived after completion
- **SUMMARY.md** - Append-only commit history
- **ISSUES.md** - Deferred enhancements, tracked for future work

### Handoff Files
Created for context switching:

- **HANDOFF.md** - Created by `pause-work`, consumed by `resume-work`
- **CODEBASE.md** - Created by `map-codebase` for brownfield projects

### Archive Files
Created at milestones:

- **MILESTONE-{version}.md** - Project snapshot at release
- **archive/v{version}/** - Complete state archive for version

## Best Practices

### For Template Authors

1. **Keep templates simple** - Minimal placeholders, clear structure
2. **Document all placeholders** - Explain what each variable means
3. **Provide examples** - Include sample outputs in comments
4. **Version templates** - Track changes to template structure

### For Workflow Authors

1. **Be explicit** - Clear, step-by-step instructions
2. **Include success criteria** - Checklist for completion
3. **Recommend next steps** - Guide user journey
4. **Handle edge cases** - What to do if files already exist

### For Method README Authors

1. **User-focused** - Write for developers using the method
2. **Linear flow** - Step 1, 2, 3 execution order
3. **Show examples** - Sample commands, outputs, file contents
4. **Link to related methods** - Create a connected workflow

## Extension Guidelines

### Adding a New Workflow Method

1. Create workflow file: `_gsd/workflows/{method-name}.md`
2. Create method README: `methods/{METHOD-NAME}-README.md`
3. Mirror to `.claude/commands/gsd/{method-name}.md`
4. Mirror to `.windsurf/workflows/gsd/{method-name}.md`
5. Update main `README.md` with new method
6. Test the full workflow
7. Document in this schema file

### Creating a New Template

1. Add template file: `_gsd/templates/{NAME}.md.template`
2. Document placeholders in schema
3. Create workflow that uses the template
4. Add example output to method README

## Troubleshooting

### Common Issues

**Problem:** Template placeholders not replaced
- **Solution:** Verify placeholder names match exactly (case-sensitive)

**Problem:** Workflow file not found
- **Solution:** Check file is in all three locations (_gsd, .claude, .windsurf)

**Problem:** Method doesn't appear in IDE
- **Solution:** Restart IDE after running `aiw init`

**Problem:** State files not updating
- **Solution:** Verify workflows are writing to project root, not template directory

## Related Documentation

- **README.md** - User-facing template overview
- **AIWCLI-README.md** - AI Workflow CLI repository information
- **methods/{METHOD-NAME}-README.md** - Individual workflow documentation
- **DEVELOPMENT.md** - Developer setup guide (in repository root)

## Version History

- **2026-01-12** - Initial schema documentation created
- Template system established with XML task format
- Method README convention established

---

**Maintained by:** AI Workflow CLI Contributors
**Repository:** https://github.com/jofu-tofu/AI-Workflow-CLI
