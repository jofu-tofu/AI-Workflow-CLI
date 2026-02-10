/**
 * Common utilities for hook scripts.
 * Standardized boilerplate for JSON parsing, validation, error handling.
 * See SPEC.md §5
 */

import * as fs from "node:fs";
import { logDebug, logInfo, logWarn, logError, logHookError, logDiagnostic, hookLog, setContextPath, getContextPath as _getContextPath } from "./logger.js";
import { getProjectRoot } from "./constants.js";
import { getContextBySessionId } from "../context/context-store.js";
import type { HookInput, HookOutput } from "../types.js";

// Re-export logger functions for convenience (matches Python hook_utils re-exports)
export { logDebug, logInfo, logWarn, logError, logHookError, logDiagnostic, hookLog, setContextPath };

// Context window baseline: tokens not visible in hook data §5.9
export const CONTEXT_BASELINE_TOKENS = 22_600;
export const DEFAULT_CONTEXT_WINDOW_SIZE = 200_000;

// Event metadata stash — populated by loadHookInput(), read by runHook()
let _lastHookEvent: string | null = null;
let _lastToolName: string | null = null;

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
 * See SPEC.md §5.5
 */
export function emitContext(additionalContext: string): void {
  const out: HookOutput = {
    hookSpecificOutput: {
      additionalContext,
    },
  };
  process.stdout.write(JSON.stringify(out) + "\n");
}

/**
 * Emit hookSpecificOutput that denies the tool call with context and reason.
 * See SPEC.md §5.6
 */
export function emitContextAndBlock(
  additionalContext: string,
  reason: string,
): void {
  const out: HookOutput = {
    hookSpecificOutput: {
      additionalContext,
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(out) + "\n");
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
 * Standard hook entry point with lifecycle logging.
 * See SPEC.md §5.7
 */
export function runHook(
  mainFunc: () => number | void,
  hookName = "unknown",
  prefetchedInput?: Record<string, any>,
): never {
  if (prefetchedInput !== undefined) {
    _prefetchedInput = prefetchedInput;
  }

  const startTime = performance.now();
  const template = detectTemplate();
  const event = _lastHookEvent ?? "unknown";
  const tool = _lastToolName;

  // HOOK_START
  const startData: Record<string, any> = {
    lifecycle: "start",
    template,
    event,
  };
  if (tool) startData.tool = tool;
  logInfo(hookName, "HOOK_START", { data: startData });

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
  if (prefetchedInput !== undefined) {
    _prefetchedInput = prefetchedInput;
  }

  const startTime = performance.now();
  const template = detectTemplate();
  const event = _lastHookEvent ?? "unknown";
  const tool = _lastToolName;

  // HOOK_START
  const startData: Record<string, any> = {
    lifecycle: "start",
    template,
    event,
  };
  if (tool) startData.tool = tool;
  logInfo(hookName, "HOOK_START", { data: startData });

  mainFunc()
    .then((result) => {
      const exitCode = typeof result === "number" ? result : 0;
      _emitHookEnd(hookName, startTime, exitCode, exitCode !== 0 ? "blocked" : "success", null, startData, event, tool, template);
      process.exit(exitCode);
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
      process.exit(exitCode);
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
  // Retroactive HOOK_START to per-context log
  const resolvedAfter = _getContextPath();
  if (resolvedAfter && fs.existsSync(resolvedAfter)) {
    hookLog("info", hookName, "HOOK_START", {
      data: startData,
      context_path: resolvedAfter,
      stderr: false,
    });
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
    logHookError(hookName, err, endEvent, tb);
    logError(hookName, `HOOK_END: ${err}`, { data: endData, traceback_str: tb });
  } else if (status === "blocked") {
    logWarn(hookName, "HOOK_END", { data: endData });
  } else {
    logInfo(hookName, "HOOK_END", { data: endData });
  }
}
