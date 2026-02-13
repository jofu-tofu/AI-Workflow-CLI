/**
 * Unified logging for all hooks and libraries.
 *
 * Log format: JSONL (one JSON object per line)
 * Log location: _output/hook-log.jsonl (global, all sessions)
 * Filter by session using the "sid" field.
 *
 * stderr is OPT-IN: convenience functions (logDebug, logInfo, logWarn, logError)
 * write to file only by default. To also write to stderr (visible to Claude Code
 * as "hook error"), pass { stderr: true } or use logBlocking().
 * logHookError() always writes to stderr (unhandled errors must be visible).
 *
 * Environment variables:
 * - HOOK_LOG_DISABLE=1: Disable all file logging
 * - HOOK_LOG_LEVEL=warn: Minimum level to log (default: debug)
 * - HOOK_ERROR_LOG_DISABLE=1: Legacy alias for HOOK_LOG_DISABLE
 *
 * Never throws. No buffering. Stdlib only.
 * See SPEC.md §3
 */

import * as fs from "node:fs";
import * as path from "node:path";

const LEVELS: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MAX_LOG_LINES = 10_000; // Max lines in global log before pruning

// Module-level session ID cache
let _cachedSessionId: string | null = null;

// Module-level context path cache (kept for external callers)
let _cachedContextPath: string | null = null;
let _contextResolved = false;

/**
 * Set the session ID for this process. All subsequent log calls include it.
 */
export function setSessionId(sessionId: string | null): void {
  _cachedSessionId = sessionId;
}

/**
 * Set the context path for this process. Kept for external callers.
 */
export function setContextPath(contextPath: string | null): void {
  _cachedContextPath = contextPath;
  _contextResolved = true;
}

export function getContextPath(): string | null {
  if (!_contextResolved) {
    _contextResolved = true; // Don't retry
  }
  return _cachedContextPath;
}

function getMinLevel(): number {
  const env = (process.env.HOOK_LOG_LEVEL ?? "debug").toLowerCase();
  return LEVELS[env] ?? 0;
}

function isDisabled(): boolean {
  return (
    process.env.HOOK_LOG_DISABLE === "1" ||
    process.env.HOOK_ERROR_LOG_DISABLE === "1" ||
    process.env.CCNATIVE_DEBUG_DISABLE === "1"
  );
}

function getProjectRoot(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/**
 * Write a structured log entry to the global hook log.
 *
 * All entries go to _output/hook-log.jsonl. Use the "sid" field
 * (set via setSessionId) to filter by session.
 */
export function hookLog(
  level: string,
  hookName: string,
  message: string,
  opts?: {
    component?: string;
    data?: any;
    traceback_str?: string;
    stderr?: boolean;
  },
): void {
  try {
    const levelLower = level.toLowerCase();
    const levelNum = LEVELS[levelLower] ?? 0;
    const component = opts?.component ?? "";
    const tracebackStr = opts?.traceback_str ?? "";
    const stderrEnabled = opts?.stderr === true;

    // Write to stderr
    if (stderrEnabled) {
      const prefix = component
        ? `[${hookName}:${component}]`
        : `[${hookName}]`;
      process.stderr.write(`${prefix} ${message}\n`);
      if (tracebackStr) {
        process.stderr.write(tracebackStr + "\n");
      }
    }

    // Check if file logging is enabled
    if (isDisabled()) return;

    // Check minimum level
    if (levelNum < getMinLevel()) return;

    // Build JSONL entry
    const now = new Date();
    const ts = now.toISOString().replace("Z", "").slice(0, 23);
    const entry: Record<string, any> = {
      ts,
      level: levelLower,
      hook: hookName,
      msg: message,
    };
    if (_cachedSessionId) entry.sid = _cachedSessionId;
    if (component) entry.component = component;
    if (opts?.data !== undefined && opts.data !== null) {
      try {
        JSON.stringify(opts.data);
        entry.data = opts.data;
      } catch {
        entry.data = String(opts.data);
      }
    }
    if (tracebackStr) entry.tb = tracebackStr.trimEnd();

    const line = JSON.stringify(entry) + "\n";

    // Always write to global log
    const logPath = path.join(getProjectRoot(), "_output", "hook-log.jsonl");

    // Ensure directory exists
    const dir = path.dirname(logPath);
    fs.mkdirSync(dir, { recursive: true });

    // Line-count guard: prune to last MAX_LOG_LINES
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, "utf-8");
        const lines = content.split(/\r?\n/);
        if (lines.length > MAX_LOG_LINES) {
          fs.writeFileSync(
            logPath,
            lines.slice(lines.length - MAX_LOG_LINES).join("\n"),
            "utf-8",
          );
        }
      }
    } catch {
      // ignore
    }

    fs.appendFileSync(logPath, line, "utf-8");
  } catch {
    // Never crash
  }
}

export function logDebug(hookName: string, message: string, opts?: Record<string, any>): void {
  hookLog("debug", hookName, message, opts);
}

export function logInfo(hookName: string, message: string, opts?: Record<string, any>): void {
  hookLog("info", hookName, message, opts);
}

export function logWarn(hookName: string, message: string, opts?: Record<string, any>): void {
  hookLog("warn", hookName, message, opts);
}

export function logError(hookName: string, message: string, opts?: Record<string, any>): void {
  hookLog("error", hookName, message, opts);
}

/**
 * Log an error that SHOULD be visible to user/model via stderr.
 * Use for real problems needing attention, not routine diagnostics.
 */
export function logBlocking(hookName: string, message: string, opts?: Record<string, any>): void {
  hookLog("error", hookName, message, { ...opts, stderr: true });
}

/**
 * Log a structured diagnostic entry at a hook decision point.
 * See SPEC.md §3.8
 */
export function logDiagnostic(
  hookName: string,
  phase: string,
  summary: string,
  opts?: {
    inputs?: any;
    decision?: any;
    reasoning?: any;
    component?: string;
    data?: any;
  },
): void {
  const diagData: Record<string, any> = { phase };
  if (opts?.inputs !== undefined) diagData.inputs = opts.inputs;
  if (opts?.decision !== undefined) diagData.decision = opts.decision;
  if (opts?.reasoning !== undefined) diagData.reasoning = opts.reasoning;
  if (opts?.data && typeof opts.data === "object") {
    Object.assign(diagData, opts.data);
  }
  hookLog("debug", hookName, `[DIAG:${phase}] ${summary}`, {
    component: opts?.component ?? "diag",
    data: diagData,
  });
}

/**
 * Backward-compatible wrapper matching old hook_utils.log_hook_error signature.
 * See SPEC.md §3.6
 */
export function logHookError(
  hookName: string,
  error: Error | string,
  hookEvent = "unknown",
  tracebackStr = "",
): void {
  const errStr = typeof error === "string" ? error : String(error);
  const msg = errStr.replace(/[\n\r]/g, " ").slice(0, 200);
  const errType =
    typeof error === "object" && error !== null
      ? error.constructor.name
      : "Error";
  hookLog("error", hookName, `[${hookEvent}] ${errType}: ${msg}`, {
    traceback_str: tracebackStr,
    stderr: true,
  });
}
