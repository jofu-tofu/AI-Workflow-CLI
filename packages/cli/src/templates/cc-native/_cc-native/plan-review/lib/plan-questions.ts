/**
 * Plan question generation — runs a fresh-context agent to identify
 * questions, assumptions, and ambiguities in a plan before review.
 * See cc-native-plan-review.ts for integration point (questions gate).
 */

import * as path from "node:path";

import { runAgentReview } from "./reviewers/index.js";
import { QUESTIONS_SCHEMA } from "./reviewers/schemas.js";
import { logInfo, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { findExecutable } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import { aggregateAgents } from "../../lib-ts/aggregate-agents.js";
import type { AgentConfig } from "../../lib-ts/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanQuestionsResult {
  questions: string[];
  assumptions: string[];
  ambiguities: string[];
}

// ---------------------------------------------------------------------------
// Provider assignment (local copy — avoids circular import from hook)
// ---------------------------------------------------------------------------

function assignProvider(agent: AgentConfig): AgentConfig {
  // Default to claude provider with the agent's configured model
  const found = findExecutable("claude");
  if (found) {
    return { ...agent, provider: "claude" };
  }
  logWarn("plan-questions", "Claude CLI not found, using agent defaults");
  return agent;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const HOOK = "plan-questions";

/**
 * Run the plan-questions agent to generate questions about a plan.
 * Returns structured questions/assumptions/ambiguities, or null on failure.
 *
 * The agent runs in a fresh context (no codebase, no session history)
 * and uses QUESTIONS_SCHEMA instead of REVIEW_SCHEMA — the agent runner
 * is schema-agnostic.
 */
export async function runPlanQuestions(
  plan: string,
  aiwcliDir: string,
  timeout: number,
  contextPath?: string,
  sessionName?: string,
): Promise<PlanQuestionsResult | null> {
  // Load the plan-questions agent from agents/plan-questions/
  const questionsAgentDir = path.join(aiwcliDir, "_cc-native", "plan-review", "agents", "plan-questions");
  const agents = aggregateAgents(questionsAgentDir);

  if (agents.length === 0) {
    logWarn(HOOK, `No agents found in ${questionsAgentDir}`);
    return null;
  }

  // Use the first agent (PLAN-QUESTIONER)
  let agent = agents[0]!;
  logInfo(HOOK, `Using plan-questions agent: ${agent.name}`);

  // Assign provider
  agent = assignProvider(agent);

  // Run the agent with QUESTIONS_SCHEMA
  const result = await runAgentReview(
    plan,
    agent,
    QUESTIONS_SCHEMA,
    timeout,
    contextPath,
    sessionName ?? "unknown",
  );

  if (!result.ok) {
    logError(HOOK, `Plan-questions agent failed: ${result.err}`);
    return null;
  }

  // Extract structured data
  const data = result.data ?? {};
  const questions = Array.isArray(data.questions) ? (data.questions as string[]) : [];
  const assumptions = Array.isArray(data.assumptions) ? (data.assumptions as string[]) : [];
  const ambiguities = Array.isArray(data.ambiguities) ? (data.ambiguities as string[]) : [];

  logInfo(HOOK, `Plan-questions result: ${questions.length} questions, ${assumptions.length} assumptions, ${ambiguities.length} ambiguities`);

  return { questions, assumptions, ambiguities };
}
