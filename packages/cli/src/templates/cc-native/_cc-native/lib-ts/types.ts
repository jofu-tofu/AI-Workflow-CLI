/**
 * CC-Native plan review type definitions.
 * All interfaces, schemas, and prompt constants for the plan review engine.
 * See cc-native-plan-review-spec.md §3
 */

// Re-export shared types used by cc-native consumers
export type { ContextState, HookInput, HookOutput } from "../../_shared/lib-ts/types.js";

// ---------------------------------------------------------------------------
// Verdict & Decision Types
// ---------------------------------------------------------------------------

/** Verdict from a single reviewer */
export type Verdict = "pass" | "warn" | "fail" | "error" | "skip";

/** Decision after aggregating all verdicts */
export type ReviewDecision = "allow" | "deny";

/** Complexity level assigned by orchestrator */
export type ComplexityCategory = "simple" | "medium" | "high";

// ---------------------------------------------------------------------------
// Review Data Structures
// ---------------------------------------------------------------------------

/** Dimension classification for corroboration-based verdict */
export type IssueDimension =
  | "completeness"
  | "simplicity"
  | "security"
  | "performance"
  | "reliability"
  | "maintainability"
  | "testability"
  | "scope"
  | "feasibility"
  | "clarity";

/** A single issue found during review */
export interface ReviewIssue {
  severity: "high" | "medium" | "low";
  category: string;
  issue: string;
  suggested_fix: string;
  dimension?: IssueDimension;
}

/** A group of issues in one dimension, classified as blocking or solo */
export interface DimensionGroup {
  dimension: IssueDimension;
  issues: Array<{ agent: string; issue: ReviewIssue }>;
  agentCount: number;
  threshold: number; // 2 × agentCount
}

/** Corroborated (blocking) group — threshold exceeded */
export type CorroboratedGroup = DimensionGroup;

/** Solo finding — below threshold, informational only */
export type SoloFinding = DimensionGroup;

/** Result of corroboration-based verdict computation */
export interface CorroborationResult {
  blocking: CorroboratedGroup[];
  solo: SoloFinding[];
  unclassified: Array<{ agent: string; issue: ReviewIssue }>;
  verdict: "pass" | "warn" | "fail";
}

/** Normalized review data from any reviewer */
export interface ReviewData {
  verdict: Verdict;
  summary: string;
  summary_source: "reviewer" | "default";
  issues: ReviewIssue[];
  missing_sections: string[];
  questions: string[];
}

/** Result from a single plan reviewer (Codex, Gemini, or Claude agent) */
export interface ReviewerResult {
  name: string;
  ok: boolean;
  verdict: Verdict;
  data: Record<string, unknown>;
  raw: string;
  err: string;
}

/** Result from the plan orchestrator */
export interface OrchestratorResult {
  complexity: ComplexityCategory;
  category: string;
  selected_agents: string[];
  reasoning: string;
  skip_reason?: string;
  error?: string;
}

/** Combined result from all review phases */
export interface CombinedReviewResult {
  plan_hash: string;
  overall_verdict: Verdict;
  orchestration: OrchestratorResult | null;
  agents: Record<string, ReviewerResult>;
  timestamp: string;
}

/** Result from verdict aggregation */
export interface ReviewDecisionResult {
  should_deny: boolean;
  reason: string; // "fail_veto" | "acceptable" | "no_signal"
  score: number;
}

// ---------------------------------------------------------------------------
// Agent & Orchestrator Configuration
// ---------------------------------------------------------------------------

/** Configuration for a Claude Code review agent */
export interface AgentConfig {
  name: string;
  model: string;
  provider: string; // e.g. "claude" | "codex" — assigned at runtime by assignModelsToAgents()
  focus: string;
  categories: string[];
  description: string;
  system_prompt: string; // Markdown body content for --system-prompt
}

/** Configuration for the plan orchestrator */
export interface OrchestratorConfig {
  enabled: boolean;
  model: string;
  timeout: number;
}

/** Configuration for a model provider (Claude, Codex, etc.) */
export interface ProviderConfig {
  enabled: boolean;
  models: string[];
}

/** Model provider pool configuration */
export interface ModelsConfig {
  providers: Record<string, ProviderConfig>;
}

// ---------------------------------------------------------------------------
// State Interfaces
// ---------------------------------------------------------------------------

/** A single iteration history entry */
export interface IterationEntry {
  hash: string;
  verdict: string;
  timestamp: string;
}

/** Iteration tracking state (stored adjacent to plan file) */
export interface IterationState {
  current: number;
  max: number;
  complexity: string;
  history: IterationEntry[];
  graduated: string[];
  passStreaks: Record<string, number>;
  lastPlanHash: string;
  lastPlanPath: string;
  sessionId: string;
}

