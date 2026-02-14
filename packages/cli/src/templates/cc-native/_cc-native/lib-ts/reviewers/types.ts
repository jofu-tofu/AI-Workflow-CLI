/**
 * Reviewer interface and options for plan review implementations.
 * See cc-native-plan-review-spec.md §4.9
 */

import type { ReviewerResult,   Verdict, ReviewData } from "../types.js";

// Re-export for convenience


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

export {type Reviewer, type ReviewerResult, type ReviewOptions} from "../types.js";