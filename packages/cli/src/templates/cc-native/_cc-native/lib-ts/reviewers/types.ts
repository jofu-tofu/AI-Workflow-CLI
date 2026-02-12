/**
 * Reviewer interface and options for plan review implementations.
 * See cc-native-plan-review-spec.md §4.9
 */

import type { ReviewData,  ReviewerResult,  Verdict } from "../types.js";

// Re-export for convenience


/** Create a standard ReviewerResult. Shared by all reviewer implementations. */
export function makeResult(
  name: string,
  ok: boolean,
  verdict: Verdict,
  data: Record<string, unknown> | ReviewData,
  raw: string,
  err: string,
): ReviewerResult {
  return { name, ok, verdict, data: data as Record<string, unknown>, raw, err };
}

export {type Reviewer, type ReviewerResult, type ReviewOptions} from "../types.js";