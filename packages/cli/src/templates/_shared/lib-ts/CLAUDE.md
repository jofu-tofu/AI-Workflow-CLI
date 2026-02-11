# Shared TypeScript Library

**Location:** `_shared/lib-ts/` — cross-method infrastructure used by ALL templates.

**One import gets you started:**
```typescript
import { loadHookInput, runHook, logInfo, emitContext } from "../lib-ts/base/hook-utils.js";
```

`hook-utils.ts` re-exports the most-used functions from `logger.ts`, `constants.ts`, and `context-store.ts`. Start here. Only import from deeper modules when you need specific capabilities.

**Import direction:** Hooks --> method lib --> `_shared/lib-ts/`. Never the reverse.

---

## Critical Rules

These cause silent failures or UI noise when violated:

- **Entry point:** Every hook MUST use `runHook()` or `runHookAsync()` — never bare `main()` or `process.exit()`
- **stdout is sacred:** Only hook JSON output goes to stdout. Use logger functions for diagnostics, never `console.log()` or `print()`
- **stderr is opt-in:** `logDebug/logInfo/logWarn/logError` write to file only. Use `logBlocking()` when you NEED stderr visibility
- **Catch non-critical errors locally:** Uncaught errors bubble to `runHook` which writes to stderr, showing "hook error" in the UI even on exit 0
- **No reverse imports:** Never import from method lib (e.g., `_cc-native/lib/`) into shared lib

---

## Hook Skeleton

Copy this for new hooks:

```typescript
#!/usr/bin/env bun
import { loadHookInput, runHook, logDebug, logInfo, emitContext } from "../lib-ts/base/hook-utils.js";

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;

  const sessionId = payload.session_id;
  if (!sessionId) return;

  // Your hook logic here...

  emitContext("Context visible to Claude");
}

runHook(main, "my_hook_name");
```

For async hooks (AI inference, network calls):

```typescript
import { runHookAsync } from "../lib-ts/base/hook-utils.js";

async function asyncMain(): Promise<void> {
  // await something...
}

runHookAsync(asyncMain, "my_async_hook");
```

---

## Logging

All logging goes to `_output/hook-log.jsonl`. stderr visibility is opt-in.

| Tier | Function | Visible in UI? | Use When |
|------|----------|---------------|----------|
| File-only | `logDebug()` / `logInfo()` / `logWarn()` / `logError()` | No | 99% of logging: diagnostics, state changes, non-critical errors |
| Blocking | `logBlocking()` | Yes (stderr) | The hook found a real problem the user or Claude must see |
| Unhandled | `logHookError()` | Yes (stderr) | Reserved for `runHook` crash handler — do not call directly |
| Terminal | `eprint()` | Yes (raw stderr) | Usage help, progress indicators — not logged to JSONL |

```typescript
import { logDebug, logInfo, logWarn, logBlocking } from "../lib-ts/base/hook-utils.js";

logInfo("my_hook", "Session started");           // file only
logWarn("my_hook", `Fallback used: ${reason}`);   // file only
logBlocking("my_hook", "Critical: state corrupt"); // shows in UI
```

---

## Hook Output

Hooks return structured data to Claude via stdout:

```typescript
import { emitContext, emitContextAndBlock } from "../lib-ts/base/hook-utils.js";

emitContext("Information for Claude to see");

emitContextAndBlock(
  "Review feedback for Claude",
  "Reason shown for the denial"
);
```

---

## Context Store

2-layer CRUD: per-context `state.json` + global `_output/index.json`.

```typescript
import { getContextBySessionId, bindSession, maybeActivate, saveState } from "../lib-ts/context/context-store.js";

const state = getContextBySessionId(sessionId, projectRoot);
if (state) {
  // ALWAYS wrap non-critical operations — uncaught errors become UI "hook error"
  try {
    maybeActivate(state.id, permissionMode, projectRoot, "hook_name");
  } catch (e) {
    logWarn("hook_name", `maybeActivate failed (non-critical): ${e}`);
  }
}
```

**Valid modes:** `idle` | `has_plan` | `has_handoff` | `active`

Transitions: `idle`/`has_plan`/`has_handoff` --> `active` (via `maybeActivate`). `active` --> `has_plan`/`has_handoff` (via `session_end`).

---

