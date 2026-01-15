# AI Workflow CLI

**Command-line interface for AI-powered workflows and cross-platform AI assistant templates**

[![Version](https://img.shields.io/npm/v/aiwcli.svg)](https://npmjs.org/package/aiwcli)
[![License](https://img.shields.io/npm/l/aiwcli.svg)](https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/package.json)

## Overview

AI Workflow CLI (AIW) is a powerful command-line tool that bridges AI coding assistants with your development workflow. It provides commands for launching Claude Code sessions, initializing project workflows with cross-platform AI assistant templates, and managing AI-powered development tasks.

### What Makes AIW Unique

- **Cross-Platform AI Templates** - Write templates once in a universal format, deploy to Claude Code, Windsurf, and GitHub Copilot
- **Seamless Claude Code Integration** - Launch Claude Code with project context automatically loaded
- **Git Worktree Management** - Create branches in isolated worktrees with auto-launch
- **BMAD Workflow Templates** - Built-in Build, Measure, Analyze, Deploy templates
- **Multi-IDE Support** - Templates work across different AI assistant platforms

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Features](#features)
- [Cross-Platform Templates](#cross-platform-templates)
- [Architecture](#architecture)
- [Environment Variables](#environment-variables)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Version & Changelog](#version--changelog)
- [License](#license)

## Installation

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn** package manager
- **Git** (for worktree and branch management features)
- **Claude Code** (optional, for `aiw launch` command)

### Install Globally

```bash
npm install -g aiwcli
```

### Verify Installation

```bash
aiw --version
aiw --help
```

## Quick Start

### 1. Launch Claude Code with AIW Context

```bash
# Launch Claude Code with AI Workflow CLI configuration
aiw launch
```

### 2. Initialize AI Assistant Templates

```bash
# Initialize BMAD workflow in your project
aiw init --method bmad

# Initialize with specific IDE support (Claude Code)
aiw init --method bmad --ide claude

# Initialize with Windsurf IDE support
aiw init --method bmad --ide windsurf

# Initialize with multiple IDEs
aiw init --method bmad --ide claude --ide windsurf
```

### 3. Create Git Worktrees with Auto-Launch

```bash
# Create a new branch in an isolated worktree and auto-launch Claude Code
aiw branch feature-authentication

# Creates worktree in ../aiwcli-feature-authentication/
# Automatically launches Claude Code in the new worktree
```

### 4. Get Help

```bash
aiw help              # Show all commands
aiw help init         # Show help for specific command
aiw help branch       # Show help for branch command
```

## Commands

### `aiw launch`

Launch Claude Code with AI Workflow CLI context pre-loaded.

**Usage:**
```bash
aiw launch
```

**What it does:**
- Launches Claude Code in the current directory
- Disables sandbox mode for full system access
- Pre-loads AI Workflow CLI templates and context

**Options:**
- None (uses current directory as project root)

---

### `aiw init`

Initialize AI assistant templates and workflows in your project.

**Usage:**
```bash
aiw init --method <method> [--ide <ide>]...
```

**Arguments:**
- `--method <method>` - Template method to initialize (currently supports: `bmad`)
- `--ide <ide>` - Target IDE(s) for templates (repeatable flag)
  - `claude` - Claude Code (.claude/ directory)
  - `windsurf` - Windsurf IDE (.windsurf/ directory)
  - `copilot` - GitHub Copilot (.github/ directory)

**Examples:**
```bash
# BMAD workflow for Claude Code
aiw init --method bmad --ide claude

# BMAD workflow for Windsurf
aiw init --method bmad --ide windsurf

# BMAD workflow for multiple IDEs
aiw init --method bmad --ide claude --ide windsurf --ide copilot

# Default (all supported IDEs)
aiw init --method bmad
```

**What it does:**
- Creates IDE-specific directories (`.claude/`, `.windsurf/`, `.github/`)
- Installs cross-platform templates converted for each IDE
- Sets up workflow automation templates

---

### `aiw branch <branchName>`

Create a git worktree in a sibling folder and auto-launch Claude Code.

**Usage:**
```bash
aiw branch <branchName> [--no-launch]
```

**Arguments:**
- `<branchName>` - Name of the new branch to create

**Flags:**
- `--no-launch` - Skip auto-launching Claude Code after creation

**Examples:**
```bash
# Create branch and auto-launch
aiw branch feature-login

# Create branch without launching
aiw branch hotfix-auth --no-launch

# Delete all worktrees safely
aiw branch --delete --all
```

**What it does:**
1. Creates a new git branch from the current branch
2. Creates a worktree in a sibling directory: `../<repo>-<branchName>/`
3. Automatically launches Claude Code in the new worktree (unless `--no-launch`)

**Worktree Location:**
If your repo is at `/projects/aiwcli/` and you run `aiw branch feature-login`:
- Creates worktree at: `/projects/aiwcli-feature-login/`
- Branch name: `feature-login`

---

### `aiw help`

Display help information for AI Workflow CLI.

**Usage:**
```bash
aiw help [COMMAND]
```

**Examples:**
```bash
aiw help              # Show all commands
aiw help init         # Show help for init command
aiw help branch       # Show help for branch command
```

## Features

### 1. Claude Code Integration

Seamlessly integrate with Claude Code for AI-assisted development:

- **Context-Aware Launching** - Launch Claude Code with project-specific context automatically loaded
- **Sandbox Disabled** - Full system access for complex workflows
- **Template Pre-Loading** - AI assistant templates ready on launch

**Example Workflow:**
```bash
cd my-project
aiw init --method bmad --ide claude
aiw launch
# Claude Code opens with BMAD templates loaded
```

### 2. Cross-Platform AI Assistant Templates

Write AI assistant templates once, deploy everywhere:

**Supported Platforms:**
- **Claude Code** - Anthropic's CLI-based AI assistant
- **Windsurf** - Codeium's IDE with Cascade AI agent
- **GitHub Copilot** - Microsoft's AI pair programmer

**Template System Features:**
- **Universal Format** - Standard YAML frontmatter + Markdown body
- **Platform Conversion** - Automatic conversion to platform-specific formats
- **Feature Parity** - Capabilities preserved across platforms
- **Single Source of Truth** - Maintain templates in `.ai-templates/`, deploy to all platforms

**Learn More:** See [Template User Guide](./docs/TEMPLATE-USER-GUIDE.md)

### 3. BMAD Workflows

Built-in templates for Build, Measure, Analyze, Deploy methodology:

**BMAD Components:**
- **Build** - Development workflows and code generation
- **Measure** - Testing, monitoring, and metrics collection
- **Analyze** - Code review, performance analysis, security scanning
- **Deploy** - Deployment automation and release management

**Initialize BMAD:**
```bash
aiw init --method bmad --ide claude --ide windsurf
```

### 4. Multi-IDE Support

Templates automatically adapt to your preferred IDE:

| IDE | Directory | Format | Features |
|-----|-----------|--------|----------|
| **Claude Code** | `.claude/skills/` | SKILL.md | Full tool restrictions, context forking |
| **Windsurf** | `.windsurf/workflows/` | workflow.md | Model decision triggers, auto-activation |
| **GitHub Copilot** | `.github/prompts/` | prompt.md | Agent mode, working set management |

### 5. Git Worktree Management

Create isolated development environments for features and experiments:

**Benefits:**
- **Parallel Development** - Work on multiple branches simultaneously
- **Clean Separation** - Each worktree is an independent directory
- **Auto-Launch** - Claude Code opens in the new worktree automatically
- **Safe Cleanup** - `--delete --all` flag safely removes orphaned worktrees

**Example:**
```bash
# Main project
cd /projects/aiwcli

# Create feature branch worktree
aiw branch feature-auth
# Creates: /projects/aiwcli-feature-auth/
# Launches: Claude Code in new worktree

# Work in parallel
cd /projects/aiwcli  # Main branch
# Original directory unchanged
```

### 6. Fast & Efficient

Built on [oclif](https://oclif.io) framework for optimal performance:

- **Fast Startup** - Minimal overhead, instant command execution
- **Modular Architecture** - Only loads required components
- **TypeScript** - Type-safe command definitions
- **Extensible** - Easy to add new commands and features

## Cross-Platform Templates

### Template Anatomy

Templates consist of two parts:

1. **YAML Frontmatter** - Machine-readable configuration
2. **Markdown Body** - Human-readable instructions

**Example Template:**
```yaml
---
name: code-review
description: >
  USE WHEN reviewing code changes. Performs comprehensive code review
  for maintainability, performance, and security.
version: "1.0.0"

# Claude Code specific
allowed-tools:
  - Read
  - Grep
  - Bash(git diff *)
model: claude-sonnet-4-5-20250929

# Windsurf specific
trigger: model_decision
globs:
  - "**/*.ts"
  - "**/*.tsx"

# GitHub Copilot specific
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
mode: agent

# Cross-platform metadata
platforms:
  - claude-code
  - windsurf
  - github-copilot
---

# Code Review

Perform comprehensive code review focusing on:
- Code quality and maintainability
- Performance and efficiency
- Security vulnerabilities
- Best practices adherence

## Process
1. Analyze changed files
2. Check for anti-patterns
3. Review security implications
4. Generate findings report
```

### Template Directories

Templates are stored in `.ai-templates/` and automatically converted:

```
.ai-templates/
  skills/               # Reusable capabilities
    code-review/
      SKILL.md
  workflows/            # Multi-step processes
    deploy-production.workflow.md

# After running aiw init --method bmad --ide claude --ide windsurf:

.claude/
  skills/
    code-review/
      SKILL.md          # Converted for Claude Code

.windsurf/
  workflows/
    code-review.md      # Converted for Windsurf
```

### Platform Conversion

AIW automatically converts templates to platform-specific formats:

**From Standard Format:**
```yaml
---
name: test-runner
allowed-tools:
  - Bash(npm test)
trigger: model_decision
---
```

**To Claude Code:**
```yaml
---
name: test-runner
allowed-tools:
  - Bash(npm test)
---
```

**To Windsurf:**
```yaml
---
description: test-runner workflow
trigger: model_decision
---
<!-- Tool restrictions advisory only -->
```

**Learn More:**
- [Template User Guide](./docs/TEMPLATE-USER-GUIDE.md) - Complete template creation guide
- [Best Practices](./docs/BEST-PRACTICES.md) - Patterns and tutorials

## Architecture

### System Design

AI Workflow CLI follows a modular architecture:

```
┌─────────────────────────────────────────┐
│         AI Workflow CLI (aiw)           │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │   Commands  │  │   Template      │  │
│  │             │  │   Installer     │  │
│  │ - launch    │  │                 │  │
│  │ - init      │  │ - Resolver      │  │
│  │ - branch    │  │ - Converter     │  │
│  └─────────────┘  └─────────────────┘  │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │   Config    │  │   Git Utils     │  │
│  │   Manager   │  │                 │  │
│  │             │  │ - Worktrees     │  │
│  │ - AIW_DIR   │  │ - Branch Mgmt   │  │
│  │ - Settings  │  └─────────────────┘  │
│  └─────────────┘                        │
│                                         │
└─────────────────────────────────────────┘
           │              │
           │              │
           ▼              ▼
    ┌────────────┐  ┌────────────┐
    │   Claude   │  │  Windsurf  │
    │    Code    │  │    IDE     │
    └────────────┘  └────────────┘
```

### Key Components

**Commands (`src/commands/`):**
- `launch.ts` - Claude Code launcher
- `init/index.ts` - Template initialization
- `branch.ts` - Git worktree management

**Library (`src/lib/`):**
- `template-installer.ts` - Template installation logic
- `template-resolver.ts` - Template format conversion
- `config.ts` - Configuration management
- `paths.ts` - Path resolution (AIW_DIR aware)

**Templates (`src/templates/`):**
- `bmad/` - BMAD workflow templates
- Built-in templates bundled with CLI

**Type Definitions (`src/types/`):**
- `exit-codes.ts` - Standard exit codes
- Type definitions for templates and configuration

### Environment-Aware Paths

AIW uses `AIW_DIR` for environment-aware resource location:

**Development:**
```bash
export AIW_DIR="$(pwd)"  # Points to worktree
```

**Production:**
```bash
export AIW_DIR="$HOME/.aiw"  # Points to global installation
```

This allows isolated development without affecting global installation.

## Environment Variables

AI Workflow CLI uses environment variables for configuration:

### Required Variables

None - AIW works out of the box with defaults.

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AIW_DIR` | Main installation directory | `~/.aiw` (production)<br>`$(pwd)` (development) |
| `AIW_CONFIG` | Configuration file path | `$AIW_DIR/config.json` |
| `DA` | Digital assistant name | (none) |

### Configuration File

AIW configuration is stored in `$AIW_DIR/config.json`:

```json
{
  "defaultIDE": "claude",
  "autoLaunch": true,
  "templateDirectory": ".ai-templates"
}
```

### Setting Environment Variables

**PowerShell (Windows):**
```powershell
$env:AIW_DIR = "$HOME\.aiw"
$env:DA = "Claude"
```

**Bash (Unix/macOS/Git Bash):**
```bash
export AIW_DIR="$HOME/.aiw"
export DA="Claude"
```

**Persistent Configuration:**

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, or PowerShell profile):
```bash
export AIW_DIR="$HOME/.aiw"
export DA="Claude"
```

## Documentation

### User Guides

- **[Development Guide](./DEVELOPMENT.md)** - Development setup, environment configuration, testing workflows
- **[Claude Instructions](./CLAUDE.md)** - Instructions for Claude Code integration
- **[Template User Guide](./docs/TEMPLATE-USER-GUIDE.md)** - How to create and use cross-platform templates
- **[Best Practices](./docs/BEST-PRACTICES.md)** - Patterns, best practices, and step-by-step tutorials

### Quick Links

- **GitHub Repository:** https://github.com/jofu-tofu/AI-Workflow-CLI
- **npm Package:** https://npmjs.com/package/aiwcli
- **Issue Tracker:** https://github.com/jofu-tofu/AI-Workflow-CLI/issues
- **Pull Requests:** https://github.com/jofu-tofu/AI-Workflow-CLI/pulls

## Troubleshooting

### Common Issues

#### Issue: `aiw: command not found`

**Cause:** NPM global bin directory not in PATH

**Solution:**
1. Find npm global bin directory:
   ```bash
   npm config get prefix
   ```
2. Add to PATH:
   ```bash
   # Bash
   export PATH="$(npm config get prefix)/bin:$PATH"

   # PowerShell
   $env:PATH = "$(npm config get prefix)\bin;$env:PATH"
   ```

#### Issue: `aiw launch` fails to start Claude Code

**Cause:** Claude Code not installed or not in PATH

**Solution:**
1. Verify Claude Code is installed:
   ```bash
   claude --version
   ```
2. If not installed, install from: https://claude.ai/code
3. Ensure `claude` command is in your PATH

#### Issue: Templates not loading after `aiw init`

**Cause:** IDE not recognizing template directory

**Solution:**
1. Verify template directory was created:
   ```bash
   ls -la .claude/    # For Claude Code
   ls -la .windsurf/  # For Windsurf
   ```
2. Restart your IDE
3. For Claude Code, reload window (Cmd+R or Ctrl+R)

#### Issue: `AIW_DIR` path errors during development

**Cause:** AIW_DIR environment variable not set

**Solution:**

See [Development Guide - Critical Environment Setup](./DEVELOPMENT.md#critical-environment-setup) for detailed instructions.

**Quick fix:**
```bash
# Navigate to your worktree root
cd /path/to/your/worktree

# Set AIW_DIR (PowerShell)
$env:AIW_DIR = $PWD.Path

# Set AIW_DIR (Bash)
export AIW_DIR="$(pwd)"

# Verify
echo $env:AIW_DIR  # PowerShell
echo $AIW_DIR      # Bash
```

#### Issue: Git worktree creation fails

**Cause:** Branch already exists or invalid branch name

**Solution:**
1. Check existing branches:
   ```bash
   git branch -a
   ```
2. Use a unique branch name
3. Branch names must be valid git ref names (no spaces, special chars)

### Getting Help

If you encounter issues not covered here:

1. **Check existing issues:** https://github.com/jofu-tofu/AI-Workflow-CLI/issues
2. **Create new issue:** Provide:
   - AIW version (`aiw --version`)
   - Operating system
   - Full error message
   - Steps to reproduce
3. **Community support:** Discussions tab on GitHub

## Project Structure

Repository organization:

```
aiwcli/
├── packages/cli/              # CLI package source
│   ├── src/
│   │   ├── commands/          # CLI commands
│   │   │   ├── launch.ts      # Launch Claude Code
│   │   │   ├── branch.ts      # Git worktree management
│   │   │   └── init/          # Template initialization
│   │   │       └── index.ts
│   │   ├── lib/               # Library code
│   │   │   ├── config.ts      # Configuration management
│   │   │   ├── paths.ts       # Path resolution
│   │   │   ├── template-installer.ts
│   │   │   ├── template-resolver.ts
│   │   │   ├── gitignore-manager.ts
│   │   │   ├── output.ts      # CLI output utilities
│   │   │   ├── spinner.ts     # Progress indicators
│   │   │   └── errors.ts      # Error handling
│   │   ├── templates/         # Built-in templates
│   │   │   └── bmad/          # BMAD workflow templates
│   │   └── types/             # TypeScript types
│   │       └── exit-codes.ts  # Standard exit codes
│   ├── test/                  # Test files
│   │   ├── commands/          # Command tests
│   │   ├── lib/               # Library tests
│   │   └── integration/       # Integration tests
│   └── package.json
├── examples/                  # Example templates and workflows
├── docs/                      # Documentation
│   ├── TEMPLATE-USER-GUIDE.md
│   └── BEST-PRACTICES.md
├── .claude/                   # Claude Code project settings
├── DEVELOPMENT.md             # Development guide
├── CLAUDE.md                  # Claude Code instructions
└── README.md                  # This file
```

### Key Directories

**Source Code:**
- `packages/cli/src/commands/` - All CLI commands
- `packages/cli/src/lib/` - Shared library code
- `packages/cli/src/templates/` - Built-in templates

**Tests:**
- `packages/cli/test/commands/` - Command-specific tests
- `packages/cli/test/lib/` - Library unit tests
- `packages/cli/test/integration/` - End-to-end integration tests

**Documentation:**
- `docs/` - User guides and references
- `DEVELOPMENT.md` - Development setup
- `CLAUDE.md` - Claude Code integration

## Contributing

Contributions are welcome! Please follow these guidelines:

### Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/AI-Workflow-CLI.git
   cd AI-Workflow-CLI
   ```
3. **Install dependencies:**
   ```bash
   bun install  # or npm install
   ```
4. **Set up development environment:**
   ```bash
   # See DEVELOPMENT.md for detailed setup
   export AIW_DIR="$(pwd)"
   ```
5. **Run tests to verify setup:**
   ```bash
   bun test
   ```

### Development Workflow

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Make your changes**
3. **Write tests** for new functionality
4. **Run tests:**
   ```bash
   bun test
   ```
5. **Lint and format:**
   ```bash
   npm run lint
   npm run format
   ```
6. **Commit your changes:**
   ```bash
   git commit -m "feat: add new feature"
   ```
7. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```
8. **Open a pull request** on GitHub

### Contribution Guidelines

**Code Standards:**
- Follow existing code style
- Use TypeScript for type safety
- Write tests for new features
- Keep functions small and focused
- Document complex logic with comments

**Commit Messages:**
- Use conventional commits format:
  - `feat:` - New features
  - `fix:` - Bug fixes
  - `docs:` - Documentation changes
  - `test:` - Test additions/changes
  - `refactor:` - Code refactoring
  - `chore:` - Maintenance tasks

**Pull Request Process:**
1. Ensure all tests pass
2. Update documentation if needed
3. Reference any related issues
4. Wait for code review
5. Address review feedback
6. Merge when approved

**Testing Requirements:**
- Unit tests for new library functions
- Integration tests for new commands
- All tests must pass before merging

### Development Resources

- **[Development Guide](./DEVELOPMENT.md)** - Detailed development setup
- **[Testing Guide](./DEVELOPMENT.md#running-tests)** - How to run and write tests
- **[Architecture](#architecture)** - System design overview

## Version & Changelog

**Current Version:** 0.0.0 (Development)

**Status:** Active development - Version 1.0.0 coming soon

### Version History

- **0.0.0** (Current) - Development version
  - Cross-platform template system implementation
  - BMAD workflow templates
  - Git worktree management
  - Multi-IDE support (Claude Code, Windsurf, GitHub Copilot)

### Semantic Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** - Incompatible API changes
- **MINOR** - New functionality, backward compatible
- **PATCH** - Bug fixes, backward compatible

### Changelog

Full changelog available at: [CHANGELOG.md](./CHANGELOG.md) (coming soon)

## License

**MIT License**

Copyright (c) 2026 jofu-tofu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Repository Links

- **GitHub:** https://github.com/jofu-tofu/AI-Workflow-CLI
- **npm:** https://npmjs.com/package/aiwcli
- **Issues:** https://github.com/jofu-tofu/AI-Workflow-CLI/issues
- **Pull Requests:** https://github.com/jofu-tofu/AI-Workflow-CLI/pulls
- **Discussions:** https://github.com/jofu-tofu/AI-Workflow-CLI/discussions

---

**Built with [oclif](https://oclif.io) | Powered by AI-assisted development**
