# BMAD Windsurf Workflows

This directory contains Windsurf IDE workflow files automatically generated from BMAD Claude Code commands.

## What Are These Workflows?

These workflows enable you to use BMAD (Building Modern Applications with Discipline) commands directly in Windsurf IDE using the Cascade AI. Each workflow corresponds to a BMAD agent or workflow that helps with software development tasks.

## Installation

When you run `aiw init --method bmad --ide windsurf`, this `.windsurf` folder will be copied to your project directory, making all workflows available in Windsurf IDE.

```bash
# Install BMAD with Windsurf workflows
aiw init --method bmad --ide windsurf

# Or install for both Claude Code and Windsurf
aiw init --method bmad --ide claude --ide windsurf
```

## Usage in Windsurf

Once installed, you can invoke workflows in Windsurf Cascade by using slash commands:

```
/analyst                    - Load Business Analyst agent
/architect                  - Load Software Architect agent
/dev                        - Load Developer agent
/pm                         - Load Product Manager agent
/code-review                - Perform adversarial code review
/create-product-brief       - Create comprehensive product brief
/create-architecture        - Design system architecture
/dev-story                  - Develop a user story
/sprint-planning            - Plan sprint activities
... and many more!
```

## Workflow Categories

### Agents (`bmm/agents/`)
Agent personas that guide Cascade through specific roles:
- `analyst.md` - Business Analyst
- `architect.md` - Software Architect
- `dev.md` - Developer
- `pm.md` - Product Manager
- `sm.md` - Scrum Master
- `tea.md` - Test Engineering Architect
- `tech-writer.md` - Technical Writer
- `ux-designer.md` - UX Designer
- `quick-flow-solo-dev.md` - Solo Developer (quick flow)

### Workflows (`bmm/workflows/`)
Step-by-step processes for development tasks:

**Analysis & Planning:**
- `create-product-brief.md` - Product discovery
- `create-prd.md` - Product requirements
- `research.md` - Market/technical research

**Design:**
- `create-architecture.md` - System architecture
- `create-ux-design.md` - UX specifications
- `create-tech-spec.md` - Technical specifications
- `create-excalidraw-*` - Diagrams (dataflow, flowchart, wireframe)

**Implementation:**
- `create-epics-and-stories.md` - Story creation
- `dev-story.md` - Story development
- `code-review.md` - Code review
- `sprint-planning.md` - Sprint planning
- `sprint-status.md` - Sprint status tracking

**Testing:**
- `testarch-*` - Test architecture workflows

**Documentation:**
- `document-project.md` - Project documentation
- `generate-project-context.md` - Context generation

### Core Workflows (`core/workflows/`)
- `brainstorming.md` - Brainstorming sessions
- `party-mode.md` - Fun collaborative mode

### Core Tasks (`core/tasks/`)
- `index-docs.md` - Documentation indexing

## How Workflows Work

Each workflow file contains:
1. **Frontmatter** - Metadata including description and execution mode
2. **Instructions** - Steps for Cascade to follow
3. **References** - Links to detailed workflow files in `_bmad/` directory

Workflows load their full instructions from the `_bmad/` directory structure, which contains the complete BMAD methodology and templates.

## Regenerating Workflows

If the Claude commands are updated, regenerate Windsurf workflows by running:

```bash
bun run scripts/convert-bmad-to-windsurf.ts
```

This script automatically converts all `.claude/commands/bmad/` files to `.windsurf/workflows/bmad/` format.

## File Structure

```
.windsurf/
└── workflows/
    └── bmad/
        ├── bmm/
        │   ├── agents/          # Agent personas
        │   └── workflows/       # Development workflows
        └── core/
            ├── agents/          # Core agent personas
            ├── tasks/           # Utility tasks
            └── workflows/       # Core workflows
```

## Differences from Claude Code Commands

While the content is identical, the format differs:
- **Claude Code**: Uses `.claude/commands/` directory with custom command system
- **Windsurf**: Uses `.windsurf/workflows/` directory with Cascade workflow system

Both reference the same `_bmad/` workflow definitions, ensuring consistency across IDEs.

## More Information

- **BMAD Documentation**: See `_bmad/` directory after installation
- **Windsurf Workflows**: https://docs.windsurf.com/windsurf/cascade/workflows
- **AIW CLI**: https://github.com/jofu-tofu/AI-Workflow-CLI
