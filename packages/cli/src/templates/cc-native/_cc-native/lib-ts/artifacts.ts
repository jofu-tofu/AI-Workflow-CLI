/**
 * Review artifact writing and formatting.
 * Re-exports from artifacts/ subdirectory for backward compatibility.
 */

export {
  formatReviewMarkdown,
  formatCombinedMarkdown,
  buildInlineReviewSummary,
  extractTopIssuesText,
  buildHighIssuesDocument,
  buildCorroborationReport,
  generateReviewIndex,
  buildCombinedJson,
  writeCombinedArtifacts,
  writeFile,
  writeFileNonCritical,
  writeReviewTracker,
  extractPreviousHashes,
} from "./artifacts/index.js";
export type { ReviewTrackerEntry } from "./artifacts/index.js";
