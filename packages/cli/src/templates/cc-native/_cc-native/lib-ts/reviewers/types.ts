/**
 * Reviewer interface and options for plan review implementations.
 * See cc-native-plan-review-spec.md §4.9
 */

import type { ReviewerResult, ReviewOptions } from "../types.js";

// Re-export for convenience
export type { ReviewerResult, ReviewOptions };

/** Interface all reviewers must implement */
export interface Reviewer {
  review(
    plan: string,
    schema: Record<string, any>,
    options: ReviewOptions,
  ): Promise<ReviewerResult>;
}
