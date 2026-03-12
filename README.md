# AI Workflow CLI

My personal context management and hook harness for Claude Code. This wraps Claude Code with infrastructure it doesn't have natively -- persistent context across sessions, automated lifecycle hooks, and pluggable workflow templates.

The repo is public so others can reference or borrow from it, but the system is deeply entrenched in my personal workflow and not designed for general distribution.

---

## What It Does

Every Claude Code session launched through AIW gets:

- **Context that survives `/clear` and compaction** -- tracks what I'm working on, which plan was approved, what tasks remain, and restores all of it when a new session starts.
- **A hook system that automates the boring parts** -- 13 TypeScript hooks (run via Bun) fire on Claude Code lifecycle events (session start, prompt submit, tool use, plan exit, session end). They archive plans, track tasks, monitor context window usage, suggest relevant files, and manage state transitions.
- **Workflow templates I can swap** -- two template methods (`cc-native` and `planning-with-files`) provide different development philosophies. Each brings its own hooks, workflows, agents, and libraries.
- **Parallel workstreams via git worktrees** -- branch into isolated worktrees with their own Claude Code sessions.

---

## Commands

| Command | Description |
|---------|-------------|
| `aiw init` | Install templates into a project. `--method cc-native` for full setup, or bare `aiw init` for core infrastructure only. `--interactive` for guided setup. |
| `aiw launch` | Launch Claude Code with hooks enabled. Defaults to tmux-first on non-Windows. `--codex` for Codex, `--devin` for Devin CLI, `--new` for a new terminal window, `--no-tmux` to run directly. |
| `aiw branch <name>` | Create a git worktree + branch in a sibling directory, auto-launch Claude Code in it. |
| `aiw branch --delete --all` | Remove worktrees with no unpushed commits or open PRs. |
| `aiw clean` | Remove output folders (`_output/`). `--method cc-native` for one method, `--all` for everything. |
| `aiw clear` | Comprehensive uninstall -- removes workflow folders, output, IDE config, and updates settings. |

Shell aliases for convenience:

```bash
alias codex='aiw launch --codex'
alias devin='aiw launch --devin'
```

---

## Template System

Two-layer template architecture:

**Core infrastructure** (`core/` source, installed as `.aiwcli/_core/`) is installed by every template method. Provides context management, session lifecycle hooks, task tracking, and core libraries.

**Method-specific code** (`_cc-native/`, etc.) adds workflows, agents, hooks, and libraries tailored to a specific development philosophy.

### Methods

| Method | Philosophy | What It Adds |
|--------|-----------|--------------|
| **cc-native** | Native Claude Code power features -- planning, review, agents | Plan review pipeline, stuck detection, early clarification prompts, plan context injection |
| **planning-with-files** | Manus-style file-based planning | File-based project planning with session hooks |

### Installed Structure

```
.aiwcli/
├── _core/                    # Always installed (context, hooks, libraries)
│   ├── hooks-ts/                # TypeScript hooks (session lifecycle, context, tasks)
│   └── lib-ts/                  # base/, context/, handoff/, templates/
└── _cc-native/                  # Method-specific (varies by method)
    ├── hooks/                   # Plan review, stuck detection, etc.
    ├── lib-ts/                  # Method utilities
    └── workflows/               # Canonical procedures

.claude/
├── settings.json                # Hook configuration (merged from templates)
└── commands/{method}/           # Slash commands for Claude Code

.codex/
└── skills/                      # Codex skill wrappers (core templates)
```

---

## Hook System

Hooks are TypeScript scripts (run via Bun) that fire on Claude Code lifecycle events. Configured in `.claude/settings.json`, run automatically.

### Shared Hooks (all methods)

| Hook | Event | What It Does |
|------|-------|-------------|
| `session_start.ts` | SessionStart | Restores context, plan, tasks, and git state when a session begins |
| `session_end.ts` | SessionEnd | Saves session state, stages plan/handoff for next session |
| `user_prompt_submit.ts` | UserPromptSubmit | Binds session to context, enforces context tracking |
| `archive_plan.ts` | PermissionRequest:ExitPlanMode | Archives approved plan files for persistence |
| `task_create_capture.ts` | PostToolUse:TaskCreate | Persists task creation to context state |
| `task_update_capture.ts` | PostToolUse:TaskUpdate | Persists task status changes to context state |
| `context_monitor.ts` | PostToolUse | Monitors context window usage, warns when running low |
| `file-suggestion.ts` | UserPromptSubmit | Suggests relevant files based on active context |
| `pre_compact.ts` | PreCompact | Saves state before Claude Code compacts token history |

