/**
 * JSON schemas and prompt constants for plan reviewers.
 * Centralized schema definitions used by Claude/Codex/Gemini agents and orchestrator.
 * See cc-native-plan-review-spec.md §4.10
 */

// ---------------------------------------------------------------------------
// Prompt Constants
// ---------------------------------------------------------------------------

/** Prefix for agent review prompts (embedded in stdin or --system-prompt) */
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
  {"severity": "high/medium/low", "category": "...", "issue": "...", "suggested_fix": "...", "dimension": "..."}
- **dimension**: Classify each issue into exactly one dimension:
  completeness, simplicity, security, performance, reliability,
  maintainability, testability, scope, feasibility, or clarity.
  Examples: "missing error handling" → reliability, "excessive abstraction" → simplicity,
  "no test strategy" → testability, "missing deployment steps" → completeness,
  "unclear interaction between components" → clarity.
- **missing_sections**: Topics the plan should address but doesn't
- **questions**: Things that need clarification before implementation

## IMPORTANT RULES
1. A "warn" verdict MUST include at least one issue explaining why
2. Summary MUST explain your reasoning, not just "looks good" or empty
3. Focus on your expertise area (architecture, security, performance, etc.)
4. Output StructuredOutput NOW - no other tools, no questions, no delays
5. Return ONLY your top 3 most critical issues. Prioritize high-severity over medium/low. Quality over quantity.
`;

/** Prefix for Codex/Gemini review prompts (legacy, may be deprecated) */
export const REVIEW_PROMPT_PREFIX = `You are a senior staff software engineer acting as a strict plan reviewer.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)
`;

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

/** JSON schema for review structured output (agents: Claude, Codex, Gemini) */
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
          dimension: {
            type: "string",
            enum: [
              "completeness", "simplicity", "security", "performance",
              "reliability", "maintainability", "testability", "scope",
              "feasibility", "clarity",
            ],
          },
        },
        required: ["severity", "category", "issue", "suggested_fix", "dimension"],
        additionalProperties: false,
      },
    },
    missing_sections: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "summary", "issues", "missing_sections", "questions"],
  additionalProperties: false,
};

/**
 * Build orchestrator JSON schema with enum-constrained agent names.
 * Dynamic schema that restricts selectedAgents to valid agent names.
 */
export function buildOrchestratorSchema(
  validAgentNames: string[],
  categories: string[],
): Record<string, unknown> {
  const itemsSchema: Record<string, unknown> = { type: "string" };
  if (validAgentNames.length > 0) {
    itemsSchema.enum = validAgentNames;
  }

  return {
    type: "object",
    properties: {
      complexity: { type: "string", enum: ["simple", "medium", "high"] },
      category: { type: "string", enum: categories },
      selectedAgents: {
        type: "array",
        items: itemsSchema,
      },
      reasoning: { type: "string" },
      skipReason: { type: "string" },
    },
    required: ["complexity", "category", "selectedAgents", "reasoning"],
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Plan Questions Schema
// ---------------------------------------------------------------------------

/** Prefix for plan question generation prompts */
export const QUESTIONS_PROMPT_PREFIX = `# PLAN QUESTION GENERATION

## CRITICAL: ONE TURN ONLY
You have exactly ONE response. Do NOT attempt multi-step workflows or tool use beyond StructuredOutput.

## YOUR TASK
You are reviewing a plan that was written by another agent. You have NO access to the codebase, NO session history, and NO exploration context. You see ONLY the plan text.

This is intentional. Plans must be executable by a fresh agent in a new session. If the plan assumes knowledge that isn't written down, that's a gap.

## WHAT TO LOOK FOR
- Questions the plan doesn't answer but should
- Assumptions the plan makes without stating them
- Ambiguities where a reader could interpret something two ways
- Missing context that would be obvious to the author but not a new reader

## IMPORTANT
- Focus on questions that would change the implementation approach if answered differently
- Don't ask about things clearly stated in the plan
- Don't generate generic questions — every question should be specific to THIS plan
- Aim for 3-6 high-value questions
`;

/** JSON schema for plan question generation output */
export const QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: { type: "string" },
      description: "Questions the user should answer before this plan is implemented",
    },
    assumptions: {
      type: "array",
      items: { type: "string" },
      description: "Assumptions the plan makes that are not explicitly stated",
    },
    ambiguities: {
      type: "array",
      items: { type: "string" },
      description: "Parts of the plan that could be interpreted multiple ways",
    },
  },
  required: ["questions", "assumptions", "ambiguities"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Orchestrator Schemas
// ---------------------------------------------------------------------------

/** JSON schema for orchestrator structured output (static fallback) */
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
