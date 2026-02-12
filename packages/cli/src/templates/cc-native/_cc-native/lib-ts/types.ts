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

/** A single issue found during review */
export interface ReviewIssue {
  severity: "high" | "medium" | "low";
  category: string;
  issue: string;
  suggested_fix: string;
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
  cli_reviewers: Record<string, ReviewerResult>;
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
  focus: string;
  enabled: boolean;
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
}

/** CC-native state stored in context state.json under cc_native key */
export interface CcNativeState {
  plan_review?: PlanReviewState;
  questions_asked?: QuestionsAskedState;
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
  asked: boolean;
  asked_at: string;
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

/** Full plan review configuration (from plan-review.config.json) */
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
// JSON Schemas
// ---------------------------------------------------------------------------

/** JSON schema for review structured output */
export const REVIEW_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "warn", "fail"] },
    summary: { type: "string", minLength: 20 },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["high", "medium", "low"] },
          category: { type: "string" },
          issue: { type: "string" },
          suggested_fix: { type: "string" },
        },
        required: ["severity", "category", "issue", "suggested_fix"],
        additionalProperties: false,
      },
    },
    missing_sections: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "summary", "issues", "missing_sections", "questions"],
  additionalProperties: false,
};

/** JSON schema for orchestrator structured output */
export const ORCHESTRATOR_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    complexity: { type: "string", enum: ["simple", "medium", "high"] },
    category: {
      type: "string",
      enum: [
        "code",
        "infrastructure",
        "documentation",
        "life",
        "business",
        "design",
        "research",
      ],
    },
    selectedAgents: { type: "array", items: { type: "string" } },
    reasoning: { type: "string" },
    skipReason: { type: "string" },
  },
  required: ["complexity", "category", "selectedAgents", "reasoning"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Prompt Constants
// ---------------------------------------------------------------------------

export const REVIEW_PROMPT_PREFIX = `You are a senior staff software engineer acting as a strict plan reviewer.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)
`;

export const AGENT_REVIEW_PROMPT_PREFIX = `# SINGLE-TURN PLAN REVIEW

## CRITICAL: ONE TURN ONLY
You have exactly ONE response to complete this review. Do NOT attempt multi-step workflows, context queries, or phased analysis. Analyze the plan and output your review immediately.

## YOUR TASK
Review the plan below from your area of expertise. Then call StructuredOutput with your assessment.

## REQUIRED OUTPUT (all fields must have content)
Call StructuredOutput with:
- **verdict**: "pass" (no concerns), "warn" (some concerns), or "fail" (critical issues)
- **summary**: 2-3 sentences with your overall assessment and key findings (REQUIRED)
- **issues**: Array of concerns found. Format each as:
  {"severity": "high/medium/low", "category": "...", "issue": "...", "suggested_fix": "..."}
- **missing_sections**: Topics the plan should address but doesn't
- **questions**: Things that need clarification before implementation

## IMPORTANT RULES
1. A "warn" verdict MUST include at least one issue explaining why
2. Summary MUST explain your reasoning, not just "looks good" or empty
3. Focus on your expertise area (architecture, security, performance, etc.)
4. Output StructuredOutput NOW - no other tools, no questions, no delays
`;

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
