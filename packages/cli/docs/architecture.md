# AIW CLI - Architecture Documentation

**Generated:** 2026-01-10
**Updated:** 2026-01-13
**For:** AIW CLI v0.0.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Founding Principles](#founding-principles)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Command Dependencies](#command-dependencies)
6. [Shared Library System](#shared-library-system)
7. [Modifiable vs. Foundational Elements](#modifiable-vs-foundational-elements)
8. [Testing Strategy](#testing-strategy)
9. [Development Workflow](#development-workflow)

---

## Executive Summary

AIW CLI (AI Workflow CLI) is a TypeScript-based Oclif CLI tool designed to provide zero-friction access to Claude Code with AI Workflow infrastructure integration. It follows a command pattern architecture with shared library utilities, emphasizing cross-platform compatibility, scriptability, and extensibility.

---

## Founding Principles

These are the **inherent, foundational** design principles that define AIW CLI:

### 1. Zero-Friction User Experience

**Principle:** The user should be able to launch Claude Code with AIW configuration in a single command without manual setup.

**Implementation:**
- `aiw launch` handles all configuration resolution automatically
- AIW System installation handles hook configuration
- Graceful degradation when optional features are unavailable
- Clear, actionable error messages

**Why Foundational:** This is the core value proposition of the entire tool.

### 2. Transparent Pass-Through

**Principle:** AIW CLI should act as a thin wrapper around Claude Code, passing through all arguments and environment variables without modification.

**Implementation:**
- `spawn.ts` uses `child_process.spawn` with `stdio: 'inherit'`
- All CLI args after command are forwarded to Claude Code
- Exit codes from Claude Code are preserved and returned

**Why Foundational:** Users should feel like they're using Claude Code directly, not through a wrapper.

### 3. Cross-Platform Compatibility

**Principle:** Must work identically on Windows, macOS, and Linux without platform-specific commands.

**Implementation:**
- `paths.ts` handles all path resolution with cross-platform utilities
- Uses `os.homedir()` instead of `~` expansion
- `path.join()` for all path construction
- Detects and handles Windows symlink permissions

**Why Foundational:** AIW users are on multiple platforms; the tool must work everywhere.

### 4. Scriptability First

**Principle:** Every command must be usable in automated scripts and CI/CD pipelines.

**Implementation:**
- Quiet mode (`--quiet` flag) suppresses all non-essential output
- Consistent exit codes (0=success, 1=error, 2=invalid args, 3=environment error)
- Support for piping input/output
- TTY detection for automatic behavior adjustment
- Machine-readable output formats

**Why Foundational:** Automation is a primary use case, not an afterthought.

### 5. Extensibility Through Init System

**Principle:** New project templates can be added without modifying core code.

**Implementation:**
- `aiw init` uses command pattern for extensible template selection
- Template installers demonstrate the pattern
- `bmad-installer.ts` and `template-installer.ts` show how to integrate external systems
- Each template is self-contained

**Why Foundational:** AIW supports multiple methodologies and frameworks (BMAD, GSD, etc.).

---

## Technology Stack

### Core Framework

**Oclif v4** - Salesforce's open-source CLI framework

**Why Chosen:**
- Battle-tested in production CLIs (Heroku, Salesforce)
- Automatic help generation and shell completions
- Plugin system for extensibility
- TypeScript-first design
- Built-in testing utilities

**Foundational?** Yes - changing frameworks would require complete rewrite.

### Language & Modules

**TypeScript 5 (Strict Mode)** with **ESM Modules**

**Why Chosen:**
- Type safety prevents runtime errors
- ESM is Node.js standard (future-proof)
- Excellent IDE support

**Foundational?** Partially - TypeScript yes, specific config can be adjusted.

### Dependencies

| Dependency | Purpose | Foundational? |
|------------|---------|---------------|
| `@oclif/core` | CLI framework core | **Yes** - Core architecture |
| `@oclif/plugin-autocomplete` | Shell completions | No - Feature enhancement |
| `@oclif/plugin-help` | Help docs | No - Can be custom |
| `chalk` | Terminal colors | No - Can swap for alternatives |
| `ora` | Loading spinners | No - Can swap for alternatives |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Input                           │
│                    (aiw <command> [args])                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Entry Point (bin/run.js)                  │
│                  Invokes Oclif Command Router                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Command Layer                            │
│  ┌─────────────┐  ┌──────────┐                              │
│  │   launch    │  │   init   │                              │
│  └─────────────┘  └──────────┘                              │
└────────────────────────┬────────────────────────────────────┘
                         │ Uses
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Shared Library Layer                       │
│  ┌────────┐ ┌───────┐ ┌───────┐ ┌──────┐ ┌─────────────┐  │
│  │ config │ │ paths │ │ spawn │ │errors│ │   version   │  │
│  └────────┘ └───────┘ └───────┘ └──────┘ └─────────────┘  │
│  ┌────────┐ ┌───────┐ ┌───────┐ ┌──────┐ ┌─────────────┐  │
│  │ debug  │ │output │ │spinner│ │ tty  │ │    quiet    │  │
│  └────────┘ └───────┘ └───────┘ └──────┘ └─────────────┘  │
│  ┌─────────────────────┐ ┌────────┐                        │
│  │   bmad-installer    │ │ stdin  │                        │
│  └─────────────────────┘ └────────┘                        │
└────────────────────────┬────────────────────────────────────┘
                         │ Calls
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              External Processes (Claude Code)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Command Dependencies

### `aiw launch` - Main Launch Command

**Purpose:** Launch Claude Code with AIW configuration in current directory.

**Dependencies:**

| Module | Usage | Foundational? |
|--------|-------|---------------|
| `config.ts` | Resolve AIW_DIR path | **Yes** - Core functionality |
| `paths.ts` | Get Claude Code settings path | **Yes** - Required for launch |
| `spawn.ts` | Spawn Claude Code process | **Yes** - Core launch mechanism |
| `version.ts` | Check Claude Code compatibility | No - Warning only |
| `debug.ts` | Log launch details | No - Debug feature |
| `errors.ts` | Handle and format errors | **Yes** - Error handling |
| `output.ts` | Display messages | No - UI enhancement |
| `spinner.ts` | Show loading state | No - UI enhancement |

**What It Does:**
1. Resolves AIW_DIR directory (default: `~/.aiw`)
2. Checks Claude Code version compatibility
3. Verifies Claude Code is installed
4. Spawns `claude` process with current directory as argument
5. Inherits stdio (transparent pass-through)
6. Returns Claude Code's exit code

**Can Be Modified:**
- Version compatibility thresholds
- Spinner messages and styling
- Debug log verbosity

**Cannot Be Modified:**
- Core launch mechanism (spawn with stdio inherit)
- AIW_DIR resolution logic
- Pass-through behavior

---

### `aiw init` - Project Initialization Command

**Purpose:** Initialize workflow templates (BMAD, GSD) in a project.

**Dependencies:**

| Module | Usage | Foundational? |
|--------|-------|---------------|
| `template-installer.ts` | Generic template installation | No - Feature-specific |
| `bmad-installer.ts` | BMAD-specific installation | No - Feature-specific |
| `template-resolver.ts` | Resolve bundled template paths | **Yes** - Path resolution |
| `paths.ts` | Cross-platform paths | **Yes** - Required |
| `errors.ts` | Error handling | **Yes** - Error handling |
| `hooks-merger.ts` | Merge Claude hooks | No - Feature-specific |
| `output.ts` | Display progress | No - UI enhancement |
| `spinner.ts` | Loading indicators | No - UI enhancement |

**What It Does:**
1. Presents available templates (BMAD, GSD) for selection
2. Checks if template is already installed in target directory
3. Resolves bundled template path from package
4. Copies template data structure from bundled templates to target project
5. Copies Claude Code commands to `.claude/commands/`
6. Merges hooks with existing Claude settings
7. Creates necessary output directories

**Can Be Modified:**
- Available templates
- Installation steps and checks
- Output messages
- Directory structure created

**Cannot Be Modified:**
- Template resolution mechanism (uses bundled templates)
- File system operations pattern
- Oclif command structure

---

## Shared Library System

The `src/lib/` directory contains foundational utilities used across commands.

### Foundational Libraries (Cannot Be Removed)

#### `base-command.ts` - Base Command

**Purpose:** Base command class with common functionality shared across all commands.

**Exports:**
- `BaseCommand` - Base class for all CLI commands

**Why Foundational:** Provides consistent behavior and shared utilities across commands.

---

#### `config.ts` - Configuration Resolution

**Purpose:** Resolve AIW_DIR directory from environment or default.

**Exports:**
- `getAiwDir()` - Returns absolute path to AIW home directory
- `validateAiwDir()` - Validates directory exists
- `loadConfig()` - Load and validate full AIW configuration
- `AiwcliConfig` - Configuration interface

**Logic:**
1. Check `AIW_DIR` environment variable
2. Fall back to `~/.aiw` (cross-platform)
3. Return absolute path

**Why Foundational:** Every command needs to know where AIW is installed.

**Modification Allowed:**
- Default location (currently `~/.aiw`)
- Environment variable name (currently `AIW_DIR`)

---

#### `template-resolver.ts` - Bundled Template Path Resolution

**Purpose:** Resolve paths to bundled templates within the aiw-cli package.

**Exports:**
- `getTemplatePath(templateName)` - Returns absolute path to bundled template root (async)
- `getAvailableTemplates()` - Returns array of available template names (async)

**Logic:**
1. Uses `import.meta.url` to determine current file location
2. Resolves relative path to `templates/<templateName>/` directory
3. Works in both development (`src/`) and production (`dist/`) contexts
4. Validates template exists before returning path

**Why Foundational:** Enables self-contained template distribution without external dependencies.

**Modification Allowed:**
- Template directory structure
- Additional template resolvers for other frameworks

**Cannot Change:** Must work in both dev and production environments.

---

#### `paths.ts` - Cross-Platform Path Utilities

**Purpose:** Handle all path resolution with cross-platform compatibility.

**Exports:**
- `getClaudeSettingsPath()` - Claude Code settings directory
- `getAiwSettingsPath()` - AIW settings directory
- `normalizePath()` - Normalize paths for current platform

**Why Foundational:** Cross-platform compatibility is a core principle.

**Modification Allowed:**
- Path calculation logic (if Claude Code changes structure)
- Additional path utilities

**Cannot Change:** Must remain cross-platform compatible.

---

#### `errors.ts` - Error Handling System

**Purpose:** Categorized error handling with consistent exit codes.

**Exports:**
- `EXIT_CODES` - Standard exit code constants
- `CliError` - Base error class
- `handleError()` - Error formatter

**Exit Codes:**
- `0` - Success
- `1` - General error
- `2` - Invalid usage/arguments
- `3` - Environment/prerequisite error

**Why Foundational:** Scriptability requires consistent error handling.

**Modification Allowed:**
- Error messages
- Additional error categories

**Cannot Change:**
- Exit code values (would break scripts)
- Error handling pattern

---

#### `spawn.ts` - Process Spawning Utilities

**Purpose:** Spawn external processes (primarily Claude Code) with proper stdio handling.

**Exports:**
- `spawnClaude()` - Spawn Claude Code process
- `spawnProcess()` - Generic process spawner

**Key Behavior:**
- Uses `stdio: 'inherit'` for transparent pass-through
- Preserves exit codes
- Handles process errors

**Why Foundational:** Core launch mechanism for the entire tool.

**Modification Allowed:**
- Additional spawn utilities
- Error handling improvements

**Cannot Change:**
- Stdio inheritance (transparent pass-through principle)
- Exit code preservation

---

### Feature Libraries (Can Be Modified/Replaced)

#### `debug.ts` - Debug Logging System

**Purpose:** Conditional debug output controlled by `--debug` flag or `DEBUG` environment variable.

**Exports:**
- `debug()` - Log debug messages
- `isDebugEnabled()` - Check if debug mode active

**Modification Allowed:** Entire implementation (logging format, destination, verbosity)

---

#### `output.ts` - Output Formatting

**Purpose:** Centralized output formatting for consistency.

**Exports:**
- `success()` - Success messages
- `error()` - Error messages
- `info()` - Info messages

**Modification Allowed:** Entire implementation (colors, formatting, icons)

---

#### `spinner.ts` - Loading Spinners

**Purpose:** Visual feedback during long operations.

**Uses:** `ora` library

**Modification Allowed:**
- Swap ora for different library
- Change spinner styles
- Remove entirely (replace with simple text)

---

#### `tty-detection.ts` - TTY/Terminal Detection

**Purpose:** Detect if running in interactive terminal for behavior adjustment.

**Exports:**
- `isTTY()` - Check if stdout is a TTY
- `isCI()` - Check if running in CI environment

**Modification Allowed:** Additional detection logic, CI detection methods

---

#### `quiet.ts` - Quiet Mode Support

**Purpose:** Suppress non-essential output for scripting.

**Exports:**
- `isQuietMode()` - Check if quiet mode enabled
- `quietLog()` - Conditional logging

**Modification Allowed:** Implementation details, what gets suppressed

**Cannot Change:** Must respect `--quiet` flag (scriptability principle)

---

#### `stdin.ts` - Standard Input Handling

**Purpose:** Read and process piped input.

**Exports:**
- `readStdin()` - Read all stdin
- `hasStdin()` - Check if stdin has data

**Modification Allowed:** Implementation, buffering strategy

---

#### `version.ts` - Claude Code Version Compatibility

**Purpose:** Check Claude Code version and warn about incompatibilities.

**Exports:**
- `checkClaudeVersion()` - Version compatibility check
- `INCOMPATIBLE_VERSIONS` - Known incompatible versions

**Modification Allowed:**
- Version checking logic
- Incompatible version list
- Warning messages
- Version requirement thresholds

**Cannot Change:** Must remain non-blocking (graceful degradation principle)

---

#### `bmad-installer.ts` - BMAD Installation Utility

**Purpose:** Install BMAD methodology framework.

**Exports:**
- `installBMAD()` - Main installation function
- `checkBMADInstalled()` - Check if already installed

**Modification Allowed:**
- Entire implementation (feature-specific)
- Can be removed if BMAD support is removed

**Extension Pattern:** Template for adding other methodology installers

---

#### `template-installer.ts` - Generic Template Installation

**Purpose:** Generic template installation utility.

**Exports:**
- Template installation functions

**Modification Allowed:** Entire implementation (feature-specific)

---

#### `hooks-merger.ts` - Claude Hooks Merging

**Purpose:** Merge Claude Code hooks when installing templates.

**Exports:**
- Hook merging functions

**Modification Allowed:** Entire implementation (feature-specific)

---

## Modifiable vs. Foundational Elements

### Summary Table

| Element | Type | Modifiable? | Reasoning |
|---------|------|-------------|-----------|
| **Core Principles** | | | |
| Zero-friction launch | Principle | No | Core value proposition |
| Transparent pass-through | Principle | No | Defines user experience |
| Cross-platform compatibility | Principle | No | Platform requirement |
| Scriptability | Principle | No | Primary use case |
| Extensibility | Principle | No | Future growth |
| **Architecture** | | | |
| Oclif framework | Framework | No | Complete rewrite needed |
| Command pattern | Pattern | No | Framework requirement |
| Shared lib structure | Structure | Limited | Can reorganize, not remove |
| ESM modules | Module system | Limited | Future-proofing |
| **Core Libraries** | | | |
| base-command.ts | Library | Limited | Core command behavior |
| config.ts | Library | Limited | Path/env var names modifiable |
| template-resolver.ts | Library | Limited | Template paths modifiable |
| paths.ts | Library | Limited | Must stay cross-platform |
| errors.ts | Library | Limited | Exit codes are locked |
| spawn.ts | Library | Limited | Stdio inheritance required |
| **Feature Libraries** | | | |
| debug.ts | Library | Yes | Entire implementation |
| output.ts | Library | Yes | UI enhancement |
| spinner.ts | Library | Yes | UI enhancement |
| tty-detection.ts | Library | Yes | Implementation detail |
| quiet.ts | Library | Limited | Flag contract is fixed |
| stdin.ts | Library | Yes | Implementation detail |
| version.ts | Library | Yes | Non-blocking by design |
| bmad-installer.ts | Library | Yes | Feature-specific |
| template-installer.ts | Library | Yes | Feature-specific |
| hooks-merger.ts | Library | Yes | Feature-specific |
| **Commands** | | | |
| aiw launch | Command | Limited | Core command, logic modifiable |
| aiw init | Command | Yes | Can add templates |

### Key:
- **No** - Changing this would violate founding principles or require complete rewrite
- **Limited** - Core behavior is fixed, implementation details can be modified
- **Yes** - Can be modified, replaced, or removed without architectural impact

---

## Testing Strategy

### Test Organization

Tests mirror the `src/` directory structure:

```
test/
├── commands/          # Unit tests for commands
│   ├── base.test.ts
│   ├── launch.test.ts
│   └── init/
│       └── index.test.ts
├── lib/               # Unit tests for library modules
│   ├── config.test.ts
│   ├── paths.test.ts
│   └── hooks-merger.test.ts
├── integration/       # Integration tests
│   ├── cli.test.ts
│   ├── launch.test.ts
│   ├── init-command-hook-merging.test.ts
│   ├── piping-support.test.ts
│   ├── exit-codes.test.ts
│   ├── quiet-mode.test.ts
│   ├── command-chaining.test.ts
│   └── ...
├── types/             # Type tests
└── index.test.ts
```

### Testing Approach

**Unit Tests:**
- Test commands in isolation
- Mock external dependencies (`spawn`, file system)
- Use `@oclif/test` utilities
- Verify command flags and arguments

**Integration Tests:**
- Test actual CLI execution
- Verify cross-command behavior
- Test piping, exit codes, quiet mode
- Epic validation tests (feature-level testing)

**Test Tools:**
- **Mocha** - Test runner
- **Chai** - Assertions
- **Sinon** - Mocks and spies
- **C8** - Code coverage

**Coverage Target:** 100% for MVP core features (launch, init)

---

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Development mode (auto-rebuild)
./bin/dev.js <command>
```

### Project Structure Rules

1. **Commands go in `src/commands/`** - Filename determines command name
2. **Shared code goes in `src/lib/`** - Never `src/utils/` or `src/helpers/`
3. **Types go in `src/types/`** - Shared TypeScript interfaces
4. **Tests mirror src/** - `test/commands/`, `test/lib/`, etc.
5. **Import organization:**
   - Node built ins with `node:` prefix
   - External packages
   - Internal absolute imports
   - Relative imports
6. **File extensions required** - ESM requires `.js` in imports (even for `.ts` files)

### Critical Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| `process.exit(1)` | `this.error(msg, { exit: EXIT_CODES.GENERAL_ERROR })` |
| `import { x } from './file'` | `import { x } from './file.js'` |
| `src/utils/` or `src/helpers/` | `src/lib/` |
| Raw exit code numbers | `EXIT_CODES.SUCCESS`, `EXIT_CODES.GENERAL_ERROR` |
| `.then().catch()` | `async/await` with `try/catch` |
| `IConfig` interface | `Config` interface (no I prefix) |

---

## Deployment & Distribution

### Installation Methods

1. **Global Install (Recommended)**
   ```bash
   npm install -g .
   ```

2. **Direct Execution**
   ```bash
   ./bin/run.js <command>
   ```

### Distribution

- Distributed as npm package
- Built to `dist/` directory
- Includes: `bin/`, `dist/`, `oclif.manifest.json`
- Published to npm registry (future)

---

## Future Extensibility

### Adding New Commands

1. Create file in `src/commands/<command-name>.ts`
2. Extend `Command` from `@oclif/core`
3. Add tests in `test/commands/<command-name>.test.ts`
4. Command automatically discovered by Oclif

### Adding New Init Templates

1. Add template files to `src/templates/<template-name>/`
2. Update `src/commands/init/index.ts` to include the new template option
3. Add installer utility in `src/lib/` if needed
4. Follow existing template patterns (bmad, gsd)

### Adding New Shared Utilities

1. Create `src/lib/<utility-name>.ts`
2. Export functions with clear purpose
3. Add unit tests in `test/lib/` (if applicable)
4. Document in this architecture guide

---

## Conclusion

AIW CLI is built on five founding principles: zero-friction UX, transparent pass-through, cross-platform compatibility, scriptability-first, and extensibility. These principles are non-negotiable and define the tool's identity.

The architecture separates foundational elements (core commands, essential libraries) from modifiable features (UI enhancements, feature-specific logic). This allows for safe evolution while preserving the tool's core value.

When making changes, always ask:
1. Does this violate a founding principle?
2. Is this foundational or a feature?
3. Can this be swapped without breaking user contracts?

Follow this guide to maintain architectural integrity as the project evolves.
