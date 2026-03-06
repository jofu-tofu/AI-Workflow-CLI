# Development Guide - AI Workflow CLI

## Before Starting Development

Read this section before any development or testing work. These steps prevent path errors, test failures, and cross-environment pollution.

### Step 1: Set AIW_DIR Environment Variable

Navigate to your development worktree root and set:

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

Output should show your current worktree path.

### Step 3: Run Tests

Tests run from `packages/cli/` using npm (not bun):

```bash
cd packages/cli
npm test
```

**Success:** All tests pass (577 tests)
**Failure:** If tests fail with path errors, AIW_DIR is not set correctly—repeat Step 1

---

## Architecture Understanding

This section explains the template system architecture. Understanding this prevents synchronization errors and ensures correct development patterns.

### Working Directory vs Template Directory

| Location | Purpose | When to Modify |
|----------|---------|----------------|
| `.aiwcli/` | Runtime hooks and libraries | During development |
| `packages/cli/src/templates/cc-native/` | Distribution template | After `.aiwcli/` changes |

**Synchronization Rule:** Changes to `.aiwcli/` must be synchronized to `packages/cli/src/templates/cc-native/`. This ensures new project initializations receive updates.

### Files Requiring Synchronization

| Source | Target |
|--------|--------|
| `.aiwcli/_core/hooks-ts/*.ts` | `packages/cli/src/templates/core/hooks-ts/` |
| `.aiwcli/_core/lib-ts/**/*.ts` | `packages/cli/src/templates/core/lib-ts/` |
| `.aiwcli/_cc-native/**` | `packages/cli/src/templates/cc-native/_cc-native/` |
| `.aiwcli/_cc-native/hooks/*.ts` | `packages/cli/src/templates/cc-native/_cc-native/hooks/` |
| `.aiwcli/_cc-native/lib-ts/**/*.ts` | `packages/cli/src/templates/cc-native/_cc-native/lib-ts/` |
| `.claude/settings.json` | `packages/cli/src/templates/cc-native/.claude/settings.json` |

### Core Package Source of Truth

Reusable cross-platform utility code now lives in `packages/cli/src/lib/runtime/`.
Current extracted modules:

- `tmux-preflight.ts`
- `executable-policy.ts`
- `platform-adapter.ts`
- `subprocess-utils.ts`
- `sentinel-ipc.ts`

To sync extracted shared library modules into CLI and template wrappers:

```bash
cd packages/cli
npm run sync:shared-lib
```

To sync the cc-native runtime tree into its template mirror:

```bash
cd packages/cli
npm run sync:cc-native
```

### Directory Structure

```
.aiwcli/
├── core/                    # Cross-method infrastructure
│   ├── hooks-ts/               # Shared TypeScript hook scripts (run via bun)
│   │   ├── user_prompt_submit.ts    # Context binding
│   │   ├── context_monitor.ts       # Context usage monitoring
│   │   ├── archive_plan.ts          # Plan archival on ExitPlanMode
│   │   ├── session_start.ts         # Context restoration on session start
│   │   ├── session_end.ts           # State save and mode staging
│   │   ├── pre_compact.ts           # Pre-compaction state snapshot
│   │   ├── file-suggestion.ts       # File organization suggestions
│   │   ├── task_create_capture.ts   # Task persistence
│   │   └── task_update_capture.ts   # Task status changes
│   └── lib-ts/
│       ├── base/               # Core utilities
│       │   ├── atomic-write.ts      # Cross-platform crash-safe writes
│       │   ├── constants.ts         # Security constants, paths
│       │   ├── hook-utils.ts        # Hook lifecycle, logging, emit helpers
│       │   ├── inference.ts         # Inference model utilities
│       │   ├── logger.ts            # Unified JSONL logger
│       │   ├── subprocess-utils.ts  # Subprocess and internal call detection
│       │   └── utils.ts             # Common functions
│       ├── context/            # Context management
│       │   ├── context-store.ts     # CRUD operations, state persistence
│       │   ├── context-selector.ts  # Context determination and matching
│       │   ├── formatters.ts        # Mode displays, icons, task rendering
│       │   ├── plan-archive.ts      # Plan archival
│       │   └── task-sync.ts         # Task persistence
│       ├── handoff/            # Session handoff
│       │   └── document-generator.ts
│       └── templates/          # Output formatters
│           └── plan-context.ts      # Plan evaluation templates
│
└── _cc-native/                 # Method-specific code
    ├── hooks/
    │   ├── cc-native-plan-review.ts     # Multi-step plan review (async)
    │   ├── add_plan_context.ts          # Clarifying questions offer
    │   └── plan_questions_early.ts      # Phase A clarification prompt
    ├── lib-ts/
    │   ├── cc-native-state.ts   # CC-native state management
    │   ├── config.ts            # Configuration loading
    │   └── reviewers/           # Plan review implementations
    │       ├── codex.ts             # Codex CLI reviewer
    │       └── types.ts             # Reviewer types and schemas
    └── plan-review.config.json  # Plan review configuration

_output/
├── index.json                   # Global context cache
├── hook-log.jsonl               # Diagnostic logs (JSONL format)
└── contexts/                    # Context state management
    └── {context-id}/
        ├── state.json           # SOURCE OF TRUTH
        └── plans/               # Archived approved plans
```

