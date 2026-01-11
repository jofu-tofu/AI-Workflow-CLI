# PAI CLI - Documentation Index

**Generated:** 2026-01-10
**Project:** PAI CLI v0.1.0
**Type:** CLI Tool (TypeScript + Oclif)

---

## Welcome

This is the comprehensive documentation for PAI CLI, a command-line interface for launching and managing Claude Code with Personal AI Infrastructure integration.

**Quick Navigation:**
- New to the project? Start with [Project Overview](#project-overview)
- Understanding architecture? See [Architecture](#architecture-documentation)
- Setting up for development? Go to [Development Guide](#development-guide)
- Looking for specific info? Use [Quick Reference](#quick-reference)

---

## Quick Reference

| Category | Detail |
|----------|--------|
| **Project Type** | CLI Tool (Monolith) |
| **Primary Language** | TypeScript 5 (ESM, Strict Mode) |
| **Framework** | Oclif v4 |
| **Runtime** | Node.js 18+ |
| **Testing** | Mocha + Chai + Sinon + C8 |
| **Architecture Pattern** | Command Pattern + Shared Libraries |
| **Entry Point** | `bin/run.js` (production), `bin/dev.js` (development) |

### Core Commands

1. **`pai launch`** - Launch Claude Code with PAI configuration
2. **`pai init`** - Initialize new projects
3. **`pai init bmad`** - Install BMAD methodology framework

### Key Technologies

- **CLI Framework:** Oclif v4
- **Language:** TypeScript 5
- **Testing:** Mocha + @oclif/test
- **UI:** Chalk (colors), Ora (spinners)
- **Plugins:** Autocomplete, Help, Plugins

---

## Project Overview

**[📄 project-overview.md](./project-overview.md)**

Comprehensive project summary including:
- Executive summary and purpose
- Complete technology stack
- Architecture type classification
- Repository structure
- Core features and capabilities

**Start here for a high-level understanding of the project.**

---

## Architecture Documentation

**[🏗️ architecture.md](./architecture.md)**

**⭐ Most Important Document** - Detailed system architecture covering:

### Founding Principles
- Zero-friction user experience
- Transparent pass-through to Claude Code
- Cross-platform compatibility
- Scriptability-first design
- Extensibility through init system

### Command Dependencies
Detailed breakdown of what each command depends on and how they work:
- `pai launch` - Core launch mechanism and dependencies
- `pai init` - Project initialization system
- `pai init bmad` - BMAD methodology installer

### Shared Library System
Complete documentation of `src/lib/` utilities:
- **Foundational Libraries** (Required, cannot be removed)
  - `config.ts` - Configuration resolution
  - `template-resolver.ts` - Bundled template path resolution
  - `paths.ts` - Cross-platform path utilities
  - `errors.ts` - Error handling with exit codes
  - `spawn.ts` - Process spawning

- **Feature Libraries** (Modifiable/replaceable)
  - `debug.ts` - Debug logging
  - `output.ts` - Output formatting
  - `spinner.ts` - Loading spinners
  - `tty-detection.ts` - Terminal detection
  - `quiet.ts` - Quiet mode
  - `stdin.ts` - Input handling
  - `version.ts` - Version compatibility
  - `bmad-installer.ts` - BMAD installation

### Modifiable vs. Foundational Elements
Comprehensive table showing:
- What can be safely modified
- What is architecturally foundational
- Why certain elements are locked

**Read this to understand:**
- What each command does and needs
- Which parts can be changed vs. which are core
- The principles that define this project

---

## Source Tree Analysis

**[🌳 source-tree-analysis.md](./source-tree-analysis.md)**

Annotated directory structure with explanations:
- Complete file/folder breakdown
- Purpose of each directory
- Entry points and build output
- Configuration files
- Integration points
- Navigation tips for developers

**Use this to:**
- Understand code organization
- Find specific functionality
- Learn where to add new features
- Navigate the codebase efficiently

---

## Development Guide

**[⚙️ development-guide.md](./development-guide.md)**

Complete development workflow documentation:
- Prerequisites and environment setup
- Local development workflow
- Testing (unit + integration)
- Code quality (linting, formatting)
- Build process
- Common development tasks
- Troubleshooting guide
- Best practices

**Use this for:**
- Setting up development environment
- Running tests and builds
- Adding new commands or libraries
- Debugging common issues
- Following code conventions

---

## Existing Project Documentation

### Primary Documentation

**[📖 README.md](../README.md)**
- Installation instructions
- Command usage examples
- Troubleshooting guide
- Quick start guide

### CI/CD Configuration

**GitHub Workflows** (`.github/workflows/`)
- `test.yml` - Test automation on PRs
- `onPushToMain.yml` - Main branch deployment
- `onRelease.yml` - Release automation

---

## For AI Agents & Developers

### Critical Implementation Rules

When working on this codebase, **always refer to:**

**[🤖 project-context.md](../_bmad-output/project-context.md)**
- TypeScript & ESM rules
- Oclif command patterns
- Import organization
- Error handling standards
- Naming conventions
- Testing requirements
- Critical anti-patterns

This file contains **unobvious details** that AI agents might otherwise miss.

---

## Key Architectural Concepts

### 1. Command Pattern Architecture

Each CLI command is a self-contained class extending `Command` from `@oclif/core`:

```typescript
// src/commands/launch.ts
export default class Launch extends Command {
  static description = 'Launch Claude Code'

  async run() {
    // Implementation
  }
}
```

**Benefits:**
- Commands auto-register based on file location
- Clear separation of concerns
- Easy to test in isolation
- Extensible (just add files)

### 2. Shared Library System

Common functionality centralized in `src/lib/`:

```
src/lib/
├── config.ts      # 🔒 Foundational
├── paths.ts       # 🔒 Foundational
├── errors.ts      # 🔒 Foundational
├── spawn.ts       # 🔒 Foundational
└── debug.ts       # ✏️ Modifiable
```

- **🔒 Foundational:** Required for core functionality
- **✏️ Modifiable:** Can be changed/replaced

### 3. Cross-Platform Compatibility

All path operations use cross-platform utilities:

```typescript
import {join} from 'node:path'
import {homedir} from 'node:os'

const paiHome = join(homedir(), '.pai')  // Works on all platforms
```

### 4. Transparent Pass-Through

Commands pass all arguments to Claude Code unchanged:

```typescript
spawn('claude', args, {
  stdio: 'inherit',  // User sees Claude Code directly
  cwd: process.cwd()
})
```

### 5. Scriptability

Every command supports automation:
- Consistent exit codes
- `--quiet` flag for minimal output
- Piping support
- TTY detection for behavior adjustment

---

## Documentation Status

| Document | Status | Completeness |
|----------|--------|--------------|
| index.md | ✅ Complete | Master index |
| project-overview.md | ✅ Complete | High-level overview |
| architecture.md | ✅ Complete | Detailed architecture |
| source-tree-analysis.md | ✅ Complete | Code organization |
| development-guide.md | ✅ Complete | Dev workflow |
| README.md | ✅ Existing | User guide |

---

## Getting Started

### For New Developers

1. **Read:** [Project Overview](./project-overview.md)
2. **Understand:** [Architecture](./architecture.md) (especially Founding Principles)
3. **Setup:** Follow [Development Guide](./development-guide.md)
4. **Navigate:** Use [Source Tree](./source-tree-analysis.md) as reference
5. **Code:** Check [project-context.md](../_bmad-output/project-context.md) for rules

### For AI Agents

When implementing features for this codebase:

1. **Load:** [architecture.md](./architecture.md) - Understand what can/cannot be changed
2. **Load:** [project-context.md](../_bmad-output/project-context.md) - Critical implementation rules
3. **Reference:** [Command Dependencies](./architecture.md#command-dependencies) - Understand what each command needs
4. **Follow:** [Founding Principles](./architecture.md#founding-principles) - Never violate these

### For Feature Planning

When planning new features:

1. Check [Modifiable vs. Foundational](./architecture.md#modifiable-vs-foundational-elements)
2. Ensure new features align with [Founding Principles](./architecture.md#founding-principles)
3. Follow [Extensibility patterns](./architecture.md#future-extensibility)
4. Maintain [cross-platform compatibility](./architecture.md#cross-platform-compatibility)

---

## Documentation Philosophy

This documentation emphasizes:

1. **What can be changed vs. what cannot** - Critical for safe evolution
2. **Why things are the way they are** - Founding principles and reasoning
3. **Command dependencies** - What each command needs to function
4. **Practical navigation** - How to find and modify code

**Goal:** Enable confident development while preserving architectural integrity.

---

## Additional Resources

### Related Projects

- **Claude Code:** `@anthropic-ai/claude-code` - The CLI tool this wraps
- **PAI Infrastructure:** `~/.pai/` - Personal AI configuration system
- **BMAD Methodology:** Installed via `pai init bmad`

### External Documentation

- **Oclif Framework:** https://oclif.io/
- **TypeScript:** https://www.typescriptlang.org/
- **Node.js:** https://nodejs.org/

---

## Maintenance

This documentation was generated on **2026-01-10** using PAI CLI's document-project workflow.

**To update this documentation:**
1. Run `pai-cli` documentation workflow again
2. Or manually edit relevant `.md` files
3. Commit changes to version control

**To add new documentation:**
- Create new `.md` files in `docs/`
- Add links to this index
- Follow existing format and style

---

## Questions?

- **Architecture questions:** See [architecture.md](./architecture.md)
- **Setup issues:** Check [development-guide.md](./development-guide.md#troubleshooting)
- **Code organization:** Refer to [source-tree-analysis.md](./source-tree-analysis.md)
- **Implementation details:** Check [project-context.md](../_bmad-output/project-context.md)

---

**Last Updated:** 2026-01-10
**Documentation Version:** 1.0
**Project Version:** PAI CLI v0.1.0
