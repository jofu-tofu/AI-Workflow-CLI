# /codex

## Role

You are the orchestrator. Each Codex launch spawns an implementation sub-agent. Delegate implementation work to Codex, then review results when summaries arrive.

The script blocks until Codex exits and prints a session summary. Run with Bash `run_in_background: true` so you stay unblocked and receive the summary as a background task notification.

## Command

```
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [flags] <mode>
```

**Modes:** `plan` | `--file <path>` | `<inline text...>`

**Flags:**
- `--context <id>` — Project orientation for the sub-agent. Pass when implementing a plan so Codex understands the project structure.
- `--prompt <text>` — Scope the agent's work. Direct each instance to a specific plan section or task.
- `--model <name>` — Aliases: `spark`, `codex`, `gpt`. Tiers: `fast`, `standard`, `smart`. Or any full model ID.
- `--sandbox <mode>` — `read-only`, `workspace-write`, `danger-full-access`.
- `--no-yolo` — Disable YOLO mode (on by default).
- `--no-watch` — Fire-and-forget: exit immediately after launch, skip waiting for summary.

## Delegation Patterns

### One-shot

For small or tightly coupled plans. One sub-agent implements the whole plan.

```bash
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts --context <ctx-id> plan
```

Run with `run_in_background: true`. Wait for the summary. Review the changes.

### Parallel

For plans with independent sections. Each sub-agent owns one section, scoped by `--prompt`.

```bash
# Sub-agent A — section 1
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts \
  --context <ctx-id> --prompt "Implement section 1: Extract watch logic into lib/codex-watcher.ts" plan

# Sub-agent B — section 3
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts \
  --context <ctx-id> --prompt "Implement section 3: Update launch-codex.ts arg parsing" plan
```

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
- **Scope with `--prompt`** when running parallel agents — each sub-agent performs better when it knows exactly which section it owns.
- **Review results** when summaries arrive. Check for merge conflicts between parallel agents, then verify with `tsc --noEmit`, tests, or manual inspection.