### Hook System

Hooks are TypeScript scripts run via Bun, triggered by Claude Code lifecycle events. Configuration lives in `.claude/settings.json`.

**Hook Lifecycle Events:**

| Event | When Triggered | Example Hooks |
|-------|----------------|---------------|
| `UserPromptSubmit` | User sends message | `user_prompt_submit.ts` (context binding) |
| `PreToolUse` | Before tool executes | `cc-native-plan-review.ts` (plan validation) |
| `PostToolUse` | After tool completes | `context_monitor.ts` (context tracking) |

**Shared Hooks** (`.aiwcli/_core/hooks-ts/`):
- `user_prompt_submit.ts` - Context enforcement, session binding
- `context_monitor.ts` - Context usage monitoring (30%/20%/10% warnings)
- `session_start.ts` - Context restoration on session start
- `session_end.ts` - State save and mode staging
- `archive_plan.ts` - Archives approved plans on ExitPlanMode
- `pre_compact.ts` - Pre-compaction state snapshot
- `file-suggestion.ts` - File organization suggestions
- `task_create_capture.ts` - Captures task creation events
- `task_update_capture.ts` - Captures task status changes

**Method-Specific Hooks** (`.aiwcli/_cc-native/hooks/`):
- `cc-native-plan-review.ts` - Multi-step plan review (CLI + agents)
- `add_plan_context.ts` - Clarifying questions offer
- `plan_questions_early.ts` - Phase A clarification prompt in plan mode

### Event Sourcing Model

Context management uses event sourcing with three-layer caching:

```
events.jsonl (SOURCE OF TRUTH)
    ↓ replay events
context.json (L1 cache)
    ↓ derive
index.json (L2 cache)
```

**Data Hierarchy:**

| Level | File | Role | Recovery |
|-------|------|------|----------|
| Source of Truth | `events.jsonl` | Append-only event log | Cannot be rebuilt |
| L1 Cache | `context.json` | Current state snapshot | Rebuild from events |
| L2 Cache | `index.json` | Global context index | Rebuild from context files |

**Event Types:**
- `context_created`, `context_completed`
- `task_added`, `task_completed`
- `plan_created`, `planning_started`
- `session_bound`

### In-Flight State Machine

Tracks work status via `InFlightState` dataclass:

| Mode | Meaning | Behavior |
|------|---------|----------|
| `none` | Normal context | Show in context picker |
| `planning` | In plan mode | Continue planning |
| `pending_implementation` | Plan approved | Auto-continue implementation |
| `implementing` | Implementation active | Continue implementation |

**State Transitions:**
- `none` → `planning` (EnterPlanMode)
- `planning` → `pending_implementation` (ExitPlanMode + plan archived)
- `pending_implementation` → `implementing` (implementation tools used)

---

## Development Workflow

### Modifying Hooks

1. Edit the hook in `.aiwcli/_core/hooks/` or `.aiwcli/_cc-native/hooks/`
2. Test by running Claude Code with the modified hook
3. Synchronize to `packages/cli/src/templates/cc-native/`
4. Run tests: `cd packages/cli && npm test`

### Modifying Libraries

1. Edit the library in `.aiwcli/_core/lib-ts/` or `.aiwcli/_cc-native/lib-ts/`
2. Test dependent hooks manually
3. Synchronize to `packages/cli/src/templates/`
4. Run tests: `cd packages/cli && npm test`

### Adding New Hooks

1. Create the hook script in the appropriate directory (`.aiwcli/_core/hooks-ts/` or `.aiwcli/_cc-native/hooks/`)
2. Use `runHook()` or `runHookAsync()` as entry point
3. Add hook wiring to `.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PostToolUse": [{
         "matcher": "ToolName",
         "hooks": [{
           "type": "command",
           "command": "bun run .aiwcli/_core/hooks-ts/your-hook.ts",
           "timeout": 5000
         }]
       }]
     }
   }
   ```
