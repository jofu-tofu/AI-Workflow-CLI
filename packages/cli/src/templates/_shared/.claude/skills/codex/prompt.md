# /codex

| Command | Description |
|---|---|
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] [--capture] plan` | Launch Codex REPL with active plan. |
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] [--capture] --file <path>` | Launch Codex REPL with file contents. |
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] [--capture] <inline text...>` | Launch Codex REPL with inline prompt. |

- `--model`: model tier (`fast`/`standard`/`smart`) resolves to `gpt-5.3-codex-spark` / `gpt-5.3-codex`, or any explicit Codex model id. Aliases: `spark`, `codex`, `gpt`.
- `--sandbox`: `read-only`, `workspace-write`, or `danger-full-access`. Default is `danger-full-access` for implementation handoffs.
- YOLO mode is **on by default** — bypasses all approvals and sandbox (`--dangerously-bypass-approvals-and-sandbox`). Use `--no-yolo` to disable.
- `--capture`: best-effort session capture. If setup succeeds, launch output includes:
  - `CODEX_CAPTURE_PANE=<pane_id>`
  - `CODEX_CAPTURE_SESSION_ID=<session_id>`
  - `CODEX_CAPTURE_SESSION_FILE=<path>`

If launch output includes `CODEX_CAPTURE_PANE` and `CODEX_CAPTURE_SESSION_ID`:

1. Parse pane/session metadata from stdout.
2. Start a background watcher:
```bash
bun .aiwcli/_shared/skills/prompt-codex/scripts/watch-codex.ts <pane_id> <session_id> <session_file>
```
Use `Bash` with `run_in_background: true`.
3. Tell the user: `Codex is running in the tmux pane. I'll receive a summary when you exit.`
4. Continue with other work; the background task output will arrive as a notification.

Watcher behavior:
- Primary: summarize from `CODEX_CAPTURE_SESSION_FILE` with Spark.
- Fallback: use `codex exec resume <session_id>` if transcript summarization fails.
