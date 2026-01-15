# Planning with Files - Windsurf Workflows

This directory contains Windsurf IDE workflow files for the Planning with Files methodology.

## What is Planning with Files?

Planning with Files implements Manus-style file-based planning for complex tasks using persistent markdown files as "working memory on disk."

## Installation

When you run `aiw init --method planning-with-files --ide windsurf`, this `.windsurf` folder will be copied to your project directory, making workflows available in Windsurf IDE.

```bash
# Install Planning with Files for Windsurf
aiw init --method planning-with-files --ide windsurf

# Or install for both Claude Code and Windsurf
aiw init --method planning-with-files --ide claude --ide windsurf
```

## Usage in Windsurf

Once installed, you can invoke the planning workflow in Windsurf Cascade by using:

```
/planning-with-files
```

## How It Works

The workflow loads the full Planning with Files methodology from the `.claude/skills/planning-with-files/SKILL.md` file, which implements the Manus context engineering pattern:

### The 3-File Pattern

The workflow uses three persistent markdown files in the `_planning-with-files-output/` folder:

```
_planning-with-files-output/
├── task_plan.md      → Track phases and progress
├── findings.md       → Store research and findings
└── progress.md       → Session log and test results
```

### Core Principles

From the [Manus context engineering blog post](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus):

> "Markdown is my 'working memory' on disk. Since I process information iteratively and my active context has limits, Markdown files serve as scratch pads for notes, checkpoints for progress, building blocks for final deliverables."

### The 4 Key Rules

1. **Create Plan First** - Never start without `_planning-with-files-output/task_plan.md`
2. **The 2-Action Rule** - Save findings after every 2 view/browser operations
3. **Read Before Decide** - Re-read plan before major decisions
4. **Update After Act** - Mark phases complete and log errors

## When to Use

**Use Planning with Files for:**
- Multi-step tasks (3+ steps)
- Research tasks
- Building/creating projects
- Tasks spanning many tool calls

**Skip for:**
- Simple questions
- Single-file edits
- Quick lookups

## File Structure

```
.windsurf/
└── workflows/
    └── planning-with-files.md    # Main workflow
```

## Differences from Claude Code

While the content is identical, the format differs:
- **Claude Code**: Uses `.claude/skills/planning-with-files/SKILL.md` with hook system
- **Windsurf**: Uses `.windsurf/workflows/planning-with-files.md` with Cascade workflow system

Both reference the same skill definition, ensuring consistency across IDEs.

## More Information

- **Full Documentation**: See `.claude/skills/planning-with-files/` after installation
- **Original Plugin**: [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files)
- **Manus AI**: [Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- **Windsurf Workflows**: https://docs.windsurf.com/windsurf/cascade/workflows
- **AIW CLI**: https://github.com/jofu-tofu/AI-Workflow-CLI
