# AI Workflow CLI

**A context management and hook harness that multiplies the power of Claude Code.**

[![npm](https://img.shields.io/npm/v/aiwcli.svg)](https://npmjs.org/package/aiwcli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What AIW Does

AIW wraps Claude Code with infrastructure that it doesn't have natively: **persistent context across sessions**, **automated lifecycle hooks**, and **pluggable workflow templates**. You install it once into a project, and every Claude Code session from that point forward gets:

- **Context that survives `/clear` and compaction** — AIW tracks what you're working on, which plan you approved, what tasks remain, and restores all of it when a new session starts. No more re-explaining.
- **A hook system that automates the boring parts** — 13 TypeScript hooks (run via Bun) fire on Claude Code lifecycle events (session start, prompt submit, tool use, plan exit, session end). They archive plans, track tasks, monitor context window usage, suggest relevant files, and manage state transitions — automatically.
- **Workflow templates you can swap** — Four template methods (cc-native, bmad, gsd, planning-with-files) provide different development philosophies. Each brings its own hooks, workflows, agents, and libraries. Install one, switch later, or build your own.
- **Parallel workstreams via git worktrees** — Branch into isolated worktrees with their own Claude Code sessions. Work on three features simultaneously without stashing.

---

## Quick Start

```bash
# Install globally
npm install -g aiwcli

# Initialize in your project (cc-native is the recommended template)
cd your-project
aiw init --method cc-native

# Launch Claude Code with AIW hooks active
aiw launch
```

That's it. The hook system activates automatically. Your sessions now have persistent context, plan tracking, and automated state management.

---

## Commands

| Command | Description |
|---------|-------------|
| `aiw init` | Install templates into your project. `--method cc-native` for full setup (defaults to all IDEs discovered in core + template), or bare `aiw init` for core infrastructure only. `--interactive` for guided setup. |
| `aiw launch` | Launch Claude Code with hooks enabled. Defaults to tmux-first launch on non-Windows hosts (when outside tmux) and creates a fresh tmux session each run. On Windows, launches in the current terminal by default. Use `--codex` for Codex (AIW forces Codex `shell_type="bash"` on Windows), `--devin` for Devin CLI, `--new` for a new terminal window (`--codex --new` prefers Git Bash and falls back to PowerShell), `--no-tmux` to run directly, or `--tmux-session` to reuse a named tmux session. |
| `aiw branch <name>` | Create a git worktree + branch in a sibling directory, auto-launch Claude Code in it. |
| `aiw branch --delete --all` | Safely remove worktrees with no unpushed commits or open PRs. |
| `aiw clean` | Remove output folders (`_output/`). `--method cc-native` for one method, `--all` for everything. |
| `aiw clear` | Comprehensive uninstall — removes workflow folders, output, IDE config, and updates settings. |

Run `aiw help` or `aiw help <command>` for full flag details.

If you want `codex` or `devin` to route through AIW launch defaults, add shell aliases:

```bash
alias codex='aiw launch --codex'
alias devin='aiw launch --devin'
```

---

## Template System

AIW uses a two-layer template architecture:

**Core infrastructure** (`core/` source, installed as `.aiwcli/_core/`) is installed by every template method. It provides the context management system, session lifecycle hooks, task tracking, and core libraries. This is the foundation.

**Method-specific code** (`_cc-native/`, `_bmad/`, etc.) adds workflows, agents, hooks, and libraries tailored to a specific development philosophy.

### Available Methods

| Method | Philosophy | What It Adds |
|--------|-----------|--------------|
| **cc-native** | Native Claude Code power features — planning, review, agents | Plan review pipeline, stuck detection, early clarification prompts, plan context injection |
| **bmad** | Build-Measure-Analyze-Deploy — multi-agent team | Analyst, Architect, Dev, PM, Tech Writer, UX Designer agents |
| **gsd** | Get Stuff Done — streamlined productivity | Unified review system, goal-staged workflows |
| **planning-with-files** | Manus-style file-based planning | File-based project planning with session hooks |

```bash
# Install a specific method
aiw init --method cc-native

# Interactive setup (choose method, IDE, settings)
aiw init --interactive

# Multiple IDEs
aiw init --method cc-native --ide claude --ide windsurf

# If an IDE isn't available for the selected method, it's skipped with a warning
aiw init --method cc-native --ide claude --ide codex
```

### What Gets Installed

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

Hooks are TypeScript scripts (run via Bun) that fire on Claude Code lifecycle events. They're configured in `.claude/settings.json` and run automatically — no manual intervention.

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

### CC-Native Hooks (cc-native method)

| Hook | Event | What It Does |
|------|-------|-------------|
| `cc-native-plan-review.ts` | PreToolUse:ExitPlanMode | Multi-reviewer plan analysis before approval |
| `plan_questions_early.ts` | UserPromptSubmit (plan mode) | Prompts clarification questions before code exploration |
| `add_plan_context.ts` | PostToolUse:AskUserQuestion | Tracks questions asked, nudges planning agents |

All hooks use `runHook()` for standardized lifecycle logging and error handling. Diagnostic logs go to `_output/hook-log.jsonl` (JSONL format).

---

## Context Management

This is the core of AIW. Claude Code sessions are ephemeral — when you `/clear` or the context window compacts, everything is lost. AIW fixes this.

### How It Works

Every piece of work gets a **context** — a persistent state container that tracks:

- What you're working on (summary, tags, method)
- Which sessions have touched it
- Your approved plan (archived, hashed, ready to restore)
- Your task list (persisted across sessions)
- Handoff documents (for session transitions)
- Mode state (idle, active, has_plan, has_handoff)

### The State Machine

Contexts move through modes that control what happens at session boundaries:

```
idle → active (user starts working)
active → has_plan (session ends with an approved plan)
has_plan → active (next session restores the plan)
active → has_handoff (session ends with a handoff document)
has_handoff → active (next session restores the handoff)
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
├── index.json                    # Global session→context index
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

Templates live in `packages/cli/src/templates/`. At `aiw init`, the CLI:

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
  → session_start.ts: bind session, restore context/plan/tasks

User sends message (UserPromptSubmit)
  → user_prompt_submit.ts: select or create context
  → file-suggestion.ts: suggest relevant files

Claude uses tools (PreToolUse / PostToolUse)
  → Hooks fire per tool (plan review, task capture, context monitoring)

Session ends (SessionEnd)
  → session_end.py: save state, stage plan/handoff for next session
```

---

## Installation

```bash
npm install -g aiwcli
```

**Requirements:**
- Node.js 18+
- Git (for worktree features)
- Bun (for TypeScript hooks)
- Claude Code (primary), Windsurf, or GitHub Copilot

---

## Contributing

```bash
git clone https://github.com/jofu-tofu/AI-Workflow-CLI.git
cd AI-Workflow-CLI
bun install
bun test
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for environment setup, template synchronization rules, and testing.

### Template Development

When modifying hooks or libraries in `.aiwcli/`, changes must be synchronized to `packages/cli/src/templates/`. See [CLAUDE.md](./CLAUDE.md) for the synchronization protocol.

---

## Documentation

- **[Development Guide](./DEVELOPMENT.md)** — Local setup, testing, template sync
- **[Template Guide](./docs/TEMPLATE-USER-GUIDE.md)** — Creating your own templates
- **[Best Practices](./docs/BEST-PRACTICES.md)** — Patterns and tips

---

## License

MIT © 2026 jofu-tofu

---

[GitHub](https://github.com/jofu-tofu/AI-Workflow-CLI) · [npm](https://npmjs.com/package/aiwcli) · [Issues](https://github.com/jofu-tofu/AI-Workflow-CLI/issues)
