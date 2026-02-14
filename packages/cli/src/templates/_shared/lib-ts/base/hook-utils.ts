/**
 * Common utilities for hook scripts.
 * Standardized boilerplate for JSON parsing, validation, error handling.
 * See SPEC.md §5
 */

import * as fs from "node:fs";
import { logDebug, logInfo, logWarn, logError, logBlocking, logHookError, logDiagnostic, hookLog, setSessionId, setContextPath, getContextPath as _getContextPath } from "./logger.js";
import { getProjectRoot } from "./constants.js";
import { getContextBySessionId } from "../context/context-store.js";
import type { HookInput, HookOutput } from "../types.js";

// Re-export logger functions for convenience (matches Python hook_utils re-exports)
export { logDebug, logInfo, logWarn, logError, logBlocking, logHookError, logDiagnostic, hookLog, setSessionId, setContextPath };

// Context window baseline: tokens not visible in hook data §5.9
export const CONTEXT_BASELINE_TOKENS = 22_600;
export const DEFAULT_CONTEXT_WINDOW_SIZE = 200_000;

// Event metadata stash — populated by loadHookInput(), read by runHook()
let _lastHookEvent: string | null = null;
let _lastToolName: string | null = null;
let _cachedHookName: string | null = null;

// Pre-fetched input stash
let _prefetchedInput: Record<string, any> | null = null;

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
      _lastHookEvent = result.hook_event_name ?? null;
      _lastToolName = result.tool_name ?? null;
    }
    return result as HookInput;
  }

  try {
    // Read entire stdin using fd 0 (cross-platform, works on Windows)
    const inputData = fs.readFileSync(0, "utf-8").trim();
    if (!inputData) return null;

    const result = JSON.parse(inputData);
    if (result && typeof result === "object") {
      _lastHookEvent = result.hook_event_name ?? null;
      _lastToolName = result.tool_name ?? null;
    }
    return result as HookInput;
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
): Record<string, any> | null {
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

  const metadata = toolInput.metadata;
  if (metadata && typeof metadata === "object" && metadata.skip_persistence) {
    logDebug(hookName, "Skipping persistence (skip_persistence flag set)");
    return true;
  }
  return false;
}

/**
 * Emit hookSpecificOutput with additionalContext to stdout.
 * hookEventName is required by Claude Code's Zod validator (discriminated union).
 * Auto-detected from stdin payload (set by loadHookInput/runHook).
 * See SPEC.md §5.5
 */
export function emitContext(additionalContext: string): void {
  const eventName = _lastHookEvent ?? undefined;
  const tool = _lastToolName;
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

/** Log hook output (context or block) to hook-log.jsonl for visibility. */
function _logEmit(type: "context" | "block", chars: number, payload: Record<string, any>): void {
  const hook = _cachedHookName ?? "unknown";
  const event = payload.event ?? "unknown";
  const msg = type === "block"
    ? `HOOK_OUTPUT [${type}] ${event} ${chars} chars, reason="${(payload.blockReason ?? "").slice(0, 80)}"`
    : `HOOK_OUTPUT [${type}] ${event} ${chars} chars`;
  hookLog("info", hook, msg, { data: payload });
}

/**
 * Auto-detect template origin from the hook script path.
 */
function detectTemplate(scriptPath = ""): string {
  const p = (scriptPath || (process.argv[1] ?? "")).replace(/\\/g, "/");
  if (p.includes("/_shared/hooks/") || p.startsWith("_shared/hooks/")) {
    return "shared";
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
function _earlyReadInput(prefetchedInput?: Record<string, any>): void {
  if (prefetchedInput !== undefined) {
    _prefetchedInput = prefetchedInput;
  }

  // If we already have prefetched input, extract metadata from it
  if (_prefetchedInput && typeof _prefetchedInput === "object") {
    _lastHookEvent = _prefetchedInput.hook_event_name ?? null;
    _lastToolName = _prefetchedInput.tool_name ?? null;
    if (_prefetchedInput.session_id) {
      setSessionId(_prefetchedInput.session_id);
    }
    return;
  }

  // Read stdin now so HOOK_START can include sid
  try {
    const inputData = fs.readFileSync(0, "utf-8").trim();
    if (inputData) {
      const parsed = JSON.parse(inputData);
      if (parsed && typeof parsed === "object") {
        _prefetchedInput = parsed;
        _lastHookEvent = parsed.hook_event_name ?? null;
        _lastToolName = parsed.tool_name ?? null;
        if (parsed.session_id) {
          setSessionId(parsed.session_id);
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
  prefetchedInput?: Record<string, any>,
): never {
  _earlyReadInput(prefetchedInput);
  _cachedHookName = hookName;

  const startTime = performance.now();
  const template = detectTemplate();
  const event = _lastHookEvent ?? "unknown";
  const tool = _lastToolName;

  const startData: Record<string, any> = {
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
  } catch (e: any) {
    if (e instanceof Error && e.message.startsWith("SystemExit:")) {
      const code = parseInt(e.message.slice(11), 10);
      exitCode = isNaN(code) ? (e.message.slice(11) ? 1 : 0) : code;
      status = exitCode !== 0 ? "blocked" : "success";
    } else {
      exitCode = 0; // Non-blocking
      status = "error";
      const stack = e instanceof Error ? e.stack ?? "" : "";
      errorInfo = [e instanceof Error ? e : new Error(String(e)), stack];
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
  prefetchedInput?: Record<string, any>,
): void {
  _earlyReadInput(prefetchedInput);
  _cachedHookName = hookName;

  const startTime = performance.now();
  const template = detectTemplate();
  const event = _lastHookEvent ?? "unknown";
  const tool = _lastToolName;

  const startData: Record<string, any> = {
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
    .catch((e: any) => {
      let exitCode = 0;
      let status = "error";
      let errorInfo: [Error, string] | null = null;

      if (e instanceof Error && e.message.startsWith("SystemExit:")) {
        const code = parseInt(e.message.slice(11), 10);
        exitCode = isNaN(code) ? (e.message.slice(11) ? 1 : 0) : code;
        status = exitCode !== 0 ? "blocked" : "success";
      } else {
        exitCode = 0; // Non-blocking (fail open)
        const stack = e instanceof Error ? e.stack ?? "" : "";
        errorInfo = [e instanceof Error ? e : new Error(String(e)), stack];
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
  startData: Record<string, any>,
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
  const endData: Record<string, any> = {
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
    hookLog("error", hookName, `[${endEvent}] ${err.constructor.name}: ${String(err).replace(/[\n\r]/g, " ").slice(0, 200)}`, { traceback_str: tb });
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
