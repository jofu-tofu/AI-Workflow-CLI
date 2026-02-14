# CC-Native Hooks Development Guide

> **Keep this document updated.** When you solve an issue related to hooks, add the solution to the relevant section and log it in the Changelog. This document should grow with discovered patterns and fixes—don't wait to be asked.

---

## Quick Reference

| Hook | Trigger | Purpose |
|------|---------|---------|
| `cc-native-plan-review.ts` | PreToolUse: ExitPlanMode | Questions gate + plan review before user approval |
| `add_plan_context.ts` | PostToolUse: AskUserQuestion, PreToolUse: Task | Mark questions asked; nudge Plan subagent to ask questions first |
| `plan_questions_early.ts` | UserPromptSubmit | Inject Phase A clarification prompt in plan mode |

### Questions Gate (in cc-native-plan-review.ts)

Before running plan review agents, the hook checks `wasQuestionsAsked()`. If the user hasn't been asked questions yet, it runs a fresh-context plan-questions agent (from `agents/plan-questions/PLAN-QUESTIONER.md`) that independently reviews the plan and generates questions, assumptions, and ambiguities. If questions are found, ExitPlanMode is denied with the question list injected as context. After the user answers via AskUserQuestion (which triggers `mark_questions_asked.ts`), the next ExitPlanMode attempt passes the gate and proceeds to normal plan review.

---

## Import Pattern

CC-native hooks are TypeScript, run via `bun`. Use relative imports from the hook file location.

```typescript
// Shared library imports (via _shared/lib-ts/)
import { loadHookInput, runHook, logInfo, emitContext } from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getProjectRoot } from "../../_shared/lib-ts/base/constants.js";

// CC-native library imports (via ../lib-ts/)
import { wasQuestionsAsked, markQuestionsAsked } from "../lib-ts/cc-native-state.js";
import { loadConfig } from "../lib-ts/config.js";
import type { AgentConfig } from "../lib-ts/types.js";
```

**Important:** Always use `.js` extensions in import paths — Bun resolves `.ts` files from `.js` imports.

**Import direction:** Hooks → `_cc-native/lib-ts/` → `_shared/lib-ts/`. Never reverse.

---

## Internal Call Detection

Hooks can be invoked recursively when spawning subprocesses (agents, orchestrator). Always check and skip:

```typescript
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";

function main(): void {
  // FIRST LINE of main - before any other logic
  if (isInternalCall()) return;

  // Rest of hook logic...
}
```

Without this check, the hook runs multiple times per plan review, causing duplicate reviews and state corruption.

---

## Hook Output Format

Claude Code hooks return JSON to stdout. The format is specific to each hook type.

### PreToolUse Output

Use the shared hook utilities — never construct JSON manually:

```typescript
import { emitContext, emitContextAndBlock } from "../../_shared/lib-ts/base/hook-utils.js";

// Inject context without blocking:
emitContext("Information for Claude to see...");

// Block the tool call with context and reason:
emitContextAndBlock(
  "Review feedback for Claude to see...",
  "Reason shown to Claude for the denial",
);
```

**Key insight:** The old `decision`/`reason` format fails silently. If your hook isn't affecting Claude's behavior, check the output format first. Only `hookSpecificOutput` with `additionalContext`, `permissionDecision`, and `permissionDecisionReason` fields are recognized.

---

## Debugging Output

For logging tiers, visibility rules, and stderr behavior, see **`_shared/lib-ts/CLAUDE.md`** (the shared library guide). The key rules:

- **stderr is opt-in.** `log_debug/log_info/log_warn/log_error` write to file only (no UI noise)
- **`logBlocking()` / `log_hook_error()`** for problems that must be visible
- **`eprint()`** for terminal-only UX (not logged to JSONL)
- **`print()` corrupts stdout** — never use for diagnostics

TypeScript hooks use re-exported logger functions from `hook-utils.ts`:

```typescript
import { logDebug, logInfo, logWarn, logError } from "../../_shared/lib-ts/base/hook-utils.js";

logDebug("hook-name", `Found ${items.length} items`);  // file only
logInfo("hook-name", "Starting hook...");                // file only
logError("hook-name", `Failed: ${e}`);                   // file only
```

