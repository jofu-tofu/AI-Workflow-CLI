/**
 * CC-Native plan review library — package entry point.
 * Re-exports the public API from all modules.
 */

// Agent aggregation
export {
  aggregateAgents,
  extractBody,
  extractFrontmatter,
} from "./aggregate-agents.js";

// Artifacts
export {
  buildCombinedJson,
  buildHighIssuesDocument,
  buildInlineReviewSummary,
  extractTopIssuesText,
  formatCombinedMarkdown,
  formatReviewMarkdown,
  generateReviewIndex,
  writeCombinedArtifacts,
} from "./artifacts.js";

// CC-native state
export {
  getCcNativeState,
  isPlanAlreadyReviewed,
  markPlanReviewed,
  markQuestionsAsked,
  saveCcNativeState,
  wasPlanPreviouslyDenied,
  wasQuestionsAsked,
} from "./cc-native-state.js";

// CLI output parsing
export { parseCliOutput } from "./cli-output-parser.js";

// Configuration
export { getDisplaySettings, loadConfig } from "./config.js";

// Constants & security
export {
  ENABLE_PLAN_NOTIFICATIONS,
  ENABLE_ROBUST_PLAN_WRITES,
  MAX_ERROR_FILE_SIZE,
  MAX_PLAN_PATH_LENGTH,
  MAX_RETRY_ATTEMPTS,
  MAX_TOTAL_RETRY_TIME_MS,
  PLANS_DIR,
  RETRY_BACKOFF_MS,
  validatePlanPath,
} from "./constants.js";

// Debug logging
export { cleanupDebugFolder, debugLog, debugRaw, getDebugDir } from "./debug.js";

// JSON parsing
export { coerceToReview, parseJsonMaybe } from "./json-parser.js";

// Orchestrator
export { buildOrchestratorSchema, runOrchestrator } from "./orchestrator.js";

// Reviewers
export {
  AgentReviewer,
  CodexReviewer,
  GeminiReviewer,
  runAgentReview,
  runCodexReview,
  runGeminiReview,
} from "./reviewers/index.js";

// Iteration state
export {
  DEFAULT_REVIEW_ITERATIONS,
  deleteState,
  getIterationState,
  getStateFilePath,
  loadState,
  saveStateToPlan,
  shouldContinueIterating,
  updateIterationState,
} from "./state.js";

// Types & schemas
export type {
  AgentConfig,
  CcNativeState,
  CombinedReviewResult,
  ComplexityCategory,
  DisplaySettings,
  IterationEntry,
  IterationState,
  OrchestratorConfig,
  OrchestratorResult,
  PlanReviewConfig,
  PlanReviewState,
  QuestionsAskedState,
  ReviewData,
  ReviewDecision,
  ReviewDecisionResult,
  Reviewer,
  ReviewerResult,
  ReviewIssue,
  ReviewOptions,
  Verdict,
} from "./types.js";

export {
  AGENT_REVIEW_PROMPT_PREFIX,
  DEFAULT_DISPLAY,
  DEFAULT_SANITIZATION,
  ORCHESTRATOR_SCHEMA,
  REVIEW_PROMPT_PREFIX,
  REVIEW_SCHEMA,
} from "./types.js";

// Verdict aggregation
export { computeReviewDecision, worstVerdict } from "./verdict.js";
