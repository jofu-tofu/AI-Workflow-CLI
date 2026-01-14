# AIW CLI - Development Guide

**Generated:** 2026-01-10
**Updated:** 2026-01-13

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Testing](#testing)
5. [Code Quality](#code-quality)
6. [Build Process](#build-process)
7. [Common Development Tasks](#common-development-tasks)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Purpose |
|----------|----------------|---------|
| Node.js | 18.0.0 | Runtime environment |
| npm | 8.0.0 | Package manager |
| Git | 2.0.0 | Version control |
| Claude Code | 0.1.0 | Integration target |

### Recommended Tools

- **VS Code** - IDE with TypeScript support
- **Windows:** Developer Mode enabled (for symlinks)
- **Unix/macOS:** Standard terminal

---

## Environment Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/jofu-tofu/AI-Workflow-CLI.git aiwcli

# Navigate to cli package
cd aiwcli/packages/cli

# Install dependencies
npm install
```

### 2. Build the Project

```bash
# Compile TypeScript to JavaScript
npm run build
```

This compiles `src/` → `dist/` using TypeScript compiler.

### 3. Link for Global Development

```bash
# Install globally from local directory
npm install -g .

# Verify installation
aiw --version
aiw --help
```

**Alternative:** Use `./bin/dev.js` for local testing without global install.

---

## Local Development

### Development Entry Point

Use `bin/dev.js` for local development with auto-rebuild:

```bash
# Run commands in development mode
./bin/dev.js launch         # Unix/Mac
.\bin\dev.cmd launch        # Windows

# This uses ts-node for on-the-fly TypeScript compilation
```

### Development Workflow

```bash
# 1. Make changes to source code in src/
vim src/commands/launch.ts

# 2. Test immediately without rebuilding
./bin/dev.js launch

# 3. Run tests to verify
npm test

# 4. Build when ready for production testing
npm run build

# 5. Test production build
./bin/run.js launch
```

### Watch Mode Development

AIW CLI includes integrated watch mode scripts for streamlined development:

```bash
# Combined watch: rebuilds code AND runs tests on changes
npm run watch

# TypeScript only: watch and rebuild on source changes
npm run dev:watch

# Tests only: watch and re-run tests on changes
npm run test:watch

# TypeScript compiler only (no template watching)
npm run build:watch
```

**What each watch script does:**

| Script | Purpose |
|--------|---------|
| `watch` | Runs both `dev:watch` and `test:watch` in parallel |
| `dev:watch` | Compiles TypeScript + syncs templates to dist |
| `test:watch` | Runs Mocha in watch mode, re-tests on changes |
| `build:watch` | TypeScript compiler in watch mode only |
| `templates:watch` | Watches `src/templates/` and copies to `dist/templates/` |

**Recommended workflow:**

```bash
# Terminal: Start watch mode
npm run watch

# Now edit files - tests and builds update automatically!
```

**Manual approach (if preferred):**

```bash
# Terminal 1: Watch and rebuild on changes
npx tsc -b --watch

# Terminal 2: Test changes
./bin/run.js <command>
```

---

## Testing

### Test Organization

```
test/
├── commands/       # Unit tests for individual commands
├── lib/            # Unit tests for library modules
├── integration/    # Integration tests for full CLI behavior
├── types/          # Type tests
└── index.test.ts   # Main module tests
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx mocha test/commands/launch.test.ts

# Run tests in watch mode
npx mocha --watch "test/**/*.test.ts"

# Run only integration tests
npx mocha "test/integration/**/*.test.ts"
```

### Writing Tests

#### Unit Test Example

```typescript
// test/commands/launch.test.ts
import {expect} from 'chai'
import {describe, it} from 'mocha'

describe('launch command', () => {
  it('should launch Claude Code in current directory', async () => {
    // Test implementation
  })
})
```

#### Integration Test Example

```typescript
// test/integration/launch.test.ts
import {expect} from 'chai'
import {exec} from 'child_process'
import {promisify} from 'util'

const execAsync = promisify(exec)

describe('aiw launch integration', () => {
  it('should execute launch command', async () => {
    const {stdout} = await execAsync('./bin/run.js launch --help')
    expect(stdout).to.include('Launch Claude Code')
  })
})
```

### Test Coverage

View coverage report:

```bash
npm run test:coverage

# Opens coverage report in browser
open coverage/index.html  # macOS
start coverage/index.html # Windows
```

**Coverage Target:** 100% for core features (launch, init)

---

## Code Quality

### Linting

```bash
# Run ESLint
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Check specific file
npx eslint src/commands/launch.ts
```

### Formatting

```bash
# Format all TypeScript files
npm run format

# Check formatting without modifying
npm run format:check
```

### Pre-commit Checks

Before committing, run:

```bash
# Full quality check
npm run check

# This runs: lint + build
# Ensures code compiles and passes linting
```

---

## Build Process

### Standard Build

```bash
# Clean dist/ and rebuild
npm run build

# Equivalent to:
# shx rm -rf dist && tsc -b
```

### Build Output

```
dist/
├── commands/
│   ├── launch.js
│   ├── launch.d.ts
│   ├── init/
│   └── ...
├── lib/
│   ├── config.js
│   ├── config.d.ts
│   └── ...
├── templates/
│   ├── bmad/
│   └── gsd/
└── index.js
```

### Clean Build

```bash
# Remove all build artifacts
npm run clean

# Then rebuild
npm run build
```

---

## Common Development Tasks

### Adding a New Command

1. **Create command file:**
   ```bash
   touch src/commands/my-command.ts
   ```

2. **Implement command:**
   ```typescript
   import {Command, Flags} from '@oclif/core'

   export default class MyCommand extends Command {
     static description = 'Description of my command'

     static flags = {
       debug: Flags.boolean({description: 'Enable debug mode'}),
     }

     async run() {
       const {flags} = await this.parse(MyCommand)
       // Implementation
     }
   }
   ```

3. **Create test:**
   ```bash
   touch test/commands/my-command.test.ts
   ```

4. **Build and test:**
   ```bash
   npm run build
   ./bin/run.js my-command --help
   npm test
   ```

### Adding a New Library Utility

1. **Create library file:**
   ```bash
   touch src/lib/my-utility.ts
   ```

2. **Implement and export:**
   ```typescript
   export function myUtility(): void {
     // Implementation
   }
   ```

3. **Export from lib/index.ts:**
   ```typescript
   export * from './my-utility.js'  // Note: .js extension for ESM
   ```

4. **Use in command:**
   ```typescript
   import {myUtility} from '../lib/index.js'
   ```

### Running in Debug Mode

```bash
# Enable debug logging
DEBUG=* ./bin/dev.js launch

# Or use --debug flag
./bin/dev.js launch --debug
```

### Testing Cross-Platform Behavior

**On Windows:**
```cmd
# Test AIW CLI
aiw launch --help

# Check for compatibility
```

**On Unix/macOS:**
```bash
# Test the same
aiw launch --help
```

### Updating Dependencies

```bash
# Check for outdated packages
npm outdated

# Update dependencies
npm update

# Update specific package
npm install @oclif/core@latest

# Rebuild and test
npm run build && npm test
```

---

## Troubleshooting

### Build Errors

**Problem:** TypeScript compilation fails

**Solution:**
```bash
# Clean and rebuild
npm run clean
npm run build

# Check for type errors
npx tsc --noEmit
```

### Test Failures

**Problem:** Tests fail after changes

**Solution:**
```bash
# Run tests with verbose output
npx mocha --reporter spec "test/**/*.test.ts"

# Debug specific test
npx mocha --inspect-brk test/commands/launch.test.ts
```

### Global Install Issues

**Problem:** `aiw` command not found after `npm install -g .`

**Solution:**
```bash
# Check npm global bin path
npm config get prefix

# Add to PATH if needed
export PATH="$PATH:$(npm config get prefix)/bin"  # Unix/macOS
set PATH=%PATH%;%npm_prefix%                      # Windows

# Reinstall globally
npm uninstall -g aiwcli
npm install -g .
```

### Windows Development Issues

**Problem:** Permission errors during development

**Solution:**
1. Enable Developer Mode in Windows Settings for file system operations
2. Or run development terminal as Administrator
3. See [README.md](../README.md#troubleshooting) for details

### Module Resolution Errors

**Problem:** `Cannot find module './config'`

**Solution:**
```bash
# ESM requires .js extension in imports
# Even when importing .ts files!

# Wrong:
import {getPaiHome} from './config'

# Correct:
import {getPaiHome} from './config.js'
```

### Debug Mode Not Working

**Problem:** `--debug` flag doesn't show logs

**Solution:**
```bash
# Check debug.ts implementation
# Ensure DEBUG env var or --debug flag is checked

# Try environment variable
DEBUG=* ./bin/dev.js launch
```

---

## Development Best Practices

### Code Style

1. **Use TypeScript strict mode** - Already configured
2. **Import organization:**
   - Node built-ins (with `node:` prefix)
   - External packages
   - Internal absolute imports
   - Relative imports
3. **File extensions:** Always use `.js` in imports (ESM requirement)
4. **No `I` prefix on interfaces:** `Config`, not `IConfig`
5. **Naming conventions:**
   - Files: `kebab-case.ts`
   - Classes: `PascalCase`
   - Functions: `camelCase`
   - Constants: `UPPER_SNAKE_CASE`

### Error Handling

```typescript
import {EXIT_CODES} from '../lib/errors.js'

// Wrong: Direct process.exit
process.exit(1)

// Correct: Use Oclif error handling
this.error('Error message', {exit: EXIT_CODES.GENERAL_ERROR})
```

### Testing Guidelines

1. **Mirror source structure** - `src/commands/launch.ts` → `test/commands/launch.test.ts`
2. **Test both success and failure paths**
3. **Mock external dependencies** (file system, spawned processes)
4. **Use descriptive test names**
5. **Integration tests for user-facing behavior**

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: Add my feature"

# Run quality checks before pushing
npm run check
npm test

# Push and create PR
git push origin feature/my-feature
```

---

### Local CI Simulation

Run the same checks as CI:

```bash
# Full CI check
npm run check && npm run test:coverage
```

---

## Next Steps

After setup:

1. Read [Architecture](./architecture.md) to understand system design
2. Review [Source Tree](./source-tree-analysis.md) for code organization
3. Check [Command Dependencies](./architecture.md#command-dependencies) for implementation details
4. Start with core commands (`launch`, `init`) after familiarization

---

## Getting Help

- **Documentation:** `./docs/` directory
- **Architecture:** [architecture.md](./architecture.md)
- **Command Reference:** `aiw <command> --help`
- **Issues:** GitHub repository issues at https://github.com/jofu-tofu/AI-Workflow-CLI/issues

---

Happy coding!
