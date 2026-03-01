---
name: codex
description: Delegate implementation to Codex sub-agents. USE WHEN codex OR send to codex OR codex implement OR hand off to codex OR launch codex OR codex plan OR run codex.
user-invocable: true
---

Read `.aiwcli/_shared/skills/codex/SKILL.md` for delegation patterns and examples.

## Role

You are the orchestrator. Codex instances are your implementation sub-agents. Decide what to delegate, how to split work, and review results when summaries arrive.

## Command

```
bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_shared/skills/codex/scripts/launch-codex.ts [flags] <mode>
```

The script blocks until Codex exits and prints a summary — run with Bash `run_in_background: true` so you stay unblocked.

**Modes:** `plan` | `--file <path>` | `<inline text...>`

**Key flags:**
- `--context <id>` — Project orientation. Pass when implementing a plan.
- `--prompt <text>` — Scope the agent's work to a specific plan section or task.
- `--model <name>` — `spark`, `codex`, `gpt`, or tier: `fast`, `standard`, `smart`.
- `--no-watch` — Fire-and-forget (skip waiting for summary).

## Delegation Decision

**One-shot:** Plan is small or tightly coupled → launch one Codex with `plan` mode. Wait for the summary, then review.

**Parallel:** Plan has independent sections → launch multiple Codex instances, each scoped with `--prompt` to its section. All share the same `--context`. Review when summaries arrive, check for conflicts.

**Ad-hoc:** No plan, just a task → pass inline text (e.g., `"Fix the failing test in auth.ts"`).