/** CC-native state stored in context state.json under cc_native key */
export interface CcNativeState {
  plan_review?: PlanReviewState;
  questions_asked?: QuestionsAskedState;
  stuck_detection?: StuckDetectionState;
  [key: string]: unknown;
}

/** Plan review state within cc_native */
export interface PlanReviewState {
  plan_hash: string;
  reviewed_at: string;
  decision: string;
  iteration?: {
    current: number;
    max: number;
    complexity: string;
    latest_verdict?: string;
  };
}

/** Questions-asked tracking state */
export interface QuestionsAskedState {
  asked: boolean; // Backward-compatible: true if either phase asked
  asked_at: string;
  early_questions_asked?: {
    asked: boolean;
    asked_at: string;
  };
  plan_questions_agent_asked?: {
    asked: boolean;
    asked_at: string;
  };
}

/** Stuck detection state — tracks repeated errors, file edits, and test failures */
export interface StuckDetectionState {
  error_hashes: Record<string, number>;
  file_edits: Record<string, number>;
  test_failures: number;
  tool_calls_since_suggestion: number;
  suggestion_count: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Display settings for review output formatting */
export interface DisplaySettings {
  maxIssues: number;
  maxMissingSections: number;
  maxQuestions: number;
}

/** Full plan review configuration (from cc-native.config.json) */
export interface PlanReviewConfig {
  planReview?: {
    enabled?: boolean;
    reviewers?: {
      codex?: { enabled?: boolean; timeout?: number; model?: string };
      gemini?: { enabled?: boolean; timeout?: number; model?: string };
    };
    agentReview?: {
      enabled?: boolean;
      timeout?: number;
      orchestrator?: { enabled?: boolean; model?: string; timeout?: number };
      agentSelection?: Record<string, unknown>;
      complexityCategories?: string[];
    };
    display?: Partial<DisplaySettings>;
    reviewIterations?: Record<string, number>;
    earlyExitOnAllPass?: boolean;
  };
  display?: Partial<DisplaySettings>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Reviewer Interface
// ---------------------------------------------------------------------------

/** Options passed to reviewer implementations */
export interface ReviewOptions {
  timeout: number;
  context_path?: string;
  session_name?: string;
}

/** Interface all reviewers must implement */
export interface Reviewer {
  review(
    plan: string,
    schema: Record<string, unknown>,
    options: ReviewOptions,
  ): Promise<ReviewerResult>;
}

// ---------------------------------------------------------------------------
// JSON Schemas (moved to reviewers/schemas.ts)
// ---------------------------------------------------------------------------
// Re-export for backwards compatibility
export { AGENT_REVIEW_PROMPT_PREFIX, ORCHESTRATOR_SCHEMA, REVIEW_PROMPT_PREFIX, REVIEW_SCHEMA } from "../plan-review/lib/reviewers/schemas.js";

// ---------------------------------------------------------------------------
// Display Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_DISPLAY: DisplaySettings = {
  maxIssues: 12,
  maxMissingSections: 12,
  maxQuestions: 12,
};

export const DEFAULT_SANITIZATION = {
  maxSessionIdLength: 32,
  maxTitleLength: 50,
};

// ---------------------------------------------------------------------------
// Pipeline Types (review-pipeline.ts)
// ---------------------------------------------------------------------------

/** Discovered plan file with content and hash */
export interface DiscoveredPlan {
  path: string;
  content: string;
  hash: string;
}

/** Input to the review pipeline */
export interface PipelineInput {
  sessionId: string;
  base: string;
  aiwcliDir: string;
  transcriptPath?: string;
  payload: Record<string, unknown>;
}

/** Result from the review pipeline */
export type PipelineResult =
  | { action: "skip"; reason: string }
  | { action: "block"; contextText: string; blockReason: string };

/** Result of agent selection phase */
export interface AgentSelectionResult {
  selectedAgents: AgentConfig[];
  mandatoryNames: Set<string>;
  detectedComplexity: string;
}

/** Result of iteration advancement after review */
export interface IterationAdvancement {
  updatedState: IterationState;
  newGraduates: string[];
}

// ---------------------------------------------------------------------------
// Preflight Types
// ---------------------------------------------------------------------------

/** Result from a single provider+model preflight check */
export interface PreflightCheckResult {
  provider: string;
  model: string;
  available: boolean;
  latencyMs: number;
  error?: string;
}

/** Aggregated preflight report across all provider+model combos */
export interface PreflightReport {
  checks: PreflightCheckResult[];
  available: Map<string, Set<string>>;  // provider → set of working models
  allFailed: boolean;
  totalMs: number;
}
