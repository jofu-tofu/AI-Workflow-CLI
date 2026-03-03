/**
 * Constants and path utilities for shared context management.
 * See SPEC.md §2
 */

import * as fs from "node:fs";
import path from "node:path";

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
  "AUX", "COM1", "COM2", "COM3",
  "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "CON", "LPT1", "LPT2",
  "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9", "NUL", "PRN",
]);

/**
 * Sanitize a string into a valid context ID.
 * See SPEC.md §2.3
 */
export function sanitizeContextId(contextId: string): string {
  if (!contextId) return "context";

  let result = contextId.toLowerCase();
  result = result.replaceAll(/[^a-z0-9_-]/g, "-");
  result = result.replaceAll(/[-_]+/g, "-");
  result = result.replaceAll(/^[-_]+|[-_]+$/g, "");

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

  // SECURITY: Check for path traversal BEFORE unknown normalization
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
 * Walk up from startDir until a directory containing `.aiwcli/` is found.
 * Returns startDir itself if no anchor is found (fail-safe).
 * See SPEC.md §2.2
 */
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, ".aiwcli"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root reached
    dir = parent;
  }

  return startDir; // fallback: no .aiwcli anchor found
}

/**
 * Get project root from environment or cwd.
 * Priority: CLAUDE_PROJECT_DIR > walk up from payload cwd > walk up from process.cwd()
 * Walks upward to find the nearest .aiwcli/ anchor, so cwd drift (e.g. after
 * `cd packages/cli` in a Bash tool call) doesn't break hook resolution.
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

  if (payloadCwd) return findProjectRoot(payloadCwd);
  return findProjectRoot(process.cwd());
}

// §2.4 — Path functions

export function getAiwcliDir(projectRoot?: string): string {
  return path.join(projectRoot ?? getProjectRoot(), ".aiwcli");
}

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
  let result = s.replaceAll(/[^A-Za-z0-9._-]+/g, "_");
  result = result.replaceAll(/^[._-]+|[._-]+$/g, "").slice(0, maxLen) || "unknown";

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
  result = result.replaceAll(' ', "-");
  result = result.replaceAll(/[^a-z0-9._-]+/g, "_");
  result = result.replaceAll(/[-_]+/g, "-");
  result = result.replaceAll(/^[._-]+|[._-]+$/g, "").slice(0, maxLen) || "unknown";

  const baseName = (result.split(".")[0] ?? result).toUpperCase();
  if (WINDOWS_RESERVED.has(baseName)) {
    result = `_${result}`;
  }

  return result || "unknown";
}


