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
- `.claude/settings.json` → `packages/cli/src/templates/cc-native/.claude/settings.json`

**When to sync:**
- Adding new hooks
- Modifying hook behavior
- Adding/changing library functions used by hooks
- Updating settings.json hook configurations

**Note:** The `dist/` directory is auto-generated during build - only update `src/templates/`.

## Hook Development

See `.aiwcli/_cc-native/hooks/CLAUDE.md` for hook development patterns, API format, debugging, and the TypeScript verification workflow.

### Hook Entry Point Standard

**All hooks MUST use `runHook()` or `runHookAsync()` as their entry point.** This provides automatic lifecycle logging (HOOK_START/HOOK_END with template origin, duration, status) and standardized error handling.

```typescript
import { runHook, logInfo } from "../../_shared/lib-ts/base/hook-utils.js";

function main(): void {
  logInfo("hook-name", "Starting...");
  // Hook logic here
}

runHook(main, "hook_name");
```

For async hooks (e.g., plan review with parallel agents):

```typescript
import { runHookAsync } from "../../_shared/lib-ts/base/hook-utils.js";

async function main(): Promise<void> {
  // Async hook logic
}

runHookAsync(main, "hook_name");
```

**Do NOT** use bare `process.exit()`, manual try/catch at the top level, or `console.log()` for diagnostics. These patterns bypass lifecycle logging and corrupt stdout. `runHook()`/`runHookAsync()` handles all of this automatically.

## Logging Standard

All hook and library code must use the unified logger at `_shared/lib-ts/base/logger.ts`:

```typescript
import { logDebug, logInfo, logWarn, logError } from "../../_shared/lib-ts/base/hook-utils.js";

logDebug("hook_name", "checking value");
logInfo("hook_name", "session started");
logWarn("hook_name", `fallback used: ${reason}`);
logError("hook_name", `failed: ${e}`);
```

- **Never use** `console.log()` or `console.error()` for diagnostic logging (corrupts stdout)
- Logs go to `_output/hook-log.jsonl` (JSONL format)
- Control via `HOOK_LOG_LEVEL=warn` (minimum level) or `HOOK_LOG_DISABLE=1`

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

**Unified lifecycle:**
```
Plan/handoff created → New artifact clears old artifact (latest wins)
                       Sets work_consumed=False, next_artifact_type={plan|handoff}
Session ends         → session_end: artifact exists AND !work_consumed → mode = has_staged_work
/clear fires         → session_start: has_staged_work → active (work_consumed=True — one-shot latch)
Next session end     → session_end: work_consumed=True → skip re-staging (no infinite loop)
Next /clear          → fresh context (no staged artifact)
```

**Migration:** Old state files with `has_plan`/`has_handoff` modes and `plan_consumed`/`handoff_consumed` flags automatically migrate to `has_staged_work` and `work_consumed` on read via `migrateConsumedFlags()` in `state-io.ts`. Idempotent, transparent, backward-compatible.

**Critical: Auto-paste bypasses hooks.** After ExitPlanMode "clear context", Claude Code runs `/clear` and auto-pastes the plan content. This auto-paste is an internal mechanism that does NOT trigger UserPromptSubmit. The `session_start.ts` handler for `source=clear` bridges this gap.

**Consumed flag is a one-shot latch.** `work_consumed` is set to `True` when mode transitions from staged (`has_staged_work`) → `active`. Prevents `session_end` from re-staging the same artifact. Reset to `False` when a new artifact is created or when mode returns to idle.

**One plan per session assumption:** Plan review iteration state resets across sessions but NOT within a session. When a plan is rejected by reviewers and the user creates a new plan in the same session, the iteration state (agent graduation, pass streaks) persists. This allows the review framework to work correctly: rejection within a session means "fix and retry," not "start completely fresh." Only when starting a new planning session (new session ID) does iteration state reset to allow full fresh review.

**Staged mode is transient.** `has_staged_work` exists only between SessionEnd (which sets it) and SessionStart(clear) (which consumes it). It should not persist across multiple sessions. If not consumed, `user_prompt_submit.ts` (via `determineContext`) provides fallback matching.

**Rejection handling:** `archive_plan` archives the file on PermissionRequest (before accept/reject decision). If rejected, the archive exists but `session_end`'s fallback may assign plan_hash. This is acceptable — rejected plans with hash set don't cause harm because plan matching in context_selector requires content match.

**Two restore paths:**
- **source=clear** (plan/handoff acceptance): Plan auto-pasted by Claude Code (plans only). Hook injects task/git context and handoff content (dispatch by `next_artifact_type`).
- **source=compact** (auto-compaction): Plan NOT auto-pasted. Hook inlines plan content via `buildRestoreSections(inline_plan=True)`.

**Design principles:**
- `has_staged_work` = transient bridge between SessionEnd and SessionStart(clear)
- `active` = "working" (with or without plan/handoff)
- Plan fields (`plan_path`, `plan_hash`, `plan_signature`) and handoff field (`handoff_path`) are persistent metadata — cleared by latest-wins replacement, not by mode transitions
- `work_consumed` = one-shot latch preventing infinite re-staging
- `next_artifact_type` = explicit artifact type indicator ("plan" | "handoff" | null), set when staging
- Valid modes: `idle | has_staged_work | active`
