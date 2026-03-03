# /codex

## Role

You are the orchestrator. Each Codex launch spawns an implementation sub-agent. Delegate implementation work to Codex, then review results when summaries arrive.

The script blocks until Codex exits and prints a session summary. Run with Bash `run_in_background: true` so you stay unblocked and receive the summary as a background task notification.

## Command

```
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [flags] <mode>
```

**Modes:** `plan` | `--file <path>` | `<inline text...>`

`plan` and `--file` modes pass a filepath-first bootstrap prompt so Codex reads the file from disk instead of relying on a pasted full document.

**Flags:**
- `--context <id>` — Project orientation for the sub-agent. Pass when implementing a plan so Codex understands the project structure.
- `--prompt <text>` — Add extra instructions. In `plan`/`--file` mode, this is embedded into the bootstrap temp file with the target path.
- `--model <name>` — Aliases: `spark`, `codex`, `gpt`. Tiers: `fast`, `standard`, `smart`. Or unknown full model ID.
- `--sandbox <mode>` — `read-only`, `workspace-write`, `danger-full-access`.
- `--no-yolo` — Disable YOLO mode (on by default).
- `--no-watch` — Fire-and-forget: exit immediately after launch, skip waiting for summary.

## Retrieving Results

The script prints a summary to stdout and writes it to a temp file.

**Primary:** Check TaskOutput for the background task — the summary and file path are inline.

**Fallback (if TaskOutput is empty):** Look for the `[summary_file:<path>]` line in the output. If found, read that file path directly. The temp file persists independently of Claude Code's background task capture.

If neither is available, check `_output/hook-log.jsonl` for `codex-capture` or `codex-skill` entries for diagnostics.

## Delegation Patterns

### One-shot

For small or tightly coupled plans. One sub-agent implements the whole plan.

```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts --context <ctx-id> plan
```

Run with `run_in_background: true`. Wait for the summary. Review the changes.

### Parallel

For plans with independent sections, create small section-brief files and launch one sub-agent per brief with `--file`.

Run each with `run_in_background: true`. Summaries arrive as separate background task notifications. When all complete, review for conflicts between agents, then verify with tests or import checks.

### Ad-hoc

For tasks outside a plan. Pass inline text or a file path.

```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts \
  "Fix the failing test in auth.ts"

bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts \
  --file path/to/task-description.md
```

## Orchestrator Checklist

- **Delegate implementation.** If the work involves writing code and Codex can handle it, send it to Codex.
- **Split independent sections** into parallel sub-agents for faster execution.
- **Pass `--context`** when implementing a plan — Codex needs project orientation to make good decisions.
- **Scope parallel agents with separate `--file` briefs** so each sub-agent has an explicit task boundary.
- **Review results** when summaries arrive. Check for merge conflicts between parallel agents, then verify with `tsc --noEmit`, tests, or manual inspection.

