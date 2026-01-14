# Planning with Files - Template Adaptation

This is an adapted version of the [Planning with Files](https://github.com/OthmanAdi/planning-with-files) Claude Code plugin, reorganized to fit the AI Workflow CLI template structure.

## What Changed

This adaptation reorganizes the original plugin structure into a `.claude` folder-based template:

### Original Structure
```
planning-with-files/
├── .claude-plugin/          # Plugin manifest
├── planning-with-files/     # Plugin skill folder
├── skills/                  # Legacy skill folder
├── scripts/                 # Root-level scripts
└── templates/               # Root-level templates
```

### Adapted Structure
```
planning-with-files-adaptation/
├── .claude/
│   └── skills/
│       └── planning-with-files/
│           ├── SKILL.md
│           ├── examples.md
│           ├── reference.md
│           ├── templates/
│           │   ├── task_plan.md
│           │   ├── findings.md
│           │   └── progress.md
│           └── scripts/     # Hook scripts
│               ├── init-session.sh
│               └── check-complete.sh
├── _planning-with-files-output/   # Output folder for planning files
│   ├── task_plan.md
│   ├── findings.md
│   └── progress.md
└── README.md (this file)
```

## How It Works

### Hooks Configuration

The `.claude/skills/planning-with-files/SKILL.md` file configures four hooks that implement the Manus-style workflow:

1. **SessionStart** - Announces the skill is ready when you start Claude Code
2. **PreToolUse** - Reads `_planning-with-files-output/task_plan.md` before Write/Edit/Bash operations to keep goals fresh in context
3. **PostToolUse** - Reminds you to update phase status after file modifications
4. **Stop** - Verifies all phases are complete before allowing Claude to stop

### The 3-File Pattern

This template implements the Manus workflow pattern using three persistent markdown files in the `_planning-with-files-output/` folder:

```
_planning-with-files-output/
├── task_plan.md      → Track phases and progress
├── findings.md       → Store research and findings
└── progress.md       → Session log and test results
```

### Hook Scripts

- **init-session.sh** - Creates the three planning files in `_planning-with-files-output/` from templates (can be run manually)
- **check-complete.sh** - Validates all phases in `_planning-with-files-output/task_plan.md` are marked complete (runs on Stop hook)

## Usage

### As a Template

When using this as a template for new projects:

1. Copy the `.claude` folder and `_planning-with-files-output/` folder to your project root
2. The hooks will automatically activate when you start Claude Code in that directory
3. Claude will create planning files in `_planning-with-files-output/` for complex tasks

### Manual Initialization

You can manually create planning files by running:

```bash
bash .claude/skills/planning-with-files/scripts/init-session.sh
```

### Invoking the Skill

The skill can be invoked with:

```bash
/planning-with-files
```

## Core Principles

From the [Manus context engineering blog post](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus):

> "Markdown is my 'working memory' on disk. Since I process information iteratively and my active context has limits, Markdown files serve as scratch pads for notes, checkpoints for progress, building blocks for final deliverables."

### The 4 Key Rules

1. **Create Plan First** - Never start without `_planning-with-files-output/task_plan.md`
2. **The 2-Action Rule** - Save findings after every 2 view/browser operations
3. **Read Before Decide** - Re-read plan before major decisions
4. **Update After Act** - Mark phases complete and log errors

## Differences from Original

### What's the Same
- All three markdown file templates (task_plan, findings, progress)
- Both hook scripts (init-session, check-complete)
- The core workflow and principles
- All skill documentation (SKILL.md, examples.md, reference.md)

### What's Different
- Uses `.claude/skills/planning-with-files/SKILL.md` instead of `.claude-plugin/plugin.json`
- Scripts referenced as `.claude/skills/planning-with-files/scripts/*` instead of `${CLAUDE_PLUGIN_ROOT}/scripts/*`
- Planning files created in `_planning-with-files-output/` folder (follows `_{template-name}-output` convention)
- No plugin marketplace integration (template-based instead)
- Skills folder nested inside `.claude/` for cleaner organization

## When to Use

**Use this pattern for:**
- Multi-step tasks (3+ steps)
- Research tasks
- Building/creating projects
- Tasks spanning many tool calls

**Skip for:**
- Simple questions
- Single-file edits
- Quick lookups

## Credits

- **Original Plugin:** [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files)
- **Manus AI:** For pioneering the context engineering patterns
- **Based on:** [Context Engineering for AI Agents](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)

## License

MIT License (inherited from original)