### CC-Native Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| `cc-native-plan-review.ts` | PreToolUse:ExitPlanMode | Multi-reviewer plan analysis before approval |
| `plan_questions_early.ts` | UserPromptSubmit (plan mode) | Prompts clarification questions before code exploration |
| `add_plan_context.ts` | PostToolUse:AskUserQuestion | Tracks questions asked, nudges planning agents |

All hooks use `runHook()` for standardized lifecycle logging and error handling. Diagnostic logs go to `_output/hook-log.jsonl`.

---

## Context Management

Claude Code sessions are ephemeral -- when you `/clear` or the context window compacts, everything is lost. This fixes that.

### How It Works

Every piece of work gets a **context** -- a persistent state container that tracks:

- What I'm working on (summary, tags, method)
- Which sessions have touched it
- Approved plan (archived, hashed, ready to restore)
- Task list (persisted across sessions)
- Handoff documents (for session transitions)
- Mode state (idle, active, has_plan, has_handoff)

### State Machine

```
idle -> active (start working)
active -> has_plan (session ends with an approved plan)
has_plan -> active (next session restores the plan)
active -> has_handoff (session ends with a handoff document)
has_handoff -> active (next session restores the handoff)
```

**One-shot latches** (`plan_consumed`, `handoff_consumed`) prevent infinite re-staging. A plan is restored once, then marked consumed.

### Two-Layer State Architecture

| Layer | File | Role |
|-------|------|------|
| **Source of Truth** | `_output/contexts/{id}/state.json` | Per-context state (mode, plan, tasks, sessions) |
| **Fast Lookup** | `_output/index.json` | Session-to-context mapping for O(1) binding |

Both layers use atomic writes with retry logic for crash safety on Windows and POSIX.

### Context Directory Structure

```
_output/
├── index.json                    # Global session->context index
├── hook-log.jsonl                # Diagnostic logs
└── contexts/
    └── {context-id}/
        ├── state.json            # Source of truth
        ├── debug/hook-log.jsonl  # Per-context logs
        ├── plans/                # Archived plan files
        └── handoffs/             # Handoff documents
```

---

## Architecture

### Template Resolution

Templates live in `packages/cli/src/templates/`. At `aiw init`:

1. Copies `core/` into `.aiwcli/_core/` (always)
2. Copies method folder (e.g., `_cc-native/`) into `.aiwcli/` (if method specified)
3. Deep-merges settings from `core/.claude/settings.json` + method settings into `.claude/settings.json`
4. Copies IDE-specific folders (`.claude/commands/`, `.codex/skills/`, `.windsurf/workflows/`)
5. Updates `.gitignore`

### Hook Execution

Hooks run as Bun subprocesses (TypeScript), triggered by Claude Code's native hook system. They receive context via stdin (JSON) and return instructions via stdout (JSON). The `runHook()` wrapper provides:

- Automatic `HOOK_START` / `HOOK_END` lifecycle logging
- Error capture with traceback
- Duration tracking
- Template origin detection (shared vs. method-specific)

### Session Lifecycle

```
Session starts (SessionStart)
  -> session_start.ts: bind session, restore context/plan/tasks

User sends message (UserPromptSubmit)
  -> user_prompt_submit.ts: select or create context
  -> file-suggestion.ts: suggest relevant files

Claude uses tools (PreToolUse / PostToolUse)
  -> Hooks fire per tool (plan review, task capture, context monitoring)

Session ends (SessionEnd)
  -> session_end.py: save state, stage plan/handoff for next session
```

---

## Requirements

- Node.js 18+
- Git (for worktree features)
- Bun (for TypeScript hooks)
- Claude Code (primary), Windsurf, or GitHub Copilot

---

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for environment setup, template synchronization rules, and testing.

---

## Further Reading

- **[Development Guide](./DEVELOPMENT.md)** -- local setup, testing, template sync
- **[Template Guide](./docs/TEMPLATE-USER-GUIDE.md)** -- template anatomy and creation
- **[Best Practices](./docs/BEST-PRACTICES.md)** -- patterns and tips
- **[Core Infrastructure](./docs/CORE-INFRASTRUCTURE-OVERVIEW.md)** -- context management deep dive

---

MIT
