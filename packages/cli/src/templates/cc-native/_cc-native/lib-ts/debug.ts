/**
 * Per-context debug logging for cc-native hooks.
 * Thin delegation layer over the unified logger.
 * See cc-native-plan-review-spec.md §4.13
 *
 * Can be disabled via CCNATIVE_DEBUG_DISABLE=1 environment variable.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { hookLog } from "../../_shared/lib-ts/base/logger.js";

/** Feature flag — set CCNATIVE_DEBUG_DISABLE=1 to turn off */
const DEBUG_ENABLED = !["1", "true", "yes"].includes(
  (process.env.CCNATIVE_DEBUG_DISABLE ?? "").toLowerCase(),
);

/**
 * Get or create debug directory within context folder.
 */
export function getDebugDir(contextPath: string): string {
  const debugDir = path.join(contextPath, "debug");
  fs.mkdirSync(debugDir, { recursive: true });
  return debugDir;
}

/**
 * Write a debug log entry. Delegates to unified logger.
 */
export function debugLog(
  contextPath: string,
  sessionName: string,
  component: string,
  message: string,
  data?: unknown,
): void {
  if (!DEBUG_ENABLED) return;

  hookLog("debug", sessionName, message, {
    component,
    data,
  });
}

/**
 * Log raw output (stdout, stderr, etc). Delegates to unified logger.
 */
export function debugRaw(
  contextPath: string,
  sessionName: string,
  component: string,
  label: string,
  raw: string,
  maxLen = 10_000,
): void {
  if (!DEBUG_ENABLED) return;

  const truncated = raw.length > maxLen ? raw.slice(0, maxLen) : raw;
  const suffix =
    raw.length > maxLen ? ` [TRUNCATED from ${raw.length} chars]` : "";

  hookLog("debug", sessionName, `${label}${suffix}: ${truncated}`, {
    component,
  });
}

/**
 * Remove debug folder during context archive.
 */
export function cleanupDebugFolder(contextPath: string): void {
  try {
    const debugDir = path.join(contextPath, "debug");
    if (fs.existsSync(debugDir)) {
      fs.rmSync(debugDir, { recursive: true, force: true });
    }
  } catch {
    // Best effort cleanup
  }
}
