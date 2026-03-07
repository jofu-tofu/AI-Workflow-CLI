/**
 * Security and configuration constants for cc-native plan review.
 * See cc-native-plan-review-spec.md §4.15
 */

import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Feature Flags
// ---------------------------------------------------------------------------

/** Enable atomic writes for plan state files (env: CC_NATIVE_ROBUST_WRITES) */
export const ENABLE_ROBUST_PLAN_WRITES =
  (process.env.CC_NATIVE_ROBUST_WRITES ?? "true").toLowerCase() === "true";

/** Enable plan review notifications (env: CC_NATIVE_NOTIFICATIONS) */
export const ENABLE_PLAN_NOTIFICATIONS =
  (process.env.CC_NATIVE_NOTIFICATIONS ?? "false").toLowerCase() === "true";

// ---------------------------------------------------------------------------
// Security Constants
// ---------------------------------------------------------------------------

/** Default plans directory */
export const PLANS_DIR = path.join(os.homedir(), ".claude", "plans");

/** Maximum plan path length */
export const MAX_PLAN_PATH_LENGTH = 4096;

/** Maximum error file size (10KB) */
export const MAX_ERROR_FILE_SIZE = 10 * 1024;

// ---------------------------------------------------------------------------
// Performance Constants
// ---------------------------------------------------------------------------

/** Fast-fail: 2 attempts max */
export const MAX_RETRY_ATTEMPTS = 2;

/** Backoff schedule: 0.5s, 1s */
export const RETRY_BACKOFF_MS = [500, 1000];

/** 3 seconds total, well under 5s hook timeout */
export const MAX_TOTAL_RETRY_TIME_MS = 3000;

// ---------------------------------------------------------------------------
// Path Validation
// ---------------------------------------------------------------------------

/**
 * Validate and sanitize plan path to prevent traversal attacks.
 * Throws ValueError if path is invalid, too long, or outside allowed directory.
 */
export function validatePlanPath(planPath: string): string {
  // Input validation
  if (!planPath || planPath.length > MAX_PLAN_PATH_LENGTH) {
    throw new Error(
      `Invalid plan path length: ${planPath ? planPath.length : 0}`,
    );
  }

  if (planPath.includes("\x00")) {
    throw new Error("Null bytes not allowed in path");
  }

  // Normalize and resolve to absolute canonical path
  let resolved: string;
  try {
    resolved = path.resolve(planPath);
  } catch (e: unknown) {
    throw new Error(`Path resolution failed: ${e}`);
  }

  // Verify path is within allowed directory (case-insensitive on Windows)
  const resolvedLower = resolved.toLowerCase().replace(/\\/g, "/");
  const plansDirLower = PLANS_DIR.toLowerCase().replace(/\\/g, "/");
  if (!resolvedLower.startsWith(plansDirLower)) {
    throw new Error(`Path outside allowed directory: ${PLANS_DIR}`);
  }

  return resolved;
}
