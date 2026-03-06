/**
 * Common utilities for hook scripts.
 * Standardized boilerplate for JSON parsing, validation, error handling.
 * See SPEC.md §5
 */

import * as fs from "node:fs";

import { getContextBySessionId } from "../context/context-store.js";
import { getProjectRoot } from "../runtime/constants.js";
import { logDebug,  logWarn,     hookLog, setSessionId,  getContextPath as _getContextPath } from "../runtime/logger.js";
import type { HookInput, HookOutput, PermissionRequestOutput } from "../types.js";

// Re-export logger functions for convenience (matches Python hook_utils re-exports)


// Context window baseline: tokens not visible in hook data §5.9
export const CONTEXT_BASELINE_TOKENS = 22_600;
export const DEFAULT_CONTEXT_WINDOW_SIZE = 200_000;

// Event metadata stash — populated by loadHookInput(), read by runHook()
let _lastHookEvent: string | null = null;
let _lastToolName: string | null = null;
let _cachedHookName: string | null = null;

// Pre-fetched input stash
let _prefetchedInput: Record<string, unknown> | null = null;

function readStringField(value: Record<string, unknown>, key: string): null | string {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

/**
 * Load and parse JSON from stdin (or return prefetched input if set).
 * Returns null if stdin is empty or invalid JSON.
 * See SPEC.md §5.1
 */
export function loadHookInput(): HookInput | null {
  if (_prefetchedInput !== null) {
    const result = _prefetchedInput;
    _prefetchedInput = null; // consume once
    if (result && typeof result === "object") {
      _lastHookEvent = readStringField(result, "hook_event_name");
      _lastToolName = readStringField(result, "tool_name");
    }
    return result as unknown as HookInput;
  }

  try {
    // Read entire stdin using fd 0 (cross-platform, works on Windows)
    const inputData = fs.readFileSync(0, "utf8").trim();
    if (!inputData) return null;

    const result = JSON.parse(inputData) as Record<string, unknown>;
    if (result && typeof result === "object") {
      _lastHookEvent = readStringField(result, "hook_event_name");
      _lastToolName = readStringField(result, "tool_name");
    }
    return result as unknown as HookInput;
  } catch {
    return null;
  }
}

/**
 * Validate hook event type and optional tool name.
 * See SPEC.md §5.2
 */
export function validateHookEvent(
  payload: HookInput,
  expectedEvent: string,
  expectedTool?: string,
): boolean {
  if (payload.hook_event_name !== expectedEvent) return false;
  if (expectedTool && payload.tool_name !== expectedTool) return false;
  return true;
}

/**
 * Extract and validate tool_input from payload.
 * See SPEC.md §5.3
 */
export function getToolInput(
  payload: HookInput,
): Record<string, unknown> | null {
  const toolInput = payload.tool_input;
  return toolInput && typeof toolInput === "object" ? toolInput : null;
}

/**
 * Check if persistence should be skipped based on metadata flags.
 * See SPEC.md §5.4
 */
export function checkSkipPersistence(
  payload: HookInput,
  hookName = "hook",
): boolean {
  const toolInput = getToolInput(payload);
  if (!toolInput) return false;

  const {metadata} = toolInput;
  if (
    metadata &&
    typeof metadata === "object" &&
    Boolean((metadata as Record<string, unknown>).skip_persistence)
  ) {
    logDebug(hookName, "Skipping persistence (skip_persistence flag set)");
    return true;
  }
  return false;
}

/**
 * Emit hookSpecificOutput with additionalContext to stdout.
 * hookEventName is required by Claude Code's Zod validator (discriminated union).
 * Auto-detected from stdin payload (set by loadHookInput/runHook).
 *
 * SubagentStop and Stop events use top-level systemMessage field instead of hookSpecificOutput.
 * See SPEC.md §5.5
 */
export function emitContext(additionalContext: string): void {
  const eventName = _lastHookEvent ?? undefined;
  const tool = _lastToolName;

  // SubagentStop and Stop use top-level systemMessage field
  if (eventName === "SubagentStop" || eventName === "Stop") {
    const out = { systemMessage: additionalContext };
    process.stdout.write(JSON.stringify(out) + "\n");
    _logEmit("systemMessage", additionalContext.length, { event: eventName ?? "unknown", systemMessage: additionalContext });
    return;
  }

  // All other events use hookSpecificOutput
  const out: HookOutput = {
    hookSpecificOutput: {
      ...(eventName ? { hookEventName: eventName } : {}),
      additionalContext,
    },
  };
  const json = JSON.stringify(out);
  const eventDesc = tool ? `${eventName}:${tool}` : eventName ?? "unknown";
  _logEmit("context", additionalContext.length, { event: eventDesc, additionalContext });
  process.stdout.write(json + "\n");
}

/**
 * Emit hookSpecificOutput that denies the tool call with context and reason.
 * hookEventName is required by Claude Code's Zod validator (discriminated union).
 * Auto-detected from stdin payload (set by loadHookInput/runHook).
 * See SPEC.md §5.6
 */
export function emitContextAndBlock(
  additionalContext: string,
  reason: string,
): void {
  const eventName = _lastHookEvent ?? undefined;
  if (eventName && eventName !== "PreToolUse") {
    logWarn(_cachedHookName ?? "unknown",
      `emitContextAndBlock() called from ${eventName} — permissionDecision only works for PreToolUse. ` +
      `Use emitBlock() or the event-specific function instead.`);
  }
  const tool = _lastToolName;
  const out: HookOutput = {
    hookSpecificOutput: {
      ...(eventName ? { hookEventName: eventName } : {}),
      additionalContext,
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  const json = JSON.stringify(out);
  const eventDesc = tool ? `${eventName}:${tool}` : eventName ?? "unknown";
  _logEmit("block", additionalContext.length, { event: eventDesc, additionalContext, blockReason: reason });
  process.stdout.write(json + "\n");
}

/** Log hook output (context, systemMessage, or block) to hook-log.jsonl for visibility. */
function _logEmit(type: "context" | "systemMessage" | "block", chars: number, payload: Record<string, unknown>): void {
  const hook = _cachedHookName ?? "unknown";
  const event = payload.event ?? "unknown";
  const mechanism = payload.mechanism ? ` via ${payload.mechanism}` : "";
  const msg = type === "block"
    ? `HOOK_OUTPUT [${type}] ${event} ${chars} chars${mechanism}, reason="${String(payload.blockReason ?? "").slice(0, 80)}"`
    : `HOOK_OUTPUT [${type}] ${event} ${chars} chars`;
  hookLog("info", hook, msg, { data: payload });
}

/**
 * Block a user prompt submission with a reason.
 * Only works for UserPromptSubmit hooks.
 * Output: top-level { decision: "block", reason } + optional hookSpecificOutput.additionalContext
 */
export function emitBlockPrompt(reason: string, context?: string): void {
  const eventName = _lastHookEvent ?? undefined;
  if (eventName && eventName !== "UserPromptSubmit") {
    logWarn(_cachedHookName ?? "unknown",
      `emitBlockPrompt() called from ${eventName} — only works for UserPromptSubmit`);
  }
  const out: HookOutput = {
    decision: "block",
    reason,
    ...(context ? {
      hookSpecificOutput: {
        ...(eventName ? { hookEventName: eventName } : {}),
        additionalContext: context,
      }
    } : {}),
  };
  _logEmit("block", context?.length ?? 0, { event: eventName ?? "unknown", additionalContext: context, blockReason: reason });
  process.stdout.write(JSON.stringify(out) + "\n");
}

/**
 * Block via exit code 2 + stderr feedback.
 * Works for PostToolUse, PostToolUseFailure.
 * The reason becomes the stderr message (fed to Claude as system-reminder).
 * If context is provided, it's prepended to the stderr message for richer feedback.
 * NOTE: Exit 2 causes Claude Code to ignore all JSON stdout — only stderr matters.
 */
export function emitBlockViaExit(reason: string, context?: string): void {
  const stderrMessage = context ? `${context}\n\n${reason}` : reason;
  _logEmit("block", stderrMessage.length, {
    event: _lastHookEvent ?? "unknown",
    blockReason: reason,
    mechanism: "exit2",
  });
  process.stderr.write(stderrMessage + "\n");
  throw new Error("SystemExit:2");
}

/**
 * Block via top-level { decision: "block", reason }.
 * Works for Stop and SubagentStop events.
 * These events do NOT support additionalContext — only reason is available.
 */
export function emitBlockTopLevel(reason: string): void {
  const eventName = _lastHookEvent ?? undefined;
  if (eventName && eventName !== "Stop" && eventName !== "SubagentStop") {
    logWarn(_cachedHookName ?? "unknown",
      `emitBlockTopLevel() called from ${eventName} — only works for Stop/SubagentStop`);
  }
  const out = { decision: "block", reason };
  _logEmit("block", reason.length, {
    event: eventName ?? "unknown",
    blockReason: reason,
    mechanism: "topLevelDecision",
  });
  process.stdout.write(JSON.stringify(out) + "\n");
}

/**
 * Respond to a PermissionRequest with allow/deny.
 * Only works for PermissionRequest hooks.
 */
export function emitPermissionDecision(
  behavior: "allow" | "deny",
  opts?: { message?: string; updatedInput?: Record<string, unknown>; updatedPermissions?: Record<string, unknown> },
): void {
  const out: PermissionRequestOutput = {
    decision: {
      behavior,
      ...(opts?.message ? { message: opts.message } : {}),
      ...(opts?.updatedInput ? { updatedInput: opts.updatedInput } : {}),
      ...(opts?.updatedPermissions ? { updatedPermissions: opts.updatedPermissions } : {}),
    },
  };
  _logEmit("block", 0, {
    event: _lastHookEvent ?? "unknown",
    blockReason: `permission:${behavior}`,
    mechanism: "permissionRequest",
  });
  process.stdout.write(JSON.stringify(out) + "\n");
}

/**
 * Unified block dispatcher — auto-detects the correct blocking mechanism
 * based on the current hook event type.
 *
 * PreToolUse → permissionDecision: "deny" (via emitContextAndBlock)
 * UserPromptSubmit → top-level decision: "block" (via emitBlockPrompt)
 * PostToolUse/PostToolUseFailure → exit(2) + stderr (via emitBlockViaExit)
 * Stop/SubagentStop → top-level { decision: "block", reason } (via emitBlockTopLevel)
 * PermissionRequest → decision: { behavior: "deny" } (via emitPermissionDecision)
 * SessionStart/Notification/SubagentStart/SessionEnd/etc. → warn and no-op
 *
 * This is the RECOMMENDED universal blocking API. Hook authors should use
 * emitBlock() and let the library handle event-specific dispatch.
 */
export function emitBlock(reason: string, context?: string): void {
  const event = _lastHookEvent;
  switch (event) {
    case "PermissionRequest": {
      emitPermissionDecision("deny", { message: reason });
      break;
    }
    case "PostToolUse":
    case "PostToolUseFailure": {
      emitBlockViaExit(reason, context);
      break;
    }
    case "PreToolUse": {
      emitContextAndBlock(context ?? reason, reason);
      break;
    }
    case "Stop":
    case "SubagentStop": {
      emitBlockTopLevel(reason);
      break;
    }
    case "UserPromptSubmit": {
      emitBlockPrompt(reason, context);
      break;
    }
    default: {
      logWarn(_cachedHookName ?? "unknown",
        `emitBlock() called from ${event ?? "unknown"} — no blocking mechanism exists for this event type, ignoring`);
      break;
    }
  }
}

/**
 * Auto-detect template origin from the hook script path.
 */
function detectTemplate(scriptPath = ""): string {
  const p = (scriptPath || (process.argv[1] ?? "")).replaceAll('\\', "/");
  if (
    p.includes("/_core/hooks-ts/") ||
    p.startsWith("_core/hooks-ts/") ||
    p.includes("/core/hooks-ts/") ||
    p.startsWith("core/hooks-ts/")
  ) {
    return "core";
  }
  const match = p.match(/_([a-z][a-z0-9-]*)\/hooks\//);
  if (match?.[1]) return match[1]; // e.g., "cc-native"
  return "unknown";
}

/**
 * Parse context window from hook input.
 * Returns [tokensUsed, maxTokens] or [null, null].
 * See SPEC.md §5.9
 */
export function parseContextWindow(
  hookInput: HookInput,
): [number | null, number | null] {
  const contextWindow = hookInput.context_window;
  if (!contextWindow) return [null, null];

  const currentUsage = contextWindow.current_usage;
  if (!currentUsage) return [null, null];

  const cacheRead = currentUsage.cache_read_input_tokens ?? 0;
  const inputTokens = currentUsage.input_tokens ?? 0;
  const cacheCreation = currentUsage.cache_creation_input_tokens ?? 0;
  const outputTokens = currentUsage.output_tokens ?? 0;

  const contentTokens = cacheRead + inputTokens + cacheCreation + outputTokens;
  const tokensUsed = contentTokens + CONTEXT_BASELINE_TOKENS;
  const maxTokens = contextWindow.context_window_size ?? DEFAULT_CONTEXT_WINDOW_SIZE;

  return [tokensUsed, maxTokens];
}

/**
 * Get context percentage remaining with fallback.
 * Returns [percentRemaining, tokensUsed, maxTokens] or [null, null, null].
 * See SPEC.md §5.9
 */
export function getContextPercentRemaining(
  hookInput: HookInput,
): [number | null, number | null, number | null] {
  const [tokensUsed, maxTokens] = parseContextWindow(hookInput);

  if (tokensUsed !== null && maxTokens !== null && maxTokens > 0) {
    const remaining = maxTokens - tokensUsed;
    const percentRemaining = Math.max(
      0,
      Math.min(100, Math.round((remaining / maxTokens) * 100)),
    );
    return [percentRemaining, tokensUsed, maxTokens];
  }

  // Source 2: context.json fallback (written by status_line.py)
  try {
    const sessionId = hookInput.session_id;
    if (sessionId) {
      const projectRoot = getProjectRoot(hookInput.cwd);
      const context = getContextBySessionId(sessionId, projectRoot);
      if (context?.last_session?.context_remaining_pct !== undefined) {
        return [context.last_session.context_remaining_pct, null, null];
      }
    }
  } catch {
    // Fallback failed — degrade gracefully
  }

  return [null, null, null];
}

/**
 * Read stdin early and extract session_id + event metadata.
 * Stashes parsed input for loadHookInput() to consume later.
 */
function _earlyReadInput(prefetchedInput?: Record<string, unknown>): void {
  if (prefetchedInput !== undefined) {
    _prefetchedInput = prefetchedInput;
  }

  // If we already have prefetched input, extract metadata from it
  if (_prefetchedInput && typeof _prefetchedInput === "object") {
    _lastHookEvent = readStringField(_prefetchedInput, "hook_event_name");
    _lastToolName = readStringField(_prefetchedInput, "tool_name");
    const sessionId = readStringField(_prefetchedInput, "session_id");
    if (sessionId) {
      setSessionId(sessionId);
    }
    return;
  }

  // Read stdin now so HOOK_START can include sid
  try {
    const inputData = fs.readFileSync(0, "utf8").trim();
    if (inputData) {
      const parsed = JSON.parse(inputData) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        _prefetchedInput = parsed;
        _lastHookEvent = readStringField(parsed, "hook_event_name");
        _lastToolName = readStringField(parsed, "tool_name");
        const sessionId = readStringField(parsed, "session_id");
        if (sessionId) {
          setSessionId(sessionId);
        }
      }
    }
  } catch {
    // Non-fatal — loadHookInput will return null
  }
}

/**
 * Standard hook entry point with lifecycle logging.
 * See SPEC.md §5.7
 */
export function runHook(
  mainFunc: () => number | void,
  hookName = "unknown",
  prefetchedInput?: Record<string, unknown>,
): never {
  _earlyReadInput(prefetchedInput);
  _cachedHookName = hookName;

  // Ensure cwd is project root so relative paths in hooks resolve correctly,
  // even when cwd has drifted via `cd` in a Bash tool call.
  try {
    const cwd = _prefetchedInput ? readStringField(_prefetchedInput, "cwd") ?? undefined : undefined;
    const projectRoot = getProjectRoot(cwd);
    if (process.cwd() !== projectRoot) process.chdir(projectRoot);
  } catch { /* non-fatal — proceed with current cwd */ }

  const startTime = performance.now();
  const template = detectTemplate();
  const event = _lastHookEvent ?? "unknown";
  const tool = _lastToolName;

  const startData: Record<string, unknown> = {
    lifecycle: "start",
    template,
    event,
  };
  if (tool) startData.tool = tool;
  hookLog("info", hookName, "HOOK_START", { data: startData });

  let exitCode = 0;
  let status = "success";
  let errorInfo: [Error, string] | null = null;

  try {
    const result = mainFunc();
    exitCode = typeof result === "number" ? result : 0;
    status = exitCode !== 0 ? "blocked" : "success";
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("SystemExit:")) {
      const code = parseInt(error.message.slice(11), 10);
      exitCode = isNaN(code) ? (error.message.slice(11) ? 1 : 0) : code;
      status = exitCode !== 0 ? "blocked" : "success";
    } else {
      exitCode = 0; // Non-blocking
      status = "error";
      const stack = error instanceof Error ? error.stack ?? "" : "";
      errorInfo = [error instanceof Error ? error : new Error(String(error)), stack];
    }
  }

  _emitHookEnd(hookName, startTime, exitCode, status, errorInfo, startData, event, tool, template);
  process.exit(exitCode);
}

/**
 * Async variant of runHook for hooks that need await (e.g., AI inference).
 * Provides identical structured JSONL lifecycle logging as runHook.
 * See SPEC.md §5.7
 */
export function runHookAsync(
  mainFunc: () => Promise<number | void>,
  hookName = "unknown",
  prefetchedInput?: Record<string, unknown>,
): void {
  _earlyReadInput(prefetchedInput);
  _cachedHookName = hookName;

  // Ensure cwd is project root so relative paths in hooks resolve correctly,
  // even when cwd has drifted via `cd` in a Bash tool call.
  try {
    const cwd = _prefetchedInput ? readStringField(_prefetchedInput, "cwd") ?? undefined : undefined;
    const projectRoot = getProjectRoot(cwd);
    if (process.cwd() !== projectRoot) process.chdir(projectRoot);
  } catch { /* non-fatal — proceed with current cwd */ }

  const startTime = performance.now();
  const template = detectTemplate();
  const event = _lastHookEvent ?? "unknown";
  const tool = _lastToolName;

  const startData: Record<string, unknown> = {
    lifecycle: "start",
    template,
    event,
  };
  if (tool) startData.tool = tool;
  hookLog("info", hookName, "HOOK_START", { data: startData });

  mainFunc()
    .then((result) => {
      const exitCode = typeof result === "number" ? result : 0;
      _emitHookEnd(hookName, startTime, exitCode, exitCode !== 0 ? "blocked" : "success", null, startData, event, tool, template);
      _drainAndExit(exitCode);
    })
    .catch((error: unknown) => {
      let exitCode = 0;
      let status = "error";
      let errorInfo: [Error, string] | null = null;

      if (error instanceof Error && error.message.startsWith("SystemExit:")) {
        const code = parseInt(error.message.slice(11), 10);
        exitCode = isNaN(code) ? (error.message.slice(11) ? 1 : 0) : code;
        status = exitCode !== 0 ? "blocked" : "success";
      } else {
        exitCode = 0; // Non-blocking (fail open)
        const stack = error instanceof Error ? error.stack ?? "" : "";
        errorInfo = [error instanceof Error ? error : new Error(String(error)), stack];
      }

      _emitHookEnd(hookName, startTime, exitCode, status, errorInfo, startData, event, tool, template);
      _drainAndExit(exitCode);
    });
}

/** Shared HOOK_END logic for runHook and runHookAsync */
function _emitHookEnd(
  hookName: string,
  startTime: number,
  exitCode: number,
  status: string,
  errorInfo: [Error, string] | null,
  startData: Record<string, unknown>,
  event: string,
  tool: string | null,
  template: string,
): void {
  // Retroactive HOOK_START to per-context log (context_path resolved after main runs)
  const resolvedAfter = _getContextPath();
  if (resolvedAfter && fs.existsSync(resolvedAfter)) {
    hookLog("info", hookName, "HOOK_START", { data: startData });
  }

  const durationMs = Math.round((performance.now() - startTime) * 10) / 10;
  const endEvent = _lastHookEvent ?? event;
  const endTool = _lastToolName ?? tool;
  const endData: Record<string, unknown> = {
    lifecycle: "end",
    status,
    duration_ms: durationMs,
    exit_code: exitCode,
    template,
    event: endEvent,
  };
  if (endTool) endData.tool = endTool;

  if (errorInfo) {
    const [err, tb] = errorInfo;
    endData.error_type = err.constructor.name;
    hookLog("error", hookName, `[${endEvent}] ${err.constructor.name}: ${String(err).replaceAll(/[\n\r]/g, " ").slice(0, 200)}`, { traceback_str: tb });
    hookLog("error", hookName, `HOOK_END: ${err}`, { data: endData, traceback_str: tb });
  } else if (status === "blocked") {
    hookLog("warn", hookName, "HOOK_END", { data: endData });
  } else {
    hookLog("info", hookName, "HOOK_END", { data: endData });
  }
}

/**
 * Drain stdout before exiting to ensure pipe consumers receive all data.
 * On Windows, stdout to a pipe is fully buffered — process.exit() can
 * discard unflushed data. This waits for the write buffer to drain.
 */
function _drainAndExit(code: number): void {
  // If stdout is already finished or not writable, exit immediately
  if (!process.stdout.writable || process.stdout.writableFinished) {
    process.exit(code);
  }

  // Attempt to end stdout and wait for drain
  const timeout = setTimeout(() => process.exit(code), 1000); // safety fallback
  process.stdout.end(() => {
    clearTimeout(timeout);
    process.exit(code);
  });
}

export {hookLog, logBlocking, logDebug, logDiagnostic, logError, logHookError, logInfo, logWarn, setContextPath, setSessionId} from "../runtime/logger.js";

