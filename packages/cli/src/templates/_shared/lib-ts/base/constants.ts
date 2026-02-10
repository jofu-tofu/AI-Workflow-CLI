/**
 * Constants and path utilities for shared context management.
 * See SPEC.md §2
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { logWarn } from "./logger.js";

// Directory names (relative to project root)
const OUTPUT_DIR = "_output";
const CONTEXTS_DIR = "contexts";
const ARCHIVE_DIR = "_archive";
const INDEX_FILENAME = "index.json";

// Context ID validation
export const MAX_CONTEXT_ID_LENGTH = 64;
export const VALID_CONTEXT_ID_PATTERN =
  /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/;

// File size limits
export const MAX_EVENT_SIZE = 64 * 1024;
export const MAX_INDEX_SIZE = 1024 * 1024;

// Performance constants
export const MAX_RETRY_ATTEMPTS = 2;
export const RETRY_BACKOFF_MS = [500, 1000];

// Windows reserved filenames
const WINDOWS_RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/**
 * Sanitize a string into a valid context ID.
 * See SPEC.md §2.3
 */
export function sanitizeContextId(contextId: string): string {
  if (!contextId) return "context";

  let result = contextId.toLowerCase();
  result = result.replace(/[^a-z0-9_-]/g, "-");
  result = result.replace(/[-_]+/g, "-");
  result = result.replace(/^[-_]+|[-_]+$/g, "");

  if (result.length > MAX_CONTEXT_ID_LENGTH) {
    result = result.slice(0, MAX_CONTEXT_ID_LENGTH).replace(/[-_]+$/, "");
  }

  return result || "context";
}

/**
 * Validate and normalize context ID.
 * Throws only for security violations (path traversal).
 * See SPEC.md §2.3
 */
export function validateContextId(contextId: string): string {
  if (!contextId) return "context";

  // SECURITY: Check for path traversal BEFORE any normalization
  if (
    contextId.includes("..") ||
    contextId.includes("/") ||
    contextId.includes("\\")
  ) {
    throw new Error(
      `Invalid context ID '${contextId}': path traversal not allowed`,
    );
  }

  // Check for URL-encoded variants
  const lower = contextId.toLowerCase();
  if (
    lower.includes("%2e") ||
    lower.includes("%2f") ||
    lower.includes("%5c")
  ) {
    throw new Error(
      `Invalid context ID '${contextId}': encoded path traversal not allowed`,
    );
  }

  return sanitizeContextId(contextId);
}

/**
 * Get project root from environment or cwd.
 * Priority: CLAUDE_PROJECT_DIR > payload cwd > process.cwd()
 * See SPEC.md §2.2
 */
export function getProjectRoot(payloadCwd?: string): string {
  const envDir = process.env.CLAUDE_PROJECT_DIR;
  if (envDir) {
    if (!path.isAbsolute(envDir)) {
      logWarn("utils", `CLAUDE_PROJECT_DIR is not absolute: '${envDir}', ignoring`);
    } else if (envDir.includes("..")) {
      logWarn("utils", `CLAUDE_PROJECT_DIR contains '..': '${envDir}', ignoring`);
    } else {
      return envDir;
    }
  }
  if (payloadCwd) return payloadCwd;
  return process.cwd();
}

// §2.4 — Path functions

export function getOutputDir(projectRoot?: string): string {
  return path.join(projectRoot ?? getProjectRoot(), OUTPUT_DIR);
}

export function getContextsDir(projectRoot?: string): string {
  return path.join(getOutputDir(projectRoot), CONTEXTS_DIR);
}

export function getContextDir(
  contextId: string,
  projectRoot?: string,
): string {
  const validatedId = validateContextId(contextId);
  const contextsDir = getContextsDir(projectRoot);
  const resultPath = path.join(contextsDir, validatedId);

  // SECURITY: Verify resolved path stays within contexts directory
  const resolved = path.resolve(resultPath);
  const contextsResolved = path.resolve(contextsDir);
  if (
    !resolved.toLowerCase().startsWith(contextsResolved.toLowerCase())
  ) {
    throw new Error(
      `Invalid context ID '${contextId}': path escapes contexts directory`,
    );
  }

  return resultPath;
}

