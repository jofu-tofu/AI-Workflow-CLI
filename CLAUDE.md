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

## Plan & Handoff Lifecycle (Separation of Concerns)

Plan and handoff assignment is decoupled from mode transitions. Each hook has a single responsibility:

| Hook | Event | Responsibility |
|------|-------|---------------|
| `archive_plan.ts` | PermissionRequest:ExitPlanMode | Archives plan file to `plans/` folder only. No state.json changes. |
| `save_handoff.ts` | /handoff command (script) | Creates handoff folder, sets `handoff_path` and `handoff_consumed=False`. Mode stays `active`. |
| `session_end.ts` | SessionEnd | **Fallback:** assigns plan fields from archived plan if plan_hash missing. Stages `active` → `has_plan` (plan) or `active` → `has_handoff` (handoff) when not consumed. Plan takes priority. |
| `session_start.ts` | SessionStart(clear) | Finds `has_plan` or `has_handoff` context, binds new session, transitions to `active`, sets consumed flag. Injects restoration context. |
| `session_start.ts` | SessionStart(compact) | Restores context after compaction. Inlines plan content (not auto-pasted in compact). |
| `user_prompt_submit.ts` | UserPromptSubmit (via determineContext) | Fallback: plan matching via hash/signature, handoff matching via `has_handoff` mode. Sets consumed flags. |

**Plan mode lifecycle:**
```
Plan accepted → archive_plan archives file (PermissionRequest, before user decision)
Session ends  → session_end: fallback assigns plan_hash from archived plan if missing (plan_consumed=False)
                session_end: active → has_plan ONLY when plan_hash exists AND plan_consumed=False
/clear fires  → session_start: has_plan → active (plan_consumed=True — one-shot latch)
Next /clear   → session_end: plan_consumed=True → skip has_plan (no infinite loop)
```

**Handoff mode lifecycle:**
```
/handoff runs       → save_handoff: creates doc, sets handoff_path, handoff_consumed=False
Session ends        → session_end: handoff_path AND !handoff_consumed → mode = has_handoff
/clear fires        → session_start: has_handoff → active (handoff_consumed=True), inject content
Next session end    → session_end: handoff_consumed=True → skip re-staging
Next /clear         → fresh context (no staged handoff)
```

**Priority: plan > handoff.** If both plan and handoff are staged (rare), plan check runs first in session_end and sets `has_plan`. The handoff check then sees `mode != "active"` and skips.

**Critical: Auto-paste bypasses hooks.** After ExitPlanMode "clear context", Claude Code runs `/clear` and auto-pastes the plan content. This auto-paste is an internal mechanism that does NOT trigger UserPromptSubmit. The `session_start.ts` handler for `source=clear` bridges this gap.

**Consumed flags are one-shot latches.** `plan_consumed` and `handoff_consumed` are set to `True` when their respective mode transitions from staged (`has_plan`/`has_handoff`) → `active`. Prevents `session_end` from re-staging the same artifact. Reset to `False` when a new artifact is created or when mode returns to idle.

**One plan per session assumption:** Plan review iteration state resets across sessions but NOT within a session. When a plan is rejected by reviewers and the user creates a new plan in the same session, the iteration state (agent graduation, pass streaks) persists. This allows the review framework to work correctly: rejection within a session means "fix and retry," not "start completely fresh." Only when starting a new planning session (new session ID) does iteration state reset to allow full fresh review.

**Staged modes are transient.** `has_plan` and `has_handoff` exist only between SessionEnd (which sets them) and SessionStart(clear) (which consumes them). They should not persist across multiple sessions. If not consumed, `user_prompt_submit.ts` (via `determineContext`) provides fallback matching.

**Rejection handling:** `archive_plan` archives the file on PermissionRequest (before accept/reject decision). If rejected, the archive exists but `session_end`'s fallback may assign plan_hash. This is acceptable — rejected plans with hash set don't cause harm because has_plan matching in context_selector requires content match.

**Two restore paths:**
- **source=clear** (plan/handoff acceptance): Plan auto-pasted by Claude Code (plans only). Hook injects task/git context and handoff content.
- **source=compact** (auto-compaction): Plan NOT auto-pasted. Hook inlines plan content via `_build_restore_sections(inline_plan=True)`.

**Design principles:**
- `has_plan` / `has_handoff` = transient bridge between SessionEnd and SessionStart(clear)
- `active` = "working" (with or without plan/handoff)
- Plan fields (`plan_path`, `plan_hash`, `plan_signature`) are persistent metadata — never cleared by mode transitions
- `plan_consumed` / `handoff_consumed` = one-shot latches preventing infinite re-staging
- Valid modes: `idle | has_plan | has_handoff | active`