---

## Context System Integration

Plan review hooks integrate with the shared context system for state management:

```typescript
import { getContextBySessionId, getAllContexts } from "../../_shared/lib-ts/context/context-store.js";
import { getContextReviewsDir } from "../../_shared/lib-ts/base/constants.js";

// Find active context
const context = getContextBySessionId(sessionId, projectRoot);
if (!context) {
  // Fallback: find single planning context
  const allActive = getAllContexts("active", projectRoot);
  const planning = allActive.filter((c: any) => c.mode === "active" || c.mode === "has_plan");
  if (planning.length === 1) {
    context = planning[0];
  }
}

// Get reviews directory for this context
const reviewsDir = getContextReviewsDir(context.id, projectRoot);
```

CC-native specific state is accessed via `cc-native-state.ts`:

```typescript
import { isPlanAlreadyReviewed, markPlanReviewed, wasQuestionsAsked } from "../lib-ts/cc-native-state.js";
```

---

## Error Handling

Hooks should fail gracefully — a broken hook shouldn't break the user's workflow. `runHook()` and `runHookAsync()` handle this automatically: uncaught errors log to file and exit 0 (non-blocking).

```typescript
import { runHook, logInfo } from "../../_shared/lib-ts/base/hook-utils.js";

function main(): void {
  // Hook logic — uncaught errors are handled by runHook
  logInfo("hook-name", "Starting...");
}

runHook(main, "hook_name");
```

For async hooks (plan review with parallel agents):

```typescript
import { runHookAsync } from "../../_shared/lib-ts/base/hook-utils.js";

async function main(): Promise<void> {
  // Async hook logic with Promise.all() etc.
}

runHookAsync(main, "hook_name");
```

Use `emitContextAndBlock()` for intentional blocking (e.g., plan review denial). `hookEventName` is auto-detected.

---

## Error Handling: Non-Critical Operations

Wrap non-critical shared library calls in try/catch to prevent false "hook error" UI display. See **`_shared/lib-ts/CLAUDE.md`** > Context Store for the pattern and rationale.

**When to catch locally vs let bubble:**
- **Catch locally:** Side effects like mode transitions, state saves — the hook's primary purpose can still succeed without them
- **Let bubble:** Core operations where failure means the hook genuinely can't do its job

---

## DO NOT

These are reminders based on past issues. Not enforcement rules.

- **Don't modify hook output format** without verifying the current Claude Code hook API (it changes between versions)
- **Don't use `process.exit(1)` or `process.exit(2)`** for non-fatal errors - it blocks the user's workflow
- **Don't forget template sync** after modifying hooks in `.aiwcli/` - changes should also go to `packages/cli/src/templates/cc-native/`
- **Don't use `console.log()`** for anything — it corrupts stdout. Use `emitContext()` for hook output
- **Don't assume session_id format** - it can be UUID, path-like, or other formats
- **Don't skip `is_internal_call()` check** - recursive hook execution causes state corruption
- **Don't hardcode paths** - use `getProjectRoot()` and relative imports
- **Don't let non-critical operations bubble to `runHook`** - catch locally to prevent stderr "hook error" display

---

## Verification After Changes

Validate TypeScript syntax after editing hooks:

```bash
# Quick syntax check via bun
bun --print "import('.aiwcli/_cc-native/hooks/cc-native-plan-review.ts')" 2>&1 | head -5

# Or check imports resolve (dry run)
bun build --no-bundle .aiwcli/_cc-native/hooks/add_plan_context.ts --outdir /dev/null 2>&1
```

Hooks fail silently on import errors — verify after any import path changes.

---

## Changelog

<!-- Add dated entries as new issues are discovered -->

