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
| `.aiwcli/_shared/hooks/*.py` | `packages/cli/src/templates/cc-native/_shared/hooks/` |
| `.aiwcli/_shared/lib/**/*.py` | `packages/cli/src/templates/cc-native/_shared/lib/` |
| `.aiwcli/_cc-native/**/*.py` | `packages/cli/src/templates/cc-native/_cc-native/` |
| `.claude/settings.json` | `packages/cli/src/templates/cc-native/.claude/settings.json` |

### Directory Structure

```
.aiwcli/
├── _shared/                    # Cross-method infrastructure
│   ├── hooks/                  # Shared hook scripts
│   │   ├── user_prompt_submit.py    # Context binding, task hydration
│   │   ├── context_monitor.py       # Context usage monitoring
│   │   ├── context_enforcer.py      # Context enforcement
│   │   ├── archive_plan.py          # Plan archival on ExitPlanMode
│   │   ├── task_create_capture.py   # Task persistence
│   │   └── task_update_capture.py   # Task status changes
│   └── lib/
│       ├── base/               # Core utilities
│       │   ├── atomic_write.py      # Cross-platform crash-safe writes
│       │   ├── constants.py         # Security constants, paths
│       │   ├── inference.py         # Inference model utilities
│       │   └── utils.py             # Common functions
│       ├── context/            # Context management
│       │   ├── context_manager.py   # CRUD operations (1,169 lines)
│       │   ├── event_log.py         # JSONL append/read
│       │   ├── cache.py             # Cache rebuild
│       │   ├── discovery.py         # Context discovery
│       │   ├── task_sync.py         # Task persistence
│       │   └── plan_archive.py      # Plan archival
│       ├── handoff/            # Session handoff
│       │   └── document_generator.py
│       └── templates/          # Output formatters
│           ├── formatters.py        # Mode displays, icons, task rendering
│           └── plan_context.py      # Plan evaluation templates
│
└── _cc-native/                 # Method-specific code
    ├── hooks/
    │   ├── cc-native-plan-review.py     # Multi-step plan review
    │   ├── suggest-fresh-perspective.py # Stuck detection
    │   └── add_plan_context.py          # Clarifying questions offer
    ├── lib/
    │   ├── orchestrator.py      # Multi-agent orchestration
    │   ├── async_archive.py     # Non-blocking plan archive
    │   └── reviewers/           # Plan review implementations
    │       ├── base.py              # Abstract base reviewer
    │       ├── agent.py             # Claude Code agent reviewer
    │       ├── codex.py             # Codex CLI reviewer
    │       └── gemini.py            # Google Gemini reviewer
    └── plan-review.config.json  # Plan review configuration

_output/
├── index.json                   # Global context cache
└── contexts/                    # Event-sourced context management
    └── {context-id}/
        ├── events.jsonl         # SOURCE OF TRUTH (append-only)
        ├── context.json         # Derived cache
        └── plans/               # Archived approved plans
```

### Hook System

Hooks are Python scripts triggered by Claude Code lifecycle events. Configuration lives in `.claude/settings.json`.

**Hook Lifecycle Events:**

| Event | When Triggered | Example Hooks |
|-------|----------------|---------------|
| `UserPromptSubmit` | User sends message | `user_prompt_submit.py` (context binding, task hydration) |
| `PreToolUse` | Before tool executes | `cc-native-plan-review.py` (plan validation) |
| `PostToolUse` | After tool completes | `context_monitor.py` (context tracking), `archive_plan.py` |

**Shared Hooks** (`.aiwcli/_shared/hooks/`):
- `user_prompt_submit.py` - Context enforcement, session binding, task hydration
- `context_monitor.py` - Context usage monitoring (40% warning, 25% urgent)
- `context_enforcer.py` - Determines active context, blocks if needed
- `archive_plan.py` - Archives approved plans on ExitPlanMode
- `task_create_capture.py` - Captures task creation events
- `task_update_capture.py` - Captures task status changes

**Method-Specific Hooks** (`.aiwcli/_cc-native/hooks/`):
- `cc-native-plan-review.py` - Multi-step plan review (CLI + agents)
- `suggest-fresh-perspective.py` - Stuck detection (error/edit/test thresholds)
- `add_plan_context.py` - Offers clarifying questions on first plan write

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

1. Edit the hook in `.aiwcli/_shared/hooks/` or `.aiwcli/_cc-native/hooks/`
2. Test by running Claude Code with the modified hook
3. Synchronize to `packages/cli/src/templates/cc-native/`
4. Run tests: `cd packages/cli && npm test`

### Modifying Libraries

1. Edit the library in `.aiwcli/_shared/lib/` or `.aiwcli/_cc-native/lib/`
2. Test dependent hooks manually
3. Synchronize to `packages/cli/src/templates/cc-native/`
4. Run tests: `cd packages/cli && npm test`

### Adding New Hooks

1. Create the hook script in the appropriate directory
2. Add hook wiring to `.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PostToolUse": [{
         "matcher": "ToolName",
         "hooks": [{
           "type": "command",
           "command": "python .aiwcli/_shared/hooks/your-hook.py",
           "timeout": 5000
         }]
       }]
     }
   }
   ```
3. Synchronize both the hook and settings.json to the template directory
4. Document the hook in TEMPLATE-SCHEMA.md

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
│   │   ├── templates/      # Built-in templates (bmad, cc-native, gsd)
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
