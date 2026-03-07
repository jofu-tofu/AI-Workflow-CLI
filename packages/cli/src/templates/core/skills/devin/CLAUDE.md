# Devin Skill

Launch Devin CLI in a visible pane (tmux on Unix, fallback to exec mode) and pass the prompt at process start.

## Directory Structure

```
devin/
├── CLAUDE.md       <- This file
├── SKILL.md        <- Skill metadata (user-invocable)
├── lib/
│   └── devin-watcher.ts  <- Watch/summarize library
└── scripts/
    └── launch-devin.ts   <- Single entry point (launch + optional watch)
```

## Script: launch-devin.ts

**Usage:**
```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/devin/scripts/launch-devin.ts [--model <tier|id>] [--prompt <text>] [--no-watch] [--context <id>] plan
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/devin/scripts/launch-devin.ts [--model <tier|id>] [--prompt <text>] [--no-watch] [--context <id>] --file <path>
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/devin/scripts/launch-devin.ts [--model <tier|id>] [--prompt <text>] [--no-watch] [--context <id>] <inline text...>
```

**Args:**
- `plan` -- discover active plan via context system, build a bootstrap startup prompt
- `--file <path>` -- build a bootstrap startup prompt that includes the file path
- `<text...>` -- join remaining args as inline prompt
- `--model <name>` -- Models: `swe`, `gpt`, `opus`, `sonnet`. Tiers: `fast`/`standard`/`smart`. Or pass-through.
- `--prompt <text>` -- append extra instructions
- `--task-id <id>` -- Caller-provided task ID for direct summary file lookup. If omitted, auto-generated as `<timestamp>-<pid>`. Enables the caller to know the exact summary file path without reading background task stdout.
- `--no-watch` -- Disable watch/summarize mode

**Plan discovery order:**
1. `--context` flag or `CLAUDE_SESSION_ID` env -> context -> `findLatestPlan(contextId)`
2. Fallback: scan `_output/contexts/*/plans/*.md` by mtime

**Dependencies:**
- `runtime/aiw-cli.ts` -- shells out to `aiw launch --devin`
- `runtime/agent-launcher.ts` -- shared plan discovery, prompt construction, pane watching
- `runtime/cli-args.ts` -- Devin model resolution and invocation building
- `context/*` -- context lookup, formatting, plan discovery

**Watch behavior:**
- Watch is enabled by default
- Uses `waitForPaneClose` from shared agent-launcher
- Summary cascade: (1) `devin list --format json` metadata, (2) tmux pane scrollback capture, (3) static unavailable message
- Summary persisted to temp file via `persistSummary("devin", ...)` (unique per run)
- Also writes to well-known path: `$TMPDIR/aiw-agent-output/<session-key>/devin-<taskId>.md`
- Task ID is caller-provided via `--task-id` or auto-generated as `<timestamp>-<pid>`
- Caller can compute the exact path via `getWellKnownSummaryPath("devin", taskId)` -- no discovery needed
- Multiple concurrent agents use different task IDs, so they don't clobber each other
- Session key resolution: tmux (`$TMUX`), psmux (`psmux display-message`), exec fallback (project-root hash)
- Task ID + summary path printed early (before agent runs) so even partial stdout capture is useful

**Design decisions:**
- No sandbox/YOLO flags (Devin uses `--permission-mode` instead, defaulting to `auto`)
- Devin model short names are server-resolved (we store just the short names)
- Shared helpers from `agent-launcher.ts` (plan discovery, prompt files, pane watching)
- Session discovery uses `devin list --format json` + `~/.config/cognition/cli/` file scanning

## Library: lib/devin-watcher.ts

Session discovery and summarization:
- `findDevinSession(projectRoot, launchStartedAtMs)` -- discover session via `devin list` or file scanning
- `summarizeDevinSession(transcript)` -- AI inference summary
- `capturePaneScrollback(paneId)` -- tmux pane capture fallback

Re-exports `persistSummary`, `waitForPaneClose` from agent-launcher.

<!-- context-layer: generated=2026-03-06 | last-audited=2026-03-07 | version=2 -->
