/**
 * Plan orchestrator — analyzes complexity and selects reviewer agents.
 * Uses OrchestratorClaudeAgent (BaseCliAgent framework) for subprocess execution.
 * See cc-native-plan-review-spec.md §4.8
 */

import { fileURLToPath } from "node:url";

import { OrchestratorClaudeAgent } from "./reviewers/providers/orchestrator-claude-agent.js";
import { logInfo, logWarn } from "../../../_shared/lib-ts/base/logger.js";
import { readMarkdownBody } from "../../lib-ts/aggregate-agents.js";
import type { AgentConfig, AgentReviewSettings, OrchestratorConfig, OrchestratorResult } from "../../lib-ts/types.js";

// Re-export for backward compatibility (moved to reviewers/schemas.ts)
export { buildOrchestratorSchema } from "./reviewers/schemas.js";

const ORCHESTRATOR_PROMPT_PATH = fileURLToPath(new URL("../agents/PLAN-ORCHESTRATOR.md", import.meta.url));
const FALLBACK_ORCHESTRATOR_PROMPT = "You are a plan orchestrator for code review. Call StructuredOutput immediately.";

function loadOrchestratorPrompt(): string {
  const prompt = readMarkdownBody(ORCHESTRATOR_PROMPT_PATH)?.trim();
  return prompt && prompt.length > 0 ? prompt : FALLBACK_ORCHESTRATOR_PROMPT;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the orchestrator agent to analyze plan complexity and select reviewers.
 * Never throws — returns fallback OrchestratorResult on failure.
 */
export async function runOrchestrator(
  plan: string,
  agentLibrary: AgentConfig[],
  config: OrchestratorConfig,
  settings: AgentReviewSettings,
  mandatoryNames?: Set<string>,
): Promise<OrchestratorResult> {
  logInfo("orchestrator", "Starting plan analysis...");

  const mandatory = mandatoryNames ?? new Set<string>();

  // Create a synthetic AgentConfig for the orchestrator
  const orchestratorAgent: AgentConfig = {
    name: "orchestrator",
    model: config.model,
    provider: config.provider ?? "claude",
    focus: "plan analysis and agent selection",
    categories: [],
    description: "Plan orchestrator",
    system_prompt: loadOrchestratorPrompt(),
  };

  try {
    const agent = new OrchestratorClaudeAgent(
      orchestratorAgent,
      agentLibrary,
      mandatory,
      settings,
      config.timeout,
    );

    const result = await agent.review(plan);

    logInfo("orchestrator", `Result: complexity=${result.complexity}, category=${result.category}, agents=${JSON.stringify(result.selected_agents)}`);

    return result;
  } catch (error) {
    logWarn("orchestrator", `Unexpected error: ${error}`);
    const nonMandatory = agentLibrary.filter((a) => !mandatory.has(a.name));
    const fallbackCount = settings.agentSelection?.fallbackCount ?? 2;
    return {
      complexity: "medium",
      category: "code",
      selected_agents: nonMandatory.slice(0, fallbackCount).map((a) => a.name),
      reasoning: `Orchestrator failed: ${error}`,
      error: String(error),
    };
  }
}
