# Instructions for Claude

## Before Development or Testing

**Read DEVELOPMENT.md first.** It contains environment setup, template sync file lists, directory structure, and hook rosters.

## Import Validation

`.aiwcli/_core/lib-ts/tsconfig.json` enables `tsc --noEmit` checking across hooks, scripts, and shared runtime libraries.

**To validate imports:**
```bash
cd .aiwcli/_core/lib-ts && bunx tsc --noEmit 2>&1 | grep TS2307
```

**Common import path mistakes:**
- Files in `_core/skills/{system}/scripts/` or `_core/skills/{system}/lib/` need `../../../lib-ts/` to reach `_core/lib-ts/`
- Files in `_core/hooks-ts/` need `../lib-ts/`
- Files in template `core` code keep `core` paths and are normalized to `_core` in reconstructed settings commands

**Requires:** `bun-types` (installed as dev dependency at project root)

## Hook Development

See `.aiwcli/_core/lib-ts/CLAUDE.md` for hook entry points, logging standard, import patterns, debugging, and blocking/output rules.

## Runtime Compatibility

`.claude/settings.json` hook wiring in this repo is Claude Code-specific.

- Claude Code: uses hook lifecycle events from `.claude/settings.json` (e.g. `PreToolUse`, `PostToolUse`, `PermissionRequest`, `UserPromptSubmit`)
- OpenCode: uses `opencode.json` configuration, permission rules, and plugin events (e.g. `tool.execute.before`, `tool.execute.after`, `permission.asked`)

When behavior differs between runtimes, verify the runtime's native config surface first before assuming a hook regression.

## Context Tree

Read the relevant CLAUDE.md before working in these areas:

**`.aiwcli/` (core runtime source):**
- `.aiwcli/_core/lib-ts/CLAUDE.md` — hook API, emit channels, logging, output schema, module reference
- `.aiwcli/_core/lib-ts/context/CLAUDE.md` — context selector, plan manager, task tracker
- `.aiwcli/_core/skills/handoff-system/CLAUDE.md` — handoff lifecycle, restore paths, latest-wins design
- `.aiwcli/_core/skills/meta-plan/CLAUDE.md` — prompt amplifier for complex problems
- `.aiwcli/_core/skills/codex/CLAUDE.md` — Codex pane launcher skill
- `.aiwcli/_core/skills/devin/CLAUDE.md` — Devin pane launcher skill

**`packages/cli/` (CLI package and canonical method template source):**
- `packages/cli/CLAUDE.md` — CLI commands, key lib files, template sync constraints
- `packages/cli/src/templates/CLAUDE.md` — template directory structure
- `packages/cli/src/templates/cc-native/TEMPLATE-SCHEMA.md` — CC-native template layout, installed paths, hook wiring
- `packages/cli/src/templates/cc-native/_cc-native/plan-review/CLAUDE.md` — CC-native plan review system

These files are not auto-loaded. Read the relevant one before working in that subsystem.

---
## Context Maintenance

**After modifying files in this directory:** scan the entries above — if any claim is now
false or incomplete, update this file before ending the task. Do not defer.

**Add** an entry only if an agent would fail without knowing it, it is not obvious from
the code, and it belongs at this scope (project-wide rule → root CLAUDE.md; WHY decision
→ inline comment or ADR; inferable from code → nowhere).

**Remove** any entry that fails the falsifiability test: if removing it would not change
how an agent acts here, remove it. If a convention here conflicts with the codebase,
the codebase wins — update this file, do not work around it. Prune aggressively.

**Staleness anchor:** This file assumes `DEVELOPMENT.md` exists. If it doesn't, this file
is stale — update or regenerate before relying on it.

**Trigger Audit or Generate:**
- Rename/move files or dirs → Audit
- >20% of files changed → Generate
- 30+ days without touching this file → Audit
- Agent mistake caused by this file → fix immediately, then Audit

**Runtime mismatch check:**
- If behavior differs between OpenCode and Claude Code, verify runtime-level config first (`opencode.json` + plugins/events vs `.claude/settings.json` hooks) before debugging hook code.

<!-- context-layer: generated=2026-02-18 | last-audited=2026-03-05 | version=5 | dir-commits-at-audit=15 -->
