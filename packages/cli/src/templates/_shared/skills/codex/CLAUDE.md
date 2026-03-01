# Codex Skill

Launch Codex CLI in a tmux pane and inject a prompt into its REPL.

## Directory Structure

```
codex/
├── CLAUDE.md       ← This file
└── scripts/
    ├── launch-codex.ts  ← CLI entry point
    └── watch-codex.ts   ← Capture watcher and summarizer
```

## Script: launch-codex.ts

**Usage:**
```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--full-auto] plan
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--full-auto] --file <path>
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--full-auto] <inline text...>
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--full-auto] [--capture] <mode>
```

**Args:**
- `plan` — discover active plan via context system, inject into Codex REPL
- `--file <path>` — inject file contents into Codex REPL
- `<text...>` — join remaining args as inline prompt, write to temp file, inject
- `--model <alias|tier|id>` — Aliases: `spark` → `gpt-5.3-codex-spark`, `codex` → `gpt-5.3-codex`, `gpt` → `gpt-5.2`. Tiers: `fast`/`standard`/`smart` (resolved via `resolveModelForProvider()`). Or any full model ID. Aliases are checked first (local `CODEX_ALIASES` constant in `launch-codex.ts`), then tiers, then pass-through. Omitted = Codex default.
- `--sandbox <mode>` — `read-only`, `workspace-write`, or `danger-full-access`. Default is `danger-full-access` for implementation handoffs.
- `--prompt <text>` — append extra instructions under `## Additional Instructions` after the main prompt body.
- `--no-yolo` — Disable YOLO mode (on by default). YOLO maps to Codex CLI's `--dangerously-bypass-approvals-and-sandbox`. Use `--no-yolo` to restore normal approval prompts.
- `--capture` — Best-effort session capture. On success, prints:
  - `CODEX_CAPTURE_PANE=<pane_id>`
  - `CODEX_CAPTURE_SESSION_ID=<session_id>`
  - `CODEX_CAPTURE_SESSION_FILE=<session_file>`
  These are consumed by the skill prompt to run `watch-codex.ts` as a background task.

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

## Script: watch-codex.ts

**Usage:**
```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/watch-codex.ts <pane_id> <session_id> <session_file>
```

**Behavior:**
- Polls tmux until `<pane_id>` closes
- Primary: parses `<session_file>` transcript and summarizes via Spark (`inference()` + `CODEX_MODELS.spark`)
- Fallback: runs `codex exec resume <session_id>` if transcript summarization fails
- Final fallback: emits concise transcript lines directly from `<session_file>`

**Resilience policy:**
- Capture path is best-effort and never blocks Codex launch
- Watcher exits cleanly on poll/summary/parse failures with fallback text
