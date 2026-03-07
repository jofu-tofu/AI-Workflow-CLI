# Devin Workflow

Use Devin CLI handoff instructions from `.aiwcli/_core/skills/devin/SKILL.md`.

## Command

`bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/devin/scripts/launch-devin.ts [flags] <mode>`

**Modes:** `plan` | `--file <path>` | `<inline text...>`

## Behavior

Launches Devin in a visible pane when available (tmux session first; fallback to exec mode).

**Common flags:** `--model <name>`, `--context <id>`, `--prompt <text>`, `--no-watch`
