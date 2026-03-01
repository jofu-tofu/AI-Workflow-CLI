# /codex

| Command | Description |
|---|---|
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] plan` | Launch Codex REPL with active plan. |
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] --file <path>` | Launch Codex REPL with file contents. |
| `bun launch-codex.ts [--model fast|standard|smart|<model-id>] [--sandbox read-only|disabled] <inline text...>` | Launch Codex REPL with inline prompt. |

- `--model`: model tier (`fast`/`standard`/`smart`) resolves to `gpt-5.3-codex-spark` / `gpt-5.3-codex-think`, or any explicit Codex model id.
- `--sandbox`: `read-only` or `disabled` (default). `read-only` restricts file writes; `disabled` allows writes.