export function getContextPlansDir(
  contextId: string,
  projectRoot?: string,
): string {
  return path.join(getContextDir(contextId, projectRoot), "plans");
}

export function getContextHandoffsDir(
  contextId: string,
  projectRoot?: string,
): string {
  return path.join(getContextDir(contextId, projectRoot), "handoffs");
}

export function getContextReviewsDir(
  contextId: string,
  projectRoot?: string,
): string {
  return path.join(getContextDir(contextId, projectRoot), "reviews");
}

export function getIndexPath(projectRoot?: string): string {
  return path.join(getOutputDir(projectRoot), INDEX_FILENAME);
}

export function getContextFilePath(
  contextId: string,
  projectRoot?: string,
): string {
  return path.join(getContextDir(contextId, projectRoot), "context.json");
}

export function getEventsFilePath(
  contextId: string,
  projectRoot?: string,
): string {
  return path.join(getContextDir(contextId, projectRoot), "events.jsonl");
}

export function getAutoStatePath(
  contextId: string,
  projectRoot?: string,
): string {
  return path.join(
    getContextDir(contextId, projectRoot),
    "auto-state.json",
  );
}

export function getArchiveDir(projectRoot?: string): string {
  return path.join(getContextsDir(projectRoot), ARCHIVE_DIR);
}

export function getArchiveContextDir(
  contextId: string,
  projectRoot?: string,
): string {
  const validatedId = validateContextId(contextId);
  return path.join(getArchiveDir(projectRoot), validatedId);
}

export function getArchiveIndexPath(projectRoot?: string): string {
  return path.join(getArchiveDir(projectRoot), INDEX_FILENAME);
}

/**
 * Get path for a new handoff folder with datetime naming.
 * Handles collisions by appending -N suffix.
 * See SPEC.md §2.4
 */
export function getHandoffFolderPath(
  contextId: string,
  projectRoot?: string,
): string {
  const handoffsDir = getContextHandoffsDir(contextId, projectRoot);
  const now = new Date();
  const timestamp = [
    now.getFullYear().toString(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  // Format: YYYY-MM-DD-HHMM
  const ts = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}${timestamp.slice(8)}`;

  let folder = path.join(handoffsDir, ts);
  let counter = 1;
  while (fs.existsSync(folder)) {
    folder = path.join(handoffsDir, `${ts}-${counter}`);
    counter++;
  }
  return folder;
}

/**
 * Get path for a new review folder.
 * See SPEC.md §2.4
 */
export function getReviewFolderPath(
  contextId: string,
  iteration: number,
  projectRoot?: string,
): string {
  const reviewsDir = path.join(
    getContextReviewsDir(contextId, projectRoot),
    "cc-native",
  );
  const now = new Date();
  const ts = [
    now.getFullYear().toString(),
    "-",
    String(now.getMonth() + 1).padStart(2, "0"),
    "-",
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return path.join(reviewsDir, `${ts}-iteration-${iteration}`);
}

// §2.5 — Filename sanitization

export function sanitizeFilename(
  s: string,
  maxLen = 32,
  allowLeadingDot = false,
): string {
  let result = s.replace(/[^A-Za-z0-9._-]+/g, "_");
  result = result.replace(/^[._-]+|[._-]+$/g, "").slice(0, maxLen) || "unknown";

  if (!allowLeadingDot) {
    result = result.replace(/^\.+/, "");
  }

  const baseName = (result.split(".")[0] ?? result).toUpperCase();
  if (WINDOWS_RESERVED.has(baseName)) {
    result = `_${result}`;
  }

  return result || "unknown";
}

export function sanitizeTitle(s: string, maxLen = 50): string {
  let result = s.toLowerCase().trim();
  result = result.replace(/ /g, "-");
  result = result.replace(/[^a-z0-9._-]+/g, "_");
  result = result.replace(/[-_]+/g, "-");
  result = result.replace(/^[._-]+|[._-]+$/g, "").slice(0, maxLen) || "unknown";

  const baseName = (result.split(".")[0] ?? result).toUpperCase();
  if (WINDOWS_RESERVED.has(baseName)) {
    result = `_${result}`;
  }

  return result || "unknown";
}
