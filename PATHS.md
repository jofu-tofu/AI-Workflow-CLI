# CC Native File Paths Reference

Quick reference for terminal-based workflow operations.

## When Working on THIS Project

| Purpose | Location |
|---------|----------|
| **Workflows** | `_cc-native/workflows/*.md` |
| **Config** | `_cc-native/plan-review.config.json` |
| **Output** | `_output/cc-native/plans/{date}/{slug}/` |
| **Hooks** | `_cc-native/hooks/*.py` |
| **Lib** | `_cc-native/lib/*.py` |

## When Modifying the Template (for distribution)

| Purpose | Location |
|---------|----------|
| **Source** | `packages/cli/src/templates/cc-native/` |
| **Build** | `bun run build` (creates dist/) |

## Ignore in Searches

- `packages/cli/dist/` - build artifacts, duplicates of src/templates
- `node_modules/` - dependencies

## Config Files (Disambiguation)

| File | Purpose |
|------|---------|
| `_cc-native/plan-review.config.json` | CC-Native plan review and agent review settings |
| `.claude/settings.json` | Claude Code hooks, model preferences, IDE settings |

## Common Operations

```bash
# Find canonical workflows
ls _cc-native/workflows/

# Edit plan review config
code _cc-native/plan-review.config.json

# View latest plan output
ls _output/cc-native/plans/$(date +%Y-%m-%d)/
```
