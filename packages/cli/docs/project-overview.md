# PAI CLI - Project Overview

**Generated:** 2026-01-10
**Project Type:** CLI Tool (Monolith)
**Primary Language:** TypeScript
**Framework:** Oclif v4

---

## Executive Summary

PAI CLI is a command-line interface for launching and managing Claude Code with Personal AI Infrastructure (PAI) configuration. It provides seamless integration with PAI hooks, automatic sandbox permissions, and scriptable automation support.

**Purpose:** Developer productivity tool that serves as a convenience layer with pre-flight automation, transparent pass-through to Claude Code, and navigation hub for PAI features.

---

## Technology Stack

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Framework | Oclif | v4 | CLI framework by Salesforce |
| Language | TypeScript | v5 | Strict mode with ESM modules |
| Runtime | Node.js | 18+ | Minimum required version |
| Testing | Mocha | v10 | Test runner |
| Testing | Chai | v4 | Assertion library |
| Testing | Sinon | v21 | Test doubles |
| Coverage | C8 | v10 | Code coverage |
| Linting | ESLint | v9 | Code quality |
| Formatting | Prettier | v3 | Code formatting |
| CLI Plugins | @oclif/plugin-autocomplete | v3 | Shell completions |
| CLI Plugins | @oclif/plugin-help | v6 | Help documentation |
| CLI Plugins | @oclif/plugin-plugins | v5 | Plugin system |
| UI | Chalk | v5 | Terminal colors |
| UI | Ora | v9 | Loading spinners |

---

## Architecture Type

**Pattern:** Command Pattern + Shared Library Architecture

The CLI follows Oclif's command-based architecture where each command is a self-contained module that extends the base `Command` class. Shared functionality is centralized in the `src/lib/` directory.

---

## Repository Structure

**Type:** Monolith
**Parts:** 1 (PAI CLI)

Single cohesive codebase with clear separation between commands and shared libraries.

---

## Quick Reference

**Entry Point:** `bin/run.js` (production), `bin/dev.js` (development)
**Commands Directory:** `src/commands/`
**Shared Libraries:** `src/lib/`
**Tests:** `test/` (mirrors src/ structure)

---

## Core Commands

1. **`pai launch`** - Launch Claude Code with PAI configuration
2. **`pai init`** - Initialize new projects
3. **`pai init bmad`** - Install BMAD methodology framework

---

## Key Features

- **Zero-friction Claude Code launch** with automatic PAI config loading
- **Cross-platform path handling** (Windows, macOS, Linux)
- **Scriptable automation** with quiet mode, piping support, exit code consistency
- **Version compatibility checking** for Claude Code
- **Debug logging** system
- **Extensible init system** for project templates

---

## Documentation

- [Architecture](./architecture.md) - Detailed system architecture
- [Source Tree](./source-tree-analysis.md) - Annotated directory structure
- [Development Guide](./development-guide.md) - Setup and development workflow
- [Command Dependencies](./command-dependencies.md) - What each command needs
- [Founding Principles](./founding-principles.md) - Core design principles

---

## Project Context

For AI agents working on this codebase, refer to:
- `_bmad-output/project-context.md` - Critical implementation rules and patterns