| Date | Change |
|------|--------|
| 2026-02-14 | **Questions gate added to plan review.** `cc-native-plan-review.ts` now runs a fresh-context plan-questions agent before plan review. If `wasQuestionsAsked()` returns false, the PLAN-QUESTIONER agent (from `agents/plan-questions/`) generates questions/assumptions/ambiguities using `QUESTIONS_SCHEMA`. On questions found, ExitPlanMode is denied with question list as context. New library module: `lib-ts/plan-questions.ts`. Agent directory reorganized: review agents moved to `agents/plan-review/`, question agents in `agents/plan-questions/`. |
| 2026-02-10 | **Migrated cc-native hooks from Python to TypeScript.** `cc-native-plan-review.ts` (async, parallel agent reviews via `Promise.all()`), `add_plan_context.ts`, `plan_questions_early.ts`. All hooks use `runHook()`/`runHookAsync()` entry points. Library code in `_cc-native/lib-ts/` (18 files). Settings.json updated to use `bun` runner. Python `.py` files kept as fallback until TS hooks verified. |
| 2026-02-10 | Flipped TS logger stderr default to opt-in (`opts?.stderr === true`). Added `logBlocking()` for intentional stderr visibility. Removed redundant `{stderr: false}` from hook-utils.ts, user_prompt_submit.ts, context_monitor.ts. Added "Hook Error Visibility" section documenting visibility tiers and exit code behavior. |
| 2026-02-10 | Fixed `debug.py` `context_path` crash. Added local try/catch around `maybeActivate` in `user_prompt_submit.ts` and `context_monitor.ts` to prevent stderr error display on non-critical I/O failures. Removed dead `context_path` from `_emitHookEnd` in `hook-utils.ts`. Added "Error Handling" section to CLAUDE.md. |
| 2026-02-07 | Handoff staging lifecycle: `has_handoff` mode + `handoff_consumed` flag mirrors plan lifecycle. `save_handoff.py` no longer transitions to idle — stays active for session_end staging. `session_end.py` stages `active→has_handoff` when handoff_path set and not consumed. `session_start.py` restores `has_handoff→active` on /clear. `context_selector.py` has fallback Case 3b for has_handoff. PostToolUse context_monitor matcher simplified from specific tool list to `*`. |
| 2026-02-07 | Removed PreToolUse:Write matcher from `add_plan_context.py`. Write-time plan nudges were redundant after consolidating enforcement to PreToolUse:Task. Removed `is_plan_file_write()`, `load_plan_context_config()`, `PHASE_B_ENFORCEMENT`, `nudge_write_questions()`, and `project_dir` import. |
| 2026-02-07 | Question enforcement is now advisory-only (never blocks). `add_plan_context.py` uses `emit_context()` for all question nudges — no `permissionDecision:deny` anywhere. Removed `emit_context_and_block` import and `TASK_ENFORCEMENT_REASON` constant. |
| 2026-02-07 | Moved question enforcement to PreToolUse:Task (Plan subagent gate). `add_plan_context.py` now handles three events: PostToolUse:AskUserQuestion, PreToolUse:Task (primary gate), PreToolUse:Write (fallback). Added `is_plan_task()`, `is_internal_call()` guard, `TASK_ENFORCEMENT_CONTEXT` constant. Registered `^Task$` command hook in settings.json. |
| 2026-02-07 | Deleted `plan_accepted.py` (dead code — PostToolUse:ExitPlanMode never fires due to /clear race). Plan field assignment handled by `session_end.py` fallback. Added `plan_consumed` flag to prevent infinite plan re-staging. |
| 2026-02-07 | Hook lifecycle diagnostics: all hooks now use `run_hook(main, "hook_name")` entry point. Logs HOOK_START/HOOK_END with template origin, event type, duration_ms, and status. Millisecond timestamps in logger. |
| 2026-02-07 | Unified logger: all diagnostic logging uses `log_debug/log_info/log_warn/log_error` from `_shared/lib/base/logger.py` instead of eprint/print-to-stderr. Updated debugging and error handling docs. |
| 2026-02-06 | Merged mark_questions_asked.py into add_plan_context.py. Hook now handles both PostToolUse:AskUserQuestion and PreToolUse:Write. Deleted standalone mark_questions_asked.py. |
| 2026-02-06 | Fixed add_plan_context.py trigger docs (was PostToolUse: EnterPlanMode, is PreToolUse: Write). Added emit_context/emit_context_and_block utility docs. |
| 2026-02-03 | Initial creation |
