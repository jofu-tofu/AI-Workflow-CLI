/**
 * Test helpers for cc-native lib-ts tests.
 * Re-exports shared helpers and adds cc-native-specific factories.
 */
export {
  createTempDir,
  cleanupTempDir,
  setProjectRoot,
  captureStdout,
  captureStderr,
  createSampleState,
  createSampleIndex,
  createSampleHookInput,
  createSampleTask,
  writeStateJson,
  writeIndexJson,
  freezeTime,
} from "../../../_core/lib-ts/__tests__/helpers.js";

import type {
  ReviewData,
  ReviewerResult,
  OrchestratorResult,
  CombinedReviewResult,
  AgentConfig,
  PlanReviewConfig,
  DisplaySettings,
  Verdict,
} from "../types.js";

// ─── CC-Native Sample Data Factories ─────────────────────────────────────

export function createSampleReviewData(
  overrides?: Partial<ReviewData>,
): ReviewData {
  return {
    verdict: "pass",
    summary: "Plan looks good.",
    summary_source: "reviewer",
    issues: [],
    missing_sections: [],
    questions: [],
    ...overrides,
  };
}

export function createSampleReviewerResult(
  overrides?: Partial<ReviewerResult>,
): ReviewerResult {
  return {
    name: "test-reviewer",
    ok: true,
    verdict: "pass",
    data: createSampleReviewData(),
    raw: "{}",
    err: "",
    ...overrides,
  };
}

export function createSampleOrchestratorResult(
  overrides?: Partial<OrchestratorResult>,
): OrchestratorResult {
  return {
    complexity: "medium",
    category: "code",
    selected_agents: ["agent-a", "agent-b"],
    reasoning: "Plan involves moderate code changes.",
    ...overrides,
  };
}

export function createSampleCombinedResult(
  overrides?: Partial<CombinedReviewResult>,
): CombinedReviewResult {
  return {
    plan_hash: "abc123def456",
    overall_verdict: "pass",
    orchestration: createSampleOrchestratorResult(),
    agents: {},
    timestamp: "2026-02-08T10:30:00.000Z",
    ...overrides,
  };
}

export function createSampleAgentConfig(
  overrides?: Partial<AgentConfig>,
): AgentConfig {
  return {
    name: "test-agent",
    model: "sonnet",
    focus: "code quality",
    enabled: true,
    categories: ["code"],
    description: "A test agent for unit testing.",
    system_prompt: "You are a test agent.",
    ...overrides,
  };
}

export function createSamplePlanReviewConfig(
  overrides?: Partial<PlanReviewConfig>,
): PlanReviewConfig {
  return {
    ...overrides,
  };
}
