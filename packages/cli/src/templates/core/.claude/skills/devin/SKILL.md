---
name: devin
description: Delegate implementation to Devin sub-agents. USE WHEN devin OR send to devin OR devin implement OR hand off to devin OR launch devin OR run devin.
user-invocable: true
---

# /devin

Delegate work to a Devin sub-agent. The launch script handles prompt construction internally — you just run the command and pass the mode/flags.

**IMPORTANT:** Never include the launch command path, script path, or any `.aiwcli/` internal paths in the delegation prompt or inline text arguments. The script constructs Devin's prompt internally. Leaking internal paths into the prompt causes Devin to recurse.

## Command

`bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/skills/devin/scripts/launch-devin.ts [flags] <mode>`

**Modes:** `plan` | `--file <path>` | `<inline text...>`

**Flags:** `--model <name>`, `--context <id>`, `--prompt <text>`, `--no-watch`

## Usage

Run with `run_in_background: true`. The script blocks until Devin exits and prints a session summary.

For detailed delegation patterns (parallel, one-shot, ad-hoc), read `.aiwcli/_core/skills/devin/SKILL.md`.
