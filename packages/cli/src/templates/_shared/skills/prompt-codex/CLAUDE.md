# Prompt Codex Skill

Launch Codex CLI in a tmux pane and inject a prompt into its REPL.

## Directory Structure

```
prompt-codex/
├── CLAUDE.md       ← This file
└── scripts/
    └── launch-codex.ts  ← CLI entry point
```

## Script: launch-codex.ts

**Usage:**
```bash
bun .aiwcli/_shared/skills/prompt-codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--full-auto] plan
bun .aiwcli/_shared/skills/prompt-codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--full-auto] --file <path>
bun .aiwcli/_shared/skills/prompt-codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--full-auto] <inline text...>
```

**Args:**
- `plan` — discover active plan via context system, inject into Codex REPL
- `--file <path>` — inject file contents into Codex REPL
- `<text...>` — join remaining args as inline prompt, write to temp file, inject
- `--model <alias|tier|id>` — Aliases: `spark` → `gpt-5.3-codex-spark`, `codex` → `gpt-5.3-codex`, `gpt` → `gpt-5.2`. Tiers: `fast`/`standard`/`smart` (resolved via `resolveModelForProvider()`). Or any full model ID. Aliases are checked first (local `CODEX_ALIASES` constant in `launch-codex.ts`), then tiers, then pass-through. Omitted = Codex default.
- `--sandbox <mode>` — `read-only`, `workspace-write`, or `danger-full-access`. Default is `danger-full-access` for implementation handoffs.
- `--no-yolo` — Disable YOLO mode (on by default). YOLO maps to Codex CLI's `--dangerously-bypass-approvals-and-sandbox`. Use `--no-yolo` to restore normal approval prompts.

**Plan discovery order:**
1. `CLAUDE_SESSION_ID` env → `getContextBySessionId()` → `findLatestPlan(contextId)`
2. Fallback: scan `_output/contexts/*/plans/*.md` by mtime (inline, no `_cc-native` import)

**Dependencies (all from `_shared/lib-ts/`):**
- `base/tmux-driver.ts` — `launchDriverInTmuxOrFallback()`, `getTmuxAvailability()`
- `base/cli-args.ts` — `resolveCodexModel()`, `codexReplSpec()`, `buildCliInvocation()`, `isCodexSandbox()`
- `base/logger.ts` — `logDebug()`, `logWarn()` (injection diagnostics)
- `context/context-store.ts` — `getContextBySessionId()`
- `context/context-formatter.ts` — `buildExternalAgentContext()` (orientation header for Codex)
- `context/plan-manager.ts` — `findLatestPlan()`

**Design decisions:**
- Always creates a new tmux pane (no pane reuse/tracking)
- No exec fallback — REPL mode requires tmux
- `_shared` only — never imports from `_cc-native`
- Temp file cleanup after injection confirmed
