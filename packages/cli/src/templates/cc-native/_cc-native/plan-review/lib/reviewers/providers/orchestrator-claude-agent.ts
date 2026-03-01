/**
 * Orchestrator agent implementation using BaseCliAgent framework.
 * Analyzes plan complexity and selects reviewer agents via Claude CLI.
 */

import { buildCliInvocation, reviewSpec } from "../../../../../_shared/lib-ts/base/cli-args.js";
import type { ExecutionBackend } from "../../../../../_shared/lib-ts/base/execution-backend.js";
import type { ExecutionResult } from "../../../../../_shared/lib-ts/base/execution-backend.js";
import { logDebug } from "../../../../../_shared/lib-ts/base/logger.js";
import { debugLog, debugRaw } from "../../../../lib-ts/debug.js";
import { parseCliOutput } from "../../../../lib-ts/cli-output-parser.js";
import type { AgentConfig, OrchestratorResult, ComplexityCategory } from "../../../../lib-ts/types.js";
import { BaseCliAgent } from "../base/base-agent.js";
import { buildOrchestratorSchema, ORCHESTRATOR_SCHEMA } from "../schemas.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COMPLEXITY_CATEGORIES = [
  "code",
  "infrastructure",
  "documentation",
  "life",
  "business",
  "design",
  "research",
];

const DEFAULT_AGENT_SELECTION: Record<string, unknown> = {
  simple: { min: 3, max: 3 },
  medium: { min: 8, max: 8 },
  high: { min: 12, max: 12 },
  fallbackCount: 3,
};

/**
 * Claude CLI-based orchestrator agent.
 * Extends BaseCliAgent<OrchestratorResult> to reuse subprocess execution infrastructure.
 */
export class OrchestratorClaudeAgent extends BaseCliAgent<OrchestratorResult> {
  private categories: string[];
  private fallbackCount: number;
  private mandatoryCount: number;
  private nonMandatory: AgentConfig[];
  private settings: Record<string, unknown>;
  private validNames: string[];

  constructor(
    agent: AgentConfig,
    agentLibrary: AgentConfig[],
    mandatoryNames: Set<string>,
    settings: Record<string, unknown>,
    timeout: number,
    contextPath?: string,
    sessionName?: string,
    backend?: ExecutionBackend,
  ) {
    // Build schema dynamically based on valid agent names
    const nonMandatory = agentLibrary.filter(
      (a) => !mandatoryNames.has(a.name),
    );
    const validNames = nonMandatory.map((a) => a.name);
    const categories = (settings.complexityCategories as string[]) ?? DEFAULT_COMPLEXITY_CATEGORIES;

    const schema = validNames.length > 0
      ? buildOrchestratorSchema(validNames, categories)
      : ORCHESTRATOR_SCHEMA;

    super({
      agent, schema, timeout, contextPath, sessionName,
      debugLogger: { log: debugLog, raw: debugRaw },
    }, backend);

    this.nonMandatory = nonMandatory;
    this.validNames = validNames;
    this.categories = categories;
    this.settings = settings;

    const selection = (settings.agentSelection as Record<string, unknown>) ?? DEFAULT_AGENT_SELECTION;
    this.fallbackCount = (selection.fallbackCount as number) ?? 2;
    this.mandatoryCount = agentLibrary.filter((a) => mandatoryNames.has(a.name)).length;

    logDebug("orchestrator", `Mandatory agents (always run): ${[...mandatoryNames].sort().join(", ")}`);
    logDebug("orchestrator", `Non-mandatory agents for selection: ${validNames.join(", ")}`);
  }

  protected buildCliArgs(): string[] {
    const systemPrompt = `You are a plan orchestrator for code review. Your job is to analyze plans and select appropriate reviewer agents.

You MUST call StructuredOutput immediately with your analysis. Do NOT ask questions or use any other tools.

When selecting agents:
- Match agent expertise to plan requirements
- Consider what each agent specializes in
- Only select agents whose categories match the plan category
- Fewer agents for simple plans, more for complex plans`;

    return buildCliInvocation(
      reviewSpec("claude", this.agent.model, this.schema, systemPrompt),
    ).args;
  }

  protected buildPrompt(plan: string): string {
    const selection = (this.settings.agentSelection as Record<string, unknown>) ?? DEFAULT_AGENT_SELECTION;

    const agentList = this.nonMandatory
      .map(
        (a) =>
          `- ${a.name} [${a.categories.join(", ")}]\n  Focus: ${a.focus}\n  Expertise: ${a.description}`,
      )
      .join("\n");
    const categoryList = this.categories.join("/");

    const simpleAdditional = Math.max(0, ((selection.simple as Record<string, number> | undefined)?.max ?? 3) - this.mandatoryCount);
    const mediumAdditional = Math.max(0, ((selection.medium as Record<string, number> | undefined)?.max ?? 8) - this.mandatoryCount);
    const highAdditional = Math.max(0, ((selection.high as Record<string, number> | undefined)?.max ?? 12) - this.mandatoryCount);

    return `Analyze this plan and select appropriate reviewer agents.

Available agents (select ONLY from this list):
${agentList}

Selection rules (number of ADDITIONAL agents to select from the list above):
- simple complexity = ${simpleAdditional} agents
- medium complexity = ${mediumAdditional} agents
- high complexity = ${highAdditional} agents
- Only select agents whose categories match the plan category (${categoryList})
- Non-technical plans (life, business) typically need 0 code-focused agents
- Note: mandatory agents run separately and are NOT listed above

PLAN:
<<<
${plan}
>>>

Call StructuredOutput now with: complexity, category, selectedAgents, reasoning`;
  }

  protected coerceResult(obj: Record<string, unknown> | null, _raw: string, _err: string): OrchestratorResult {
    if (!obj) {
      return this.makeFallback("Orchestrator output could not be parsed", "Failed to parse orchestrator output");
    }

    // Extract and validate fields
    const rawComplexity = String(obj.complexity ?? "medium");
    const complexity: ComplexityCategory =
      rawComplexity === "simple" || rawComplexity === "medium" || rawComplexity === "high"
        ? rawComplexity
        : "medium";

    let category = (obj.category as string) ?? "code";
    if (!this.categories.includes(category)) category = "code";

    let {selectedAgents} = obj;
    if (!Array.isArray(selectedAgents)) selectedAgents = [];

    const reasoning = String(obj.reasoning ?? "").trim() || "No reasoning provided";
    const skipReason = obj.skipReason as string | undefined;

    return {
      complexity,
      category,
      selected_agents: selectedAgents as string[],
      reasoning,
      skip_reason: skipReason || undefined,
    };
  }

  protected getCliName(): string {
    return "claude";
  }

  protected makeErrorResult(type: "skip" | "error", message: string): OrchestratorResult {
    return this.makeFallback(
      type === "skip" ? `Orchestrator skipped - ${message}` : message,
      message,
    );
  }

  protected parseOutput(raw: string, _result: ExecutionResult): Record<string, unknown> | null {
    return parseCliOutput(raw);
  }

  private makeFallback(reasoning: string, error: string): OrchestratorResult {
    return {
      complexity: "medium",
      category: "code",
      selected_agents: this.nonMandatory.slice(0, this.fallbackCount).map((a) => a.name),
      reasoning,
      error,
    };
  }
}