## Module Reference

Use this table to find the right file. Read the source for full API details.

### `base/` — Core Infrastructure

| File | Purpose | Key Exports |
|------|---------|-------------|
| `hook-utils.ts` | Hook lifecycle, stdin parsing, output emit, re-exports | `runHook`, `runHookAsync`, `loadHookInput`, `emitContext`, `emitContextAndBlock`, `logDebug`...`logBlocking` |
| `logger.ts` | JSONL logging engine | `hookLog`, `logDebug`, `logInfo`, `logWarn`, `logError`, `logBlocking`, `logHookError`, `logDiagnostic` |
| `constants.ts` | Path resolution, limits | `getProjectRoot()`, `getContextDir()`, `MAX_FILE_SIZE` |
| `atomic-write.ts` | Crash-safe file writes | `atomicWriteFileSync()` |
| `state-io.ts` | State serialization with mode migration | `readState()`, `writeState()` |
| `inference.ts` | Claude CLI subprocess calls | `inferText()` |
| `utils.ts` | Formatting, ID generation | `nowIso()`, `generateContextId()`, `slugify()` |
| `git-state.ts` | Git snapshot | `captureGitState()` |
| `subprocess-utils.ts` | Recursive call guard | `isInternalCall()` |
| `stop-words.ts` | Word list for ID generation | Used by `utils.ts` internally |

### `context/` — Context State Management

| File | Purpose | Key Exports |
|------|---------|-------------|
| `context-store.ts` | CRUD for context state + index | `getContextBySessionId`, `bindSession`, `maybeActivate`, `saveState`, `createContext` |
| `context-selector.ts` | Route prompts to contexts | `determineContext()`, `BlockRequest` |
| `context-formatter.ts` | Display formatting | `formatContextSummary()` |
| `plan-manager.ts` | Plan lifecycle (archive, hash, sign) | `archivePlan()`, `computePlanHash()` |
| `task-tracker.ts` | Task CRUD on state.json | `addTask()`, `updateTask()`, `getTasks()` |

### `handoff/` and `templates/`

| File | Purpose | Key Exports |
|------|---------|-------------|
| `handoff/document-generator.ts` | Handoff document generation | `generateHandoffDocument()` |
| `templates/formatters.ts` | Display constants, mode maps, icons | `MODE_MAP`, `STATUS_ICONS` |
| `templates/plan-context.ts` | Plan evaluation templates | `PLAN_EVALUATION_REMINDER` |

### Root

| File | Purpose |
|------|---------|
| `types.ts` | All shared types: `Mode`, `ContextState`, `Task`, `HookInput`, `HookOutput` |

---

## Shared Hooks (`_shared/hooks-ts/`)

These run for ALL templates. Method-specific hooks live in `_{method}/hooks/`.

| Hook | Event | Purpose |
|------|-------|---------|
| `user_prompt_submit.ts` | UserPromptSubmit | Context enforcement — binds prompts to tracked contexts |
| `context_monitor.ts` | PostToolUse:* | Context window tracking, handoff warnings at 30/20/10% |
| `session_start.ts` | SessionStart | Restores plan/handoff context after `/clear` or compaction |
| `session_end.ts` | SessionEnd | Stages `active` --> `has_plan`/`has_handoff` for next session |
| `archive_plan.ts` | PreToolUse:ExitPlanMode | Archives plan file before accept/reject decision |
| `pre_compact.ts` | PreToolUse:Compact | Pre-compaction state snapshot |
| `task_create_capture.ts` | PostToolUse:TaskCreate | Persists task creation to context state |
| `task_update_capture.ts` | PostToolUse:TaskUpdate | Persists task updates to context state |
| `file-suggestion.ts` | PostToolUse:Write | Suggests file organization improvements |

---

## Environment Variables

| Variable | Effect |
|----------|--------|
| `CLAUDE_PROJECT_DIR` | Override project root detection |
| `HOOK_LOG_DISABLE=1` | Disable all file logging |
| `HOOK_LOG_LEVEL=warn` | Minimum log level (default: `debug`) |
| `HOOK_ERROR_LOG_DISABLE=1` | Legacy alias for `HOOK_LOG_DISABLE` |
| `_CC_INTERNAL=1` | Marks subprocess calls (checked by `isInternalCall()`) |
