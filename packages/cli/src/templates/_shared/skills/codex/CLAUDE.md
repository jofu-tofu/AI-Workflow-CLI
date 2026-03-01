# Codex Skill

Launch Codex CLI in a tmux pane and inject a prompt into its REPL.

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

**Usage:**
```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--no-yolo] [--no-watch] [--context <id>] plan
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--no-yolo] [--no-watch] [--context <id>] --file <path>
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [--model <tier|id>] [--sandbox <sandbox-mode>] [--prompt <text>] [--no-yolo] [--no-watch] [--context <id>] <inline text...>
```

**Args:**
- `plan` — discover active plan via context system, inject into Codex REPL
- `--file <path>` — inject file contents into Codex REPL
- `<text...>` — join remaining args as inline prompt, write to temp file, inject
- `--model <alias|tier|id>` — Aliases: `spark` → `gpt-5.3-codex-spark`, `codex` → `gpt-5.3-codex`, `gpt` → `gpt-5.2`. Tiers: `fast`/`standard`/`smart` (resolved via `resolveModelForProvider()`). Or any full model ID. Aliases are checked first (local `CODEX_ALIASES` constant in `launch-codex.ts`), then tiers, then pass-through. Omitted = Codex default.
- `--sandbox <mode>` — `read-only`, `workspace-write`, or `danger-full-access`. Default is `danger-full-access` for implementation handoffs.
- `--prompt <text>` — append extra instructions under `## Additional Instructions` after the main prompt body.
- `--no-yolo` — Disable YOLO mode (on by default). YOLO maps to Codex CLI's `--dangerously-bypass-approvals-and-sandbox`. Use `--no-yolo` to restore normal approval prompts.
- `--no-watch` — Disable watch/summarize mode. Launch exits immediately after Codex starts.

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

**Watch behavior (single entry point):**
- Watch is enabled by default.
- `launch-codex.ts` launches Codex, waits for pane close (or timeout), and prints a summary.
- Summary cascade:
  1. Spark transcript summary from session file
  2. `codex exec resume <session_id>` summary
  3. Transcript-line fallback
  4. Static `Summary unavailable` message
- Watch flow is best-effort and does not change launch success semantics.

**Design decisions:**
- Always creates a new tmux pane (no pane reuse/tracking)
- No exec fallback — REPL mode requires tmux
- `_shared` only — never imports from `_cc-native`
- Temp file cleanup after injection confirmed

## Library: lib/codex-watcher.ts

Reusable side-effect-free watch/summarize functions used by launch flow:
- `waitForPaneClose(paneId, timeoutMs?)`
- `summarizeViaSessionFileSpark(sessionFile)`
- `summarizeViaResume(sessionId)`
- `summarizeFromSessionFileFallback(sessionFile)`
- `collectTranscriptLines(sessionFile)`

Constants and helper utilities are exported for reuse and testing (`POLL_INTERVAL_MS`, `SUMMARY_UNAVAILABLE_MESSAGE`, `normalizeText`, `looksLikeBadSummary`, etc.).

**Resilience policy:**
- Watch path is best-effort and never fails a successful launch
- Pane-wait timeout defaults to 4 hours; when reached, summarization continues with available transcript state
- Summary functions degrade through layered fallbacks and end with static message