4. Synchronize both the hook and settings.json to the template directory
5. Document the hook in TEMPLATE-SCHEMA.md

---

## Running Tests

All test commands run from `packages/cli/`:

```bash
cd packages/cli

npm test              # All tests (577 tests)
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

**Important:** Use `npm test`, not `bun test`. Tests use Mocha, not Bun's test framework.

---

## Watch Mode Development

For continuous development with automatic rebuilding and testing:

```bash
cd packages/cli

npm run watch         # Rebuilds code AND runs tests on changes
npm run dev:watch     # TypeScript compilation + template sync
npm run test:watch    # Mocha in watch mode
```

**Available watch scripts:**

| Script | Purpose |
|--------|---------|
| `npm run watch` | Runs `dev:watch` + `test:watch` in parallel |
| `npm run dev:watch` | TypeScript compilation + template sync |
| `npm run test:watch` | Mocha in watch mode |
| `npm run build:watch` | TypeScript compiler only |
| `npm run templates:watch` | Template file sync only |

---

## Project Structure

```
aiwcli/
├── packages/cli/           # CLI package
│   ├── src/
│   │   ├── commands/       # CLI commands (launch, init, branch)
│   │   ├── lib/            # Library code
│   │   ├── templates/      # Built-in templates (cc-native, planning-with-files)
│   │   └── types/          # TypeScript type definitions
│   └── test/               # Test files
├── examples/               # Example workflow files
├── docs/                   # Project documentation
├── .aiwcli/                # Working directory (development)
└── .claude/                # Claude Code settings
```

---

## Troubleshooting

### Tests fail with "path not found" errors

**Cause:** AIW_DIR environment variable not set

**Fix:**
1. Navigate to worktree root
2. Set AIW_DIR: `$env:AIW_DIR = $PWD.Path` (PowerShell) or `export AIW_DIR="$(pwd)"` (Bash)
3. Verify: `echo $env:AIW_DIR` should show your worktree path
4. Run tests again

### Files created in unexpected locations

**Cause:** AIW_DIR points to wrong directory

**Fix:**
1. Check current AIW_DIR: `echo $env:AIW_DIR`
2. Compare to current directory: `pwd`
3. If different, set AIW_DIR to current directory
4. Verify configuration

### Hook changes not taking effect

**Cause:** Template directory not synchronized

**Fix:** Copy modified files from `.aiwcli/` to `packages/cli/src/templates/cc-native/`

### Context recovery

**Symptom:** `context.json` appears corrupted

**Fix:** Delete context.json and it will be rebuilt from events.jsonl on next access:
```bash
rm _output/contexts/{id}/context.json
```

---

## Environment Configuration

| Environment | AIW_DIR Value | Purpose |
|-------------|---------------|---------|
| Development | `$(pwd)` (worktree root) | Isolated testing in development branch |
| Production | `~/.aiw` or `$HOME\.aiw` | Deployed global AI Workflow CLI |

---

## Deployment Checklist

Complete all items before deploying to production:

**Pre-Deployment Verification:**
- [ ] All tests passing: `npm test` (from `packages/cli/`) shows no failures
- [ ] Code review approved by team member
- [ ] Documentation updated to reflect changes
- [ ] Template directory synchronized with working directory

**Environment Configuration:**
- [ ] Set AIW_DIR to production path
  - PowerShell: `$env:AIW_DIR = "$HOME\.aiw"`
  - Bash: `export AIW_DIR="$HOME/.aiw"`

**Deployment Steps:**
- [ ] Build and publish package: `npm publish`
- [ ] Verify all features work in production environment

---

## Success Criteria

Development environment is correctly configured when:

- AIW_DIR environment variable is set and verified
- `npm test` (from `packages/cli/`) runs without errors
- All 577 tests pass
- Files are created in worktree, not in global .aiw directory
- Changes can be made without affecting production environment

---

## Development Best Practices

1. **Set AIW_DIR first** - Every development session starts with environment configuration
2. **Verify before running** - Check AIW_DIR is correct before tests or code execution
3. **Synchronize after changes** - Copy modified files to template directory
4. **Test frequently** - Run tests after each meaningful change
5. **Isolate environments** - Keep development and production strictly separated via AIW_DIR
6. **Follow patterns** - Match existing code structure and conventions
7. **Document changes** - Update TEMPLATE-SCHEMA.md when modifying hook behavior
