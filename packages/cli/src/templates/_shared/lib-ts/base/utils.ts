/**
 * Core utilities for shared context management.
 * See SPEC.md §14.2, §14.3
 */

import { sanitizeTitle } from "./constants.js";
import { logDebug, logError, logWarn } from "./logger.js";
import { STOP_WORDS } from "./stop-words.js";

/**
 * Print to stderr. For terminal-only UX messages, not diagnostics.
 */
export function eprint(...args: any[]): void {
  process.stderr.write(args.map(String).join(" ") + "\n");
}

/**
 * Get current local datetime as Date.
 */
export function nowLocal(): Date {
  return new Date();
}

/**
 * Get current time as ISO 8601 string (local time, no timezone suffix).
 * Matches Python datetime.now().isoformat() behavior.
 */
export function nowIso(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Format datetime for display.
 * Returns "YYYY-MM-DD HH:MM:SS"
 * See SPEC.md §14.3
 */
export function formatTimestamp(dt?: Date): string {
  const d = dt ?? nowLocal();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Parse ISO 8601 timestamp string.
 * Returns null if parsing fails.
 * See SPEC.md §14.3
 */
export function parseIsoTimestamp(isoStr: string): Date | null {
  try {
    const normalized = isoStr.replace("Z", "+00:00");
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Normalize a filesystem path for display — always uses forward slashes.
 * No-op on Unix; converts backslashes on Windows.
 */
export function displayPath(p: string): string {
  return p.replaceAll("\\", "/");
}

/**
 * Clean text for stop-word matching in slug generation.
 * Strips apostrophes (i'm -> im), removes punctuation, normalizes whitespace.
 * See SPEC.md §14.2
 */
export function cleanTextForSlug(text: string): string {
  if (!text) return "";
  let result = text.toLowerCase();
  result = result.replaceAll('\'', "");            // i'm -> im, you're -> youre
  result = result.replaceAll(/[^a-z0-9\s]/g, " "); // punctuation -> spaces
  result = result.replaceAll(/\s+/g, " ").trim();
  return result;
}

/**
 * Generate a slug from text using AI inference with stop-word fallbacks.
 * Pipeline: AI inference → stop-word post-filter → stop-word fallback → word-length fallback.
 * Reusable by both context ID generation and plan archival.
 * See SPEC.md §14.2
 */
export function generateSlug(
  text: string,
  maxLen = 150,
  fallbackSlug = "context",
): string {
  if (!text || !text.trim()) return fallbackSlug;

  let slug: null | string = null;
  const cleanedText = cleanTextForSlug(text);

  // Tier 1: AI inference via generateContextIdSlug (sync — uses execFileSync)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
    const { generateContextIdSlug } = require("./inference.js");
    const aiSlug = generateContextIdSlug(text);
    if (aiSlug) {
      const filteredWords = aiSlug
        .split(/\s+/)
        .filter(
          (w: string) => !STOP_WORDS.has(w.toLowerCase()) && w.length > 1,
        );
      if (filteredWords.length >= 5) {
        slug = sanitizeTitle(filteredWords.join(" "), maxLen);
      } else {
        logDebug(
          "utils",
          `AI slug too generic after stop-word filter (${filteredWords.length} words remain), using fallback`,
        );
      }
    }
  } catch (error: any) {
    logWarn("utils", `AI slug generation failed, using fallback: ${error}`);
  }

  // Tier 2: Stop-word filtering on cleaned text
  if (!slug) {
    const words = cleanedText
      .split(/\s+/)
      .filter((w) => !STOP_WORDS.has(w) && w.length > 1)
      .slice(0, 12);
    slug = words.length >= 3
      ? sanitizeTitle(words.join(" "), maxLen)
      : sanitizeTitle(
          cleanedText.split(/\s+/).filter((w) => w.length > 2).slice(0, 6).join(" "),
          maxLen,
        ) || fallbackSlug;
  }

  return slug;
}

/**
 * Generate a context ID from a summary string.
 * Format: YYMMDD-HHMM-slug
 * Delegates slug generation to generateSlug().
 * See SPEC.md §14.2
 */
export function generateContextId(
  summary: string,
  existingIds?: Set<string>,
): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const timestamp = `${yy}${mm}${dd}-${hh}${min}`;

  let baseId: string;

  try {
    const slug = generateSlug(summary);
    baseId = `${timestamp}-${slug}`;
  } catch (error: any) {
    logError(
      "utils",
      `Context ID generation failed entirely, using timestamp: ${error}`,
    );
    baseId = `${timestamp}-context`;
  }

  if (!existingIds || !existingIds.has(baseId)) {
    return baseId;
  }

  let counter = 2;
  while (existingIds.has(`${baseId}-${counter}`)) {
    counter++;
  }

  return `${baseId}-${counter}`;
}
