---
name: codex
description: Delegate implementation to Codex sub-agents. USE WHEN codex OR send to codex OR codex implement OR hand off to codex OR launch codex OR run codex.
user-invocable: true
---

# /codex

Load and execute the Codex launcher skill from `.aiwcli/_core/skills/codex/SKILL.md`.

## Command

`bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/codex/scripts/launch-codex.ts [flags] <mode>`

**Modes:** `plan` | `--file <path>` | `<inline text...>`

## Behavior

Launches Codex in a visible pane when available (tmux session first; platform window fallback when applicable).

If pane launch is unavailable, it automatically falls back to non-interactive `codex exec` in the current terminal.

**Common flags:** `--model <name>`, `--sandbox <mode>`, `--context <id>`, `--prompt <text>`, `--no-yolo`, `--no-watch`
