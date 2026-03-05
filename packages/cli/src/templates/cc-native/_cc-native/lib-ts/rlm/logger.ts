/**
 * Re-export shared logger for RLM tools.
 *
 * When RLM tools run as standalone CLI scripts (bun transcript-indexer.ts),
 * bun's module resolution uses lib-ts/package.json as the package boundary.
 * Relative imports that cross this boundary fail. This re-export bridges the gap
 * by importing at build time (when the full tsconfig include paths are resolved)
 * and re-exporting for runtime use.
 *
 * For standalone CLI execution, we inline a minimal fallback logger that writes
 * to stderr (same format as the shared logger's stderr mode).
 */

let logInfo: (hookName: string, message: string, opts?: Record<string, unknown>) => void;
let logWarn: (hookName: string, message: string, opts?: Record<string, unknown>) => void;
let logError: (hookName: string, message: string, opts?: Record<string, unknown>) => void;
let logDebug: (hookName: string, message: string, opts?: Record<string, unknown>) => void;

try {
  // Try shared logger (works when imported as part of the hook pipeline)
  const mod = await import("../../../../_core/lib-ts/runtime/logger.js");
  logInfo = mod.logInfo;
  logWarn = mod.logWarn;
  logError = mod.logError;
  logDebug = mod.logDebug;
} catch {
  // Fallback: minimal stderr+file logger for standalone CLI execution
  // eslint-disable-next-line unicorn/consistent-function-scoping -- must be inside catch for conditional init
  const fallback = (level: string) => (hookName: string, message: string, opts?: Record<string, unknown>) => {
      const shouldStderr = opts?.stderr === true || level === "error";
      if (shouldStderr) {
        process.stderr.write(`[${hookName}] ${message}\n`);
      }
      // Also try JSONL file logging
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- dynamic require in fallback path
        const fs = require("node:fs");
        // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- dynamic require in fallback path
        const path = require("node:path");
        const logDir = path.join(process.cwd(), "_output");
        fs.mkdirSync(logDir, { recursive: true });
        const entry = JSON.stringify({
          ts: new Date().toISOString(),
          level,
          hook: hookName,
          msg: message,
        });
        fs.appendFileSync(path.join(logDir, "hook-log.jsonl"), entry + "\n");
      } catch {
        // Never crash on logging failure
      }
    };
  logInfo = fallback("info");
  logWarn = fallback("warn");
  logError = fallback("error");
  logDebug = fallback("debug");
}

export { logDebug, logError, logInfo, logWarn };
