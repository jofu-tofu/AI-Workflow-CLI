/**
 * JSON parsing utilities for LLM responses.
 * See cc-native-plan-review-spec.md §4.10-4.11
 */

import { logDebug, logWarn } from "../../_shared/lib-ts/base/logger.js";
import type { ReviewData, Verdict } from "./types.js";

/**
 * Try strict JSON parse. If that fails, attempt to extract the first {...} block.
 *
 * @param text - Raw text that may contain JSON
 * @param requireFields - Optional list of field names to check for
 * @returns Parsed dict or null if parsing failed entirely
 */
export function parseJsonMaybe(
  text: string,
  requireFields?: string[],
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let obj: Record<string, unknown> | null = null;
  let parseMethod: string | null = null;

  // Strict parse
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      obj = parsed as Record<string, unknown>;
      parseMethod = "strict";
    }
  } catch {
    // Fall through to heuristic
  }

  // Heuristic: try to extract a JSON object substring
  if (obj === null) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          obj = parsed as Record<string, unknown>;
          parseMethod = "heuristic";
          logDebug(
            "parse",
            `Used heuristic extraction (chars ${start}-${end})`,
          );
        }
      } catch {
        logDebug(
          "parse",
          `Heuristic extraction failed for candidate at chars ${start}-${end}`,
        );
        return null;
      }
    }
  }

  // Validate required fields if parsed
  if (obj && requireFields) {
    const missing = requireFields.filter((f) => !(f in obj!) || !obj![f]);
    if (missing.length > 0) {
      logWarn(
        "parse",
        `Parsed JSON (${parseMethod}) missing/empty fields: ${JSON.stringify(missing)}`,
      );
      logDebug("parse", `Keys present: ${JSON.stringify(Object.keys(obj))}`);
      // Heuristic extraction grabbed the wrong object — reject it.
      // Strict parse still returns partial objects (caller handles defaults).
      if (parseMethod === "heuristic") {
        logWarn("parse", "Rejecting heuristic result due to missing required fields");
        return null;
      }
    }
  }

  return obj;
}

/**
 * Validate/normalize parsed JSON to ReviewData shape with safe defaults.
 *
 * @param obj - Parsed JSON object (possibly null)
 * @param defaultFixMsg - Default suggested_fix message for error case
 * @returns Tuple of [ok, verdict, normalizedData]
 */
export function coerceToReview(
  obj: Record<string, unknown> | null,
  defaultFixMsg = "Retry or check configuration.",
): [boolean, Verdict, ReviewData] {
  if (!obj) {
    logWarn("coerce", "No object provided to coerceToReview");
    return [
      false,
      "error",
      {
        verdict: "fail",
        summary: "No structured output returned.",
        summary_source: "default",
        issues: [
          {
            severity: "high",
            category: "tooling",
            issue: "Reviewer returned no JSON.",
            suggested_fix: defaultFixMsg,
          },
        ],
        missing_sections: [],
        questions: [],
      },
    ];
  }

  const rawVerdict = obj.verdict;
  let verdict: Verdict;
  if (rawVerdict === "pass" || rawVerdict === "warn" || rawVerdict === "fail") {
    verdict = rawVerdict;
  } else {
    logWarn(
      "coerce",
      `Invalid or missing verdict '${String(rawVerdict)}', defaulting to 'warn'`,
    );
    verdict = "warn";
  }

  // Log when fields are being defaulted
  const summaryRaw = String(obj.summary ?? "").trim();
  if (!summaryRaw) {
    logWarn(
      "coerce",
      "summary missing or empty from parsed output, using default",
    );
    logDebug("coerce", `Raw object keys: ${JSON.stringify(Object.keys(obj))}`);
    logDebug(
      "coerce",
      `verdict=${obj.verdict}, issues_count=${Array.isArray(obj.issues) ? (obj.issues as unknown[]).length : 0}`,
    );
  }
  if (!obj.issues) {
    logDebug("coerce", "issues array empty or missing");
  }

  const norm: ReviewData = {
    verdict,
    summary: summaryRaw || "No summary provided.",
    summary_source: summaryRaw ? "reviewer" : "default",
    issues: Array.isArray(obj.issues)
      ? (obj.issues as ReviewData["issues"])
      : [],
    missing_sections: Array.isArray(obj.missing_sections)
      ? (obj.missing_sections as string[])
      : [],
    questions: Array.isArray(obj.questions)
      ? (obj.questions as string[])
      : [],
  };

  return [true, verdict, norm];
}
