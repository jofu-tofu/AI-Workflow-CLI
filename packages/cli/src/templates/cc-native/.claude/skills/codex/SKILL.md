---
name: codex
description: Launch Codex CLI in a tmux pane. USE WHEN codex OR send to codex OR codex implement OR hand off to codex OR launch codex OR codex plan OR run codex.
user-invocable: true
---

# Codex CLI

Launch Codex in a tmux split pane and optionally inject a prompt.

## Command

`bun .aiwcli/_shared/skills/prompt-codex/scripts/launch-codex.ts [flags] <mode>`

**Modes:** `plan` (inject active plan) | `--file <path>` (inject file) | `<text...>` (inject inline text)

**Flags:**
- `--model <name>` — Model aliases: `spark`, `codex`, `gpt`. Tiers: `fast`, `standard`, `smart`. Or any full model ID.
- `--sandbox <mode>` — `read-only`, `workspace-write`, `danger-full-access`. Default: Codex default.
- `--context <id>` — Pass the active context ID so Codex receives project orientation (context folder, notes path). **Always pass this when an active context exists** (check the `Active Context:` system reminder for the ID).

## Model Reference

| Name | Resolves To |
|------|-------------|
| `spark` | `gpt-5.3-codex-spark` (fastest) |
| `codex` | `gpt-5.3-codex` (default) |
| `gpt` | `gpt-5.2` (non-Codex GPT) |
| `fast` | `gpt-5.3-codex-spark` (tier) |
| `standard` | `gpt-5.3-codex` (tier) |
| `smart` | `gpt-5.3-codex` (tier) |

## Examples

- `/codex --model spark --context <context-id> plan` — hand off active plan to Spark with context
- `/codex --model codex --context <context-id> Refactor auth to use JWT` — inline prompt with context
- `/codex --file ./spec.md` — inject file contents (no context)

## Requirements

- Must be running inside tmux
- `codex` CLI must be on PATH
