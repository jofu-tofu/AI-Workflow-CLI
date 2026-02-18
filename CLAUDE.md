# Instructions for Claude

## Before Development or Testing

**Read DEVELOPMENT.md first.** It contains environment setup that prevents path errors, test failures, and cross-environment pollution.

## Template Synchronization

**When modifying hooks, library code, or settings in `.aiwcli/`:**

Changes to the working directory (`.aiwcli/`) should also be applied to the template at `packages/cli/src/templates/cc-native/`. This ensures new project initializations receive the updates.

**Files that need synchronization:**
- `.aiwcli/_shared/hooks-ts/*.ts` → `packages/cli/src/templates/_shared/hooks-ts/`
- `.aiwcli/_shared/lib-ts/**/*.ts` → `packages/cli/src/templates/_shared/lib-ts/`
- `.aiwcli/_cc-native/hooks/*.ts` → `packages/cli/src/templates/cc-native/_cc-native/hooks/`
- `.aiwcli/_cc-native/lib-ts/**/*.ts` → `packages/cli/src/templates/cc-native/_cc-native/lib-ts/`
- `.aiwcli/_cc-native/plan-review/**` → `packages/cli/src/templates/cc-native/_cc-native/plan-review/`
- `.aiwcli/_cc-native/artifacts/**` → `packages/cli/src/templates/cc-native/_cc-native/artifacts/`
- `.claude/settings.json` → `packages/cli/src/templates/cc-native/.claude/settings.json`

**When to sync:**
- Adding new hooks
- Modifying hook behavior
- Adding/changing library functions used by hooks
- Updating settings.json hook configurations

**Note:** The `dist/` directory is auto-generated during build - only update `src/templates/`.

## Hook Development

See `.aiwcli/_cc-native/hooks/CLAUDE.md` for hook entry points, logging standard, import patterns, debugging, and DO NOT list.

## Plan & Handoff Lifecycle (Unified System - v0.13.0+)

**Unified staging mode:** `has_staged_work` replaces `has_plan` and `has_handoff`. Single mode with explicit artifact type tracking via `next_artifact_type` field. Latest artifact wins - only ONE artifact staged at a time.

Each hook has a single responsibility:

| Hook | Event | Responsibility |
|------|-------|---------------|
| `archive_plan.ts` | PermissionRequest:ExitPlanMode | Archives plan file to `plans/` folder only. No state.json changes. |
| `save_handoff.ts` | /handoff command (script) | Creates handoff folder, sets `handoff_path`, `work_consumed=False`, `next_artifact_type="handoff"`. **Latest wins:** clears plan fields if they exist. Mode stays `active`. |
| `session_end.ts` | SessionEnd | **Fallback:** assigns plan fields from archived plan if plan_hash missing. **New plan detection:** if plan_hash differs from plan_hash_consumed, clears handoff (latest wins). Stages `active` → `has_staged_work` when artifact exists AND `work_consumed=False`. `determineArtifactType()` sets `next_artifact_type`. |
| `session_start.ts` | SessionStart(clear) | Finds `has_staged_work` context, dispatches by `next_artifact_type`, binds session, transitions to `active`, sets `work_consumed=True`. Injects restoration context. |
| `session_start.ts` | SessionStart(compact) | Restores context after compaction. Inlines plan content (not auto-pasted in compact). |
| `user_prompt_submit.ts` | UserPromptSubmit (via determineContext) | Fallback: filters by `has_staged_work`, separates by `determineArtifactType()`, tries plan match (content-based), then handoff match (first-match). Sets `work_consumed=True`. |


See `.aiwcli/_shared/handoff-system/CLAUDE.md` for full lifecycle details including restore paths, rejection handling, and design principles.

## System Co-location Pattern

Cohesive subsystems are organized as self-contained folders, following the handoff system model. Each system folder lives at the `_shared/` or `_cc-native/` level and contains:

```
{system-name}/
├── CLAUDE.md       ← Spec: lifecycle, API reference, design decisions, gotchas
├── lib/            ← TypeScript implementation (imported by hooks and other systems)
├── agents/         ← Agent spec .md files used by this system (if any)
├── scripts/        ← Standalone entry points invoked independently (if any)
└── workflows/      ← User-facing procedural workflow docs (if any)
```

**Existing systems following this pattern:**
- `_shared/handoff-system/` — handoff creation and restoration
- `_cc-native/plan-review/` — multi-agent plan review pipeline
- `_cc-native/artifacts/` — review artifact generation and tracking
- `_cc-native/lib-ts/rlm/` — retrieval-augmented learning memory

**Hooks are NOT co-located with their owning system.**
Claude Code hooks are path-referenced in `.claude/settings.json` at install time.
Moving a hook file requires settings.json updates — high blast-radius, fragile.
Hooks live in `_shared/hooks-ts/` or `_cc-native/hooks/`. Each system's CLAUDE.md
lists the hooks that invoke it under a "Hooks" section.
