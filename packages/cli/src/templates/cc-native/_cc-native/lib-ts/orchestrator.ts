/**
 * Plan orchestrator — analyzes complexity and selects reviewer agents.
 * Uses OrchestratorClaudeAgent (BaseCliAgent framework) for subprocess execution.
 * See cc-native-plan-review-spec.md §4.8
 */

import { logInfo, logWarn } from "../../_shared/lib-ts/base/logger.js";
import type { AgentConfig, OrchestratorConfig, OrchestratorResult } from "./types.js";
import { OrchestratorClaudeAgent } from "./reviewers/providers/orchestrator-claude-agent.js";

// Re-export for backward compatibility (moved to reviewers/schemas.ts)
export { buildOrchestratorSchema } from "./reviewers/schemas.js";

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
  settings: Record<string, unknown>,
  mandatoryNames?: Set<string>,
): Promise<OrchestratorResult> {
  logInfo("orchestrator", "Starting plan analysis...");

  const mandatory = mandatoryNames ?? new Set<string>();

  // Create a synthetic AgentConfig for the orchestrator
  const orchestratorAgent: AgentConfig = {
    name: "orchestrator",
    model: config.model,
    provider: "claude",
    focus: "plan analysis and agent selection",
    enabled: config.enabled,
    categories: [],
    description: "Plan orchestrator",
    system_prompt: "",
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
  } catch (e) {
    logWarn("orchestrator", `Unexpected error: ${e}`);
    const nonMandatory = agentLibrary.filter((a) => a.enabled && !mandatory.has(a.name));
    const fallbackCount = ((settings.agentSelection as Record<string, unknown>)?.fallbackCount as number) ?? 2;
    return {
      complexity: "medium",
      category: "code",
      selected_agents: nonMandatory.slice(0, fallbackCount).map((a) => a.name),
      reasoning: `Orchestrator failed: ${e}`,
      error: String(e),
    };
  }
}
