# Codex Workflow

Use Codex CLI handoff instructions from `.aiwcli/_core/skills/codex/SKILL.md`.

## Command

`bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/codex/scripts/launch-codex.ts [flags] <mode>`

**Modes:** `plan` | `--file <path>` | `<inline text...>`

## Behavior

Launches Codex in a visible pane when available (tmux session first; platform window fallback when applicable).

If pane launch is unavailable, it automatically falls back to non-interactive `codex exec` in the current terminal.

**Common flags:** `--model <name>`, `--sandbox <mode>`, `--context <id>`, `--prompt <text>`, `--no-yolo`, `--no-watch`
