/**
 * Reviewer interface and options for plan review implementations.
 * See cc-native-plan-review-spec.md §4.9
 */

import type { ReviewerResult, ReviewOptions, Reviewer, Verdict, ReviewData } from "../types.js";

// Re-export for convenience
export type { ReviewerResult, ReviewOptions, Reviewer };

/** Create a standard ReviewerResult. Shared by all reviewer implementations. */
export function makeResult(
  name: string,
  ok: boolean,
  verdict: Verdict,
  data: ReviewData | Record<string, unknown>,
  raw: string,
  err: string,
): ReviewerResult {
  return { name, ok, verdict, data: data as Record<string, unknown>, raw, err };
}
