# /codex

| Command | Description |
|---|---|
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] plan` | Launch Codex REPL with active plan. |
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] --file <path>` | Launch Codex REPL with file contents. |
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|workspace-write|danger-full-access] [--no-yolo] <inline text...>` | Launch Codex REPL with inline prompt. |

- `--model`: model tier (`fast`/`standard`/`smart`) resolves to `gpt-5.3-codex-spark` / `gpt-5.3-codex`, or any explicit Codex model id. Aliases: `spark`, `codex`, `gpt`.
- `--sandbox`: `read-only`, `workspace-write`, or `danger-full-access`. Default is `danger-full-access` for implementation handoffs.
- YOLO mode is **on by default** — bypasses all approvals and sandbox (`--dangerously-bypass-approvals-and-sandbox`). Use `--no-yolo` to disable.
