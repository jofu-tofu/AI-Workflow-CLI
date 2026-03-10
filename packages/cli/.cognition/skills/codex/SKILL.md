---
name: codex
description: Delegate implementation to Codex sub-agents. USE WHEN codex OR send to codex OR codex implement OR hand off to codex OR launch codex OR run codex.
user-invocable: true
---

# Codex Workflow

Delegate work to a Codex sub-agent. The launch script handles prompt construction internally — you just run the command and pass the mode/flags.

**IMPORTANT:** Never include the launch command path, script path, or any `.aiwcli/` internal paths in the delegation prompt or inline text arguments. The script constructs Codex's prompt internally. Leaking internal paths into the prompt causes Codex to recurse.

## Command

`bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/codex/scripts/launch-codex.ts [flags] <mode>`

**Modes:** `plan` | `--file <path>` | `<inline text...>`

**Flags:** `--model <name>`, `--sandbox <mode>`, `--context <id>`, `--prompt <text>`, `--no-yolo`, `--no-watch`
