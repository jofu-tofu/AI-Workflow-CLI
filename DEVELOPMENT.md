# Development Guide - AI Workflow CLI

## Context & Motivation

The AI Workflow CLI architecture requires `AIW_DIR` to locate code and data across the entire codebase. Without proper configuration, tests access wrong paths, create files in incorrect locations, and development work pollutes production environments. This guide ensures isolated development with reliable test execution.

## Critical Environment Setup

Before running ANY tests or development commands, configure your environment. This prevents path errors, wrong file locations, and cross-environment pollution.

### Step 1: Set AIW_DIR

Navigate to your development worktree root, then set the environment variable:

**PowerShell (Windows):**
```powershell
$env:AIW_DIR = $PWD.Path
```

**Bash (Unix/Git Bash):**
```bash
export AIW_DIR="$(pwd)"
```

### Step 2: Verify Configuration

```bash
# PowerShell
echo $env:AIW_DIR

# Bash
echo $AIW_DIR
```

**Expected output:** Your current worktree directory path

### Step 3: Run Initial Test

Tests must be run from the `packages/cli/` directory using npm (not bun):

```bash
cd packages/cli
npm test
```

**Success:** All tests pass (577 tests)
**Failure:** If tests fail with path errors, AIW_DIR not set correctly - repeat Step 1

> **Note:** This project uses Mocha via npm scripts. Running `bun test` from the repo root will fail because:
> - Tests expect to run from `packages/cli/` directory
> - The test runner is Mocha, not Bun's built-in test framework
> - Tests require a build step (`test:build`) that compiles TypeScript to `dist-test/`

## How AIW_DIR Works

The AI Workflow CLI uses `AIW_DIR` as the root path for resource location:

**This repository locations:**
- `$AIW_DIR/packages/cli/` - CLI source code
- `$AIW_DIR/packages/cli/src/templates/` - Template definitions (bmad, gsd)
- `$AIW_DIR/examples/` - Example workflow files

**Environment isolation:**
- **Development:** `AIW_DIR=$(pwd)` - Your worktree (isolated testing)
- **Production:** `AIW_DIR=~/.aiw` - Global installation (live system)

## Development vs Production

| Environment | AIW_DIR Value | Purpose |
|-------------|---------------|---------|
| **Development** | `$(pwd)` (worktree root) | Isolated testing in development branch |
| **Production** | `~/.aiw` or `$HOME\.aiw` | Deployed global AI Workflow CLI |

## Project Structure

This repository contains the AI Workflow CLI source code:

```
aiwcli/
├── packages/cli/           # CLI package
│   ├── src/
│   │   ├── commands/       # CLI commands (launch, init)
│   │   ├── lib/            # Library code
│   │   ├── templates/      # Built-in templates (bmad, gsd)
│   │   └── types/          # TypeScript type definitions
│   └── test/               # Test files
├── examples/               # Example workflow files
└── docs/                   # Project documentation
```

### Key Commands

- `aiw launch` - Launch Claude Code with AI Workflow CLI context
- `aiw init` - Initialize project with workflow templates

### Working with Claude Code Settings

This repository includes a `.claude/` directory with project-specific settings. Claude Code uses these settings when working in this directory.

## Running Tests

All test commands must be run from `packages/cli/`:

```bash
cd packages/cli

# All tests (builds first, then runs Mocha)
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage
npm run test:coverage
```

**Important:** Do NOT use `bun test` from the repo root - it will fail.

## Watch Mode Development

For continuous development with automatic rebuilding and testing:

```bash
cd packages/cli

# Combined watch: rebuilds code AND runs tests on changes
npm run watch

# TypeScript only: watch and rebuild on source changes
npm run dev:watch

# Tests only: watch and re-run tests on changes
npm run test:watch
```

**Available watch scripts:**

| Script | Purpose |
|--------|---------|
| `npm run watch` | Runs `dev:watch` + `test:watch` in parallel |
| `npm run dev:watch` | TypeScript compilation + template sync |
| `npm run test:watch` | Mocha in watch mode |
| `npm run build:watch` | TypeScript compiler only |
| `npm run templates:watch` | Template file sync only |

## Standard Development Workflow

Follow this pattern for all development work:

1. **Create branch/worktree** for your feature or fix
2. **Navigate to worktree root** in your terminal
3. **Set AIW_DIR** using commands in Step 1 above
4. **Verify configuration** using Step 2 above
5. **Run initial tests** to confirm environment is correct
6. **Develop changes** iteratively
7. **Run tests frequently** during development
8. **Verify all tests pass** before committing
9. **Commit and push** when complete

## Troubleshooting

Use this section to resolve common development issues.

### Issue: Tests fail with "path not found" errors

**Cause:** AIW_DIR environment variable not set

**Solution:**
1. Navigate to worktree root
2. Run: `$env:AIW_DIR = $PWD.Path` (PowerShell) or `export AIW_DIR="$(pwd)"` (Bash)
3. Verify: `echo $env:AIW_DIR` should show your worktree path
4. Run tests again

### Issue: Files created in unexpected locations

**Cause:** AIW_DIR points to wrong directory

**Solution:**
1. Check current AIW_DIR: `echo $env:AIW_DIR`
2. Compare to current directory: `pwd`
3. If different, set AIW_DIR to current directory
4. Verify configuration

### Issue: Cannot find types or modules

**Cause:** Dependencies not installed

**Solution:**
1. Run: `bun install`
2. Wait for installation to complete
3. Run tests again

### Issue: Tests pass locally but fail in CI

**Cause:** CI environment missing AIW_DIR configuration

**Solution:**
1. Check CI configuration file
2. Ensure AIW_DIR is set in CI environment
3. Verify CI uses correct directory structure

## Deployment Checklist

Complete all items before deploying to production:

**Pre-Deployment Verification:**
- [ ] All tests passing: `npm test` (from `packages/cli/`) shows no failures
- [ ] Code review approved by team member
- [ ] Documentation updated to reflect changes
- [ ] No debug code or console.logs in production code
- [ ] All dependencies in package.json are production-ready

**Environment Configuration:**
- [ ] Set AIW_DIR to production path
  - PowerShell: `$env:AIW_DIR = "$HOME\.aiw"`
  - Bash: `export AIW_DIR="$HOME/.aiw"`
- [ ] Verify production AIW_DIR: `echo $env:AIW_DIR`

**Deployment Steps:**
- [ ] Build and publish package: `npm publish`
- [ ] Run production smoke tests
- [ ] Verify all features work in production environment

**Post-Deployment:**
- [ ] Monitor logs for errors
- [ ] Verify data is being written to correct locations
- [ ] Test critical user workflows

## Success Criteria

Development environment is correctly configured when:

✅ AIW_DIR environment variable is set and verified
✅ `npm test` (from `packages/cli/`) runs without errors
✅ All 577 tests pass
✅ Files are created in worktree, not in global .aiw directory
✅ Changes can be made without affecting production environment

## Development Best Practices

1. **Set AIW_DIR first** - Every development session starts with environment configuration
2. **Verify before running** - Always check AIW_DIR is correct before tests or code execution
3. **Test frequently** - Run tests after each meaningful change
4. **Isolate environments** - Keep development and production strictly separated via AIW_DIR
5. **Follow patterns** - Match existing code structure and conventions
6. **Document changes** - Update relevant documentation when modifying behavior
