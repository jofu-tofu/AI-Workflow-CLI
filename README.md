# AI Workflow CLI

**Your AI coding assistants, working together.**

[![npm](https://img.shields.io/npm/v/aiwcli.svg)](https://npmjs.org/package/aiwcli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## The Problem

You're using Claude Code. Your teammate uses Windsurf. Someone else is on GitHub Copilot. You've built workflows, agents, and prompts that make you productive—but they're locked to one platform.

Every time you switch tools or collaborate, you start from scratch.

## The Solution

**AIW** lets you write AI workflows once and deploy them everywhere. Define your agents, prompts, and automation in a universal format. AIW handles the translation.

```bash
# Install
npm install -g aiwcli

# Initialize templates in your project
aiw init

# Launch Claude Code with full permissions
aiw launch
```

---

## What AIW Does For You

### 1. Work on Multiple Features Simultaneously

Stop stashing and switching branches. AIW creates isolated worktrees so you can work on multiple features at once, each with its own Claude Code session.

```bash
# Create a new feature branch in an isolated directory
aiw branch feature-auth

# Creates: ../your-project-feature-auth/
# Opens: Claude Code in the new worktree

# Meanwhile, your main branch is untouched
```

When you're done, clean up safely:

```bash
# Removes worktrees without unpushed commits or open PRs
aiw branch --delete --all
```

### 2. Pre-Built AI Development Teams

AIW includes **BMAD** (Build-Measure-Analyze-Deploy)—a complete set of AI agents that work like a development team:

- **Analyst** — Code analysis and metrics
- **Architect** — System design decisions
- **Dev** — Implementation and coding
- **PM** — Project planning and coordination
- **Tech Writer** — Documentation
- **UX Designer** — Interface planning

Initialize BMAD in any project:

```bash
aiw init --method bmad
```

Then invoke agents through Claude Code's slash commands or let them activate automatically based on context.

### 3. Templates That Work Everywhere

Write a workflow once:

```yaml
---
name: code-review
description: Comprehensive code review for quality and security
allowed-tools:
  - Read
  - Grep
  - Bash(git diff *)
---

Review the changes for:
- Code quality and maintainability
- Security vulnerabilities
- Performance implications
```

AIW converts it to the right format for each platform:
- **Claude Code** → `.claude/commands/`
- **Windsurf** → `.windsurf/workflows/`
- **GitHub Copilot** → `.github/prompts/`

### 4. Hooks That Automate Your Workflow

AIW templates can include hooks that run automatically:

- Archive plans before editing
- Update state when exiting plan mode
- Run validation after code changes
- Trigger notifications on completion

These integrate directly with Claude Code's hook system.

---

## Example Workflows

### Solo Developer Flow

```bash
# Start a new project
mkdir my-app && cd my-app
git init

# Add AI workflows
aiw init --method bmad

# Launch Claude Code
aiw launch

# Inside Claude Code, use the agents:
# /bmad-dev "implement user authentication"
# /bmad-analyst "review the auth implementation"
```

### Parallel Feature Development

```bash
# Working on main, need to start a hotfix
aiw branch hotfix-login-bug
# → Opens new terminal with Claude Code in ../project-hotfix-login-bug/

# Back in original terminal, start another feature
aiw branch feature-dashboard
# → Opens another terminal with Claude Code in ../project-feature-dashboard/

# Three Claude Code sessions, three branches, zero conflicts
```

### Team Consistency

```bash
# Set up templates for the whole team
aiw init --method bmad --ide claude --ide windsurf

# Commit the generated folders
git add .claude/ .windsurf/ _bmad/
git commit -m "Add AI workflow templates"

# Now everyone has the same agents, regardless of their IDE
```

---

## Available Templates

| Template | Description |
|----------|-------------|
| **bmad** | Full BMAD methodology with agents for analyst, architect, dev, PM, and more |
| **cc-native** | Claude Code native features—planning, agents, hooks |
| **gsd** | Get Stuff Done—streamlined productivity workflows |
| **planning-with-files** | File-based project planning system |

---

## Installation

```bash
npm install -g aiwcli
```

**Requirements:**
- Node.js 18+
- Git (for worktree features)
- Claude Code, Windsurf, or GitHub Copilot (depending on which you use)

---

## Commands

| Command | What it does |
|---------|--------------|
| `aiw init` | Initialize templates in your project |
| `aiw launch` | Launch Claude Code with sandbox disabled |
| `aiw branch <name>` | Create worktree + branch, auto-launch Claude Code |
| `aiw branch --delete --all` | Safely clean up finished worktrees |
| `aiw clear` | Remove installed templates |
| `aiw clean` | Clean output folders |

Run `aiw help` or `aiw help <command>` for details.

---

## Documentation

- **[Development Guide](./DEVELOPMENT.md)** — Contributing and local setup
- **[Template Guide](./docs/TEMPLATE-USER-GUIDE.md)** — Creating your own templates
- **[Best Practices](./docs/BEST-PRACTICES.md)** — Patterns and tips

---

## Contributing

```bash
git clone https://github.com/jofu-tofu/AI-Workflow-CLI.git
cd AI-Workflow-CLI
bun install
bun test
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for the full setup.

---

## License

MIT © 2026 jofu-tofu

---

[GitHub](https://github.com/jofu-tofu/AI-Workflow-CLI) · [npm](https://npmjs.com/package/aiwcli) · [Issues](https://github.com/jofu-tofu/AI-Workflow-CLI/issues)
