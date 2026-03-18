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

## Devin CLI Contract (verified 2026-03-08)

**Always re-verify against the real CLI before changing assumptions.**
Run `devin list --format json`, `devin --help`, and inspect `~/.local/share/devin/cli/sessions.db` to confirm.

### `devin list --format json` output schema

```jsonc
{
  "id": "uuid",                  // full session UUID
  "short_id": "8-char-hex",
  "title": "string",            // user prompt or session title
  "working_directory": "/abs/path",   // NOT "cwd"
  "working_directory_display": "~/relative",
  "last_activity_at": 1772942203,     // unix timestamp SECONDS — NOT ISO string, NOT "created_at"
  "last_activity_ago": "10h ago"
}
```

Fields that do **NOT** exist: `cwd`, `created_at`, `status`, `model`, `session_id`.

### Session data storage

- **SQLite DB:** `~/.local/share/devin/cli/sessions.db`
  - `sessions` table: `id`, `working_directory`, `model`, `created_at` (integer), `last_activity_at`, `title`, `main_chain_id`, `cogs_json`
  - `message_nodes` table: `session_id`, `node_id`, `chat_message` (JSON with `{role, content}`)
  - Full conversation transcript (user, assistant, system, tool messages) stored in `message_nodes`
- **Summary files:** `~/.local/share/devin/cli/summaries/history_<hex>.md` — full session transcripts, NOT Devin-specific (shared with Claude Code sessions). No reliable session-to-file mapping exists.
- **NOT stored at:** `~/.config/devin/cli/` (only has `config.json`, no session data)

### Devin CLI flags

- `--prompt-file <FILE>` — load prompt from file (NOT positional arg)
- `--model <MODEL>` — short names: `opus`, `sonnet`, `swe`, `gpt` (server-resolved)
- `--permission-mode <MODE>` — `auto` (default) or `dangerous`
- `-p, --print` — non-interactive mode
- `-r, --resume [SESSION_ID]` — resume session
- No `--sandbox` or `--yolo` flags (unlike Codex)

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
- Summary cascade: (1) `devin list` -> session ID -> SQLite `message_nodes` transcript, (2) tmux pane scrollback capture, (3) static unavailable message
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

## Library: lib/devin-watcher.ts

Session discovery and summarization:
- `summarizeDevinSession(projectRoot, launchStartedAtMs, paneId?)` -- full discovery + summary pipeline
- `collectTranscriptFromDb(sessionId)` -- extract user/assistant messages from SQLite `message_nodes` (uses `python3 -c` to avoid native module dependency)
- `findDevinSessionViaList(projectRoot, launchStartedAtMs)` -- match session via `devin list --format json` using `working_directory` + `last_activity_at`
- `capturePaneScrollback(paneId)` -- tmux pane capture fallback

Re-exports `persistSummary`, `waitForPaneClose` from agent-launcher.

---
## Context Maintenance

**After modifying files in this directory:** scan the entries above -- if any claim is now
false or incomplete, update this file before ending the task. Do not defer.

**Verification rule:** When changing code that depends on external CLI output formats (field names,
data types, storage paths), **always verify against the real CLI** before committing. Run the
actual command and inspect the output. Do not assume field names or paths from memory or from
other similar tools.

<!-- context-layer: generated=2026-03-06 | last-audited=2026-03-08 | version=3 -->
