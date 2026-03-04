# Codex Skill

Launch Codex CLI in a visible pane (tmux on Unix, Windows Terminal/window fallback on native Windows) and pass the prompt at process start.

## Directory Structure

```
codex/
├── CLAUDE.md       ← This file
├── lib/
│   └── codex-watcher.ts  ← Reusable watch/summarize library
└── scripts/
    └── launch-codex.ts   ← Single entry point (launch + optional watch)
```

## Script: launch-codex.ts

> Note: This file documents template source paths (`.aiwcli/_shared/...`). During installation, settings command paths are normalized to runtime `.aiwcli/_core/...`.

**Usage:**
```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--no-yolo] [--no-watch] [--context <id>] plan
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--no-yolo] [--no-watch] [--context <id>] --file <path>
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--no-yolo] [--no-watch] [--context <id>] <inline text...>
```

**Args:**
- `plan` — discover active plan via context system, build a bootstrap startup prompt that includes the plan filepath (Codex reads that file directly)
- `--file <path>` — build a bootstrap startup prompt that includes the file path (Codex reads that file directly)
- `<text...>` — join remaining args as inline prompt
- `--model <alias|tier|id>` — Aliases: `spark` → `gpt-5.3-codex-spark`, `codex` → `gpt-5.3-codex`, `gpt` → `gpt-5.2`. Tiers: `fast`/`standard`/`smart` (resolved via `resolveModelForProvider()`). Or a full model ID.
- `--sandbox <mode>` — `read-only`, `workspace-write`, or `danger-full-access`. Default is `danger-full-access`.
- `--prompt <text>` — append extra instructions. In `plan` and `--file` modes, these are embedded into a bootstrap temp file alongside the target path.
- `--no-yolo` — Disable YOLO mode (`--dangerously-bypass-approvals-and-sandbox`).
- `--no-watch` — Disable watch/summarize mode.

**Plan discovery order:**
1. `CLAUDE_SESSION_ID` env → `getContextBySessionId()` → `findLatestPlan(contextId)`
2. Fallback: scan `_output/contexts/*/plans/*.md` by mtime

**Dependencies:**
- `base/aiw-cli.ts` — shells out to `aiw launch` for pane management (no direct tmux imports)
- `base/cli-args.ts` — model/sandbox/yolo CLI arg generation
- `context/*` — context lookup, formatting, plan discovery

**Watch behavior (single entry point):**
- Watch is enabled by default.
- `launch-codex.ts` launches Codex, waits for completion (pane close or sentinel), and prints a summary.
- Summary cascade:
  1. Spark transcript summary from session file
  2. `codex exec resume <session_id>` summary
  3. Transcript-line fallback
  4. Static `Summary unavailable` message
- Summary persistence:
  - `persistSummary()` in `codex-watcher.ts` writes to `os.tmpdir()/codex-summary-<ts>-<id>.md`
  - Called before stdout output — temp file survives even if background task capture fails
  - Best-effort: logs warning on failure, returns null, stdout output still proceeds
  - File path printed as `[summary_file:<path>]` marker for automated retrieval

**Design decisions:**
- Prompt is delivered at launch time (no tmux buffer paste/capture workflow)
- Pane backend detection delegated to `aiw launch` (tmux in-session only → inline exec fallback)
- `_shared` source only — runtime execution resolves to `.aiwcli/_core`
- Watch path is best-effort and does not change launch success semantics

## Library: lib/codex-watcher.ts

Reusable side-effect-free watch/summarize functions used by launch flow:
- `waitForPaneClose(target, timeoutMs?)` where `target` can be tmux pane id or `{ backend, paneId, sentinelPath }`
- `summarizeViaSessionFileSpark(sessionFile)`
- `summarizeViaResume(sessionId)`
- `summarizeFromSessionFileFallback(sessionFile)`
- `collectTranscriptLines(sessionFile)`

Constants and helper utilities are exported for reuse and testing (`POLL_INTERVAL_MS`, `SUMMARY_UNAVAILABLE_MESSAGE`, `normalizeText`, `looksLikeBadSummary`, etc.).

