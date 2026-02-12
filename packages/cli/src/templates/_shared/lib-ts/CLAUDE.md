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

## Hook Output — Three Communication Channels

Hooks have three channels back to the session. Pick the right one:

| Want to... | Function | Who sees it |
|------------|----------|-------------|
| Block tool + return message | `emitContextAndBlock(context, reason)` | Claude + user (denial reason prominent) |
| Return message, don't block | `emitContext(context)` | Claude + user (in transcript) |
| Log only (diagnostics) | `logInfo()` / `logWarn()` / etc. | Nobody in session — file only |

**There is no way to show something to the user but hide it from Claude, or vice versa.** Both `emitContext()` and `emitContextAndBlock()` produce output visible to both.

### Channel 1: Block + Context (PreToolUse only)

```typescript
emitContextAndBlock(
  "Detailed feedback Claude sees",    // additionalContext
  "Short reason for the block"        // permissionDecisionReason
);
// No SystemExit needed — permissionDecision:"deny" with exit 0 is sufficient.
// runHookAsync drains stdout before exit to ensure pipe consumers receive the JSON.
```

The tool call is **prevented from executing**. Only works for PreToolUse hooks.

### Channel 2: Non-blocking Context (any hook event)

```typescript
emitContext("Information added to Claude's context");
```

The tool call / session continues normally. Works for PreToolUse, PostToolUse, UserPromptSubmit, SessionStart, Notification, SubagentStart.

### Channel 3: Log-only (diagnostics)

```typescript
logInfo("my_hook", "Processing started");     // File only
logWarn("my_hook", `Fallback used: ${why}`);  // File only
```

Nobody in the session sees this. Written to `_output/hook-log.jsonl` for debugging.

### Hook Output Logging

Both `emitContext()` and `emitContextAndBlock()` automatically log their output to `_output/hook-log.jsonl` as `HOOK_OUTPUT` entries. This captures exactly what was sent to Claude via stdout, closing the visibility gap where the agent sees injected context the user doesn't.

- **Log level:** `info` — visible unless `HOOK_LOG_LEVEL=warn`
- **`msg` field:** Scannable summary: `HOOK_OUTPUT [context] 842 chars` or `HOOK_OUTPUT [block] 340 chars, reason="..."`
- **`data` field:** Full payload including `additionalContext` and `blockReason` (for blocks)
- **Controlled by:** Existing `HOOK_LOG_LEVEL` and `HOOK_LOG_DISABLE` env vars
- **No hook changes needed:** Logging happens inside the emit functions themselves

### Exit codes and JSON

| Exit Code | JSON Parsed? | Effect |
|-----------|-------------|--------|
| **0** | Yes | Normal — `hookSpecificOutput` processed |
| **2** | No | Blocking error — JSON ignored, stderr fed to Claude |
| **Other** | No | Non-blocking error — stderr shown in verbose mode |

You cannot mix exit 2 with JSON decisions. Pick one: exit 0 + JSON, or exit 2 + stderr.

### hookSpecificOutput fields by event type

| Event | `additionalContext` | `permissionDecision` | `permissionDecisionReason` | Other |
|-------|:--:|:--:|:--:|-------|
| **PreToolUse** | Y | Y (allow/deny/ask) | Y | `updatedInput` |
| **PostToolUse** | Y | - | - | `updatedMCPToolOutput` (MCP only) |
| **UserPromptSubmit** | Y | - | - | top-level `decision: "block"` |
| **SessionStart** | Y | - | - | — |
| **Notification** | Y | - | - | — |
| **SubagentStart** | Y | - | - | — |
| **Stop** | - | - | - | top-level `decision`, `reason` |
| **SessionEnd** | - | - | - | — |

**Invalid fields cause silent rejection of the entire output.** No error, no feedback. Conversely, **missing `hookEventName` also causes silent rejection** — see "Hook API: Critical Learnings" below.

### Special case: fileSuggestion

The `fileSuggestion` settings command is NOT a hook — it uses a different protocol. It outputs a plain JSON array to stdout (e.g., `console.log(JSON.stringify(paths))`). Do not use `emitContext()` for fileSuggestion.

---

## Hook API: Critical Learnings (Verified 2026-02-11)

These findings were verified through systematic testing. They document Claude Code's actual behavior, which sometimes differs from what the docs suggest.

### hookEventName is REQUIRED (CC 2.1.39+)

Claude Code validates `hookSpecificOutput` using a Zod discriminated union keyed on `hookEventName`. If this field is missing:

- The entire hook output is silently rejected — no error, no feedback
- `permissionDecision: "deny"` is never processed
- The hook appears to "not work" even though it runs successfully

**You don't need to handle this manually.** `emitContext()` and `emitContextAndBlock()` auto-detect `hookEventName` from the stdin payload (via `_lastHookEvent`, set by `loadHookInput()`/`runHook()`). This works because hooks are synchronous single-process executions — each `bun` process has its own memory, so there's no concurrency risk between sessions.

**If auto-detection fails** (e.g., `loadHookInput()` wasn't called), `hookEventName` is omitted and the output will be silently rejected. This is why `runHook()`/`runHookAsync()` is mandatory — it calls `_earlyReadInput()` first, guaranteeing `_lastHookEvent` is populated.

### Exit Code Behavior (Tested)

| Exit Code | JSON Parsed? | Blocks Tool? | What Claude Sees | Tested? |
|-----------|-------------|-------------|------------------|---------|
| **0** + deny JSON | Yes | Yes (PreToolUse only) | `additionalContext` + denial reason | Yes |
| **0** + context JSON | Yes | No | `additionalContext` in transcript | Yes |
| **1** | No | No | stderr in verbose mode only | Yes |
| **2** | No | Yes (any event) | stderr fed as system-reminder | Yes |

**Key insight:** Exit 0 + `permissionDecision: "deny"` is the correct way to block a tool. Exit 2 is a blunt instrument — it ignores your JSON and feeds raw stderr to Claude. Use exit 0 + deny for clean blocking with structured feedback.

### ExitPlanMode: Not Special-Cased

Early testing suggested ExitPlanMode was "immune" to PreToolUse deny. **This was wrong.** The actual issue was missing `hookEventName` — the Zod validator silently rejected the deny output.

**With `hookEventName` included:**
- PreToolUse `permissionDecision: "deny"` (exit 0) → **blocks ExitPlanMode**, no dialog appears, session stays in plan mode
- `emitContextAndBlock()` handles this automatically via auto-detection

**Without `hookEventName` (the bug):**
- Deny silently rejected → dialog appeared → looked like ExitPlanMode was special-cased
- Exit 2 also appeared to "not work" for PreToolUse (JSON was ignored as expected, but the blocking was via stderr, not deny)
- PostToolUse with exit 2 appeared to work because it used stderr (not JSON), bypassing the Zod issue

**Lesson:** When a hook output seems to be "silently ignored," check the JSON schema first. The Zod validator rejects malformed output without any error message.

### Debugging Checklist

When a hook's deny/context isn't working:

1. **Is `hookEventName` in the JSON output?** Check `_output/hook-log.jsonl` for `HOOK_OUTPUT` entries
2. **Is the hook using `runHook()`/`runHookAsync()`?** Required for auto-detection
3. **Is `loadHookInput()` called before `emitContext()`?** It populates `_lastHookEvent`
4. **Is the exit code 0?** Exit 1/2 cause JSON to be ignored
5. **Are there extra fields in `hookSpecificOutput`?** Invalid fields cause silent rejection of the entire output

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
