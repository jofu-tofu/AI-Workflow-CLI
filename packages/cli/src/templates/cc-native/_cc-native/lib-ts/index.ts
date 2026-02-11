/**
 * CC-Native plan review library — package entry point.
 * Re-exports the public API from all modules.
 */

// Types & schemas
export type {
  Verdict,
  ReviewDecision,
  ComplexityCategory,
  ReviewIssue,
  ReviewData,
  ReviewerResult,
  OrchestratorResult,
  CombinedReviewResult,
  ReviewDecisionResult,
  AgentConfig,
  OrchestratorConfig,
  IterationState,
  IterationEntry,
  CcNativeState,
  PlanReviewState,
  QuestionsAskedState,
  StuckDetectionState,
  PlanReviewConfig,
  DisplaySettings,
  ReviewOptions,
  Reviewer,
} from "./types.js";

export {
  REVIEW_SCHEMA,
  ORCHESTRATOR_SCHEMA,
  REVIEW_PROMPT_PREFIX,
  AGENT_REVIEW_PROMPT_PREFIX,
  DEFAULT_DISPLAY,
  DEFAULT_SANITIZATION,
} from "./types.js";

// Constants & security
export {
  ENABLE_ROBUST_PLAN_WRITES,
  ENABLE_PLAN_NOTIFICATIONS,
  PLANS_DIR,
  MAX_PLAN_PATH_LENGTH,
  MAX_ERROR_FILE_SIZE,
  MAX_RETRY_ATTEMPTS,
  RETRY_BACKOFF_MS,
  MAX_TOTAL_RETRY_TIME_MS,
  validatePlanPath,
} from "./constants.js";

// Verdict aggregation
export { worstVerdict, computeReviewDecision } from "./verdict.js";

// JSON parsing
export { parseJsonMaybe, coerceToReview } from "./json-parser.js";

// CLI output parsing
export { parseCliOutput } from "./cli-output-parser.js";

// Configuration
export { loadConfig, getDisplaySettings } from "./config.js";

// Debug logging
export { debugLog, debugRaw, getDebugDir, cleanupDebugFolder } from "./debug.js";

// CC-native state
export {
  getCcNativeState,
  saveCcNativeState,
  isPlanAlreadyReviewed,
  wasPlanPreviouslyDenied,
  markPlanReviewed,
  wasQuestionsAsked,
  markQuestionsAsked,
  getStuckDetectionState,
  updateStuckDetectionState,
} from "./cc-native-state.js";

// Iteration state
export {
  getStateFilePath,
  loadState,
  saveStateToPlan,
  deleteState,
  getIterationState,
  updateIterationState,
  shouldContinueIterating,
} from "./state.js";

// Orchestrator
export { runOrchestrator, buildOrchestratorSchema } from "./orchestrator.js";

// Agent aggregation
export {
  aggregateAgents,
  extractFrontmatter,
  extractBody,
} from "./aggregate-agents.js";

// Artifacts
export {
  formatReviewMarkdown,
  formatCombinedMarkdown,
  buildInlineReviewSummary,
  extractTopIssuesText,
  buildHighIssuesDocument,
  generateReviewIndex,
  buildCombinedJson,
  writeCombinedArtifacts,
} from "./artifacts.js";

// Reviewers
export {
  AgentReviewer,
  runAgentReview,
  CodexReviewer,
  runCodexReview,
  GeminiReviewer,
  runGeminiReview,
} from "./reviewers/index.js";
