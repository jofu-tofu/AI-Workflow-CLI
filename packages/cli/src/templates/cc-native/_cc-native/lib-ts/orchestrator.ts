/**
 * Plan orchestrator — analyzes complexity and selects reviewer agents.
 * See cc-native-plan-review-spec.md §4.8
 */

import { parseCliOutput } from "./cli-output-parser.js";
import type { AgentConfig, ComplexityCategory, OrchestratorConfig, OrchestratorResult } from "./types.js";
import { ORCHESTRATOR_SCHEMA } from "./types.js";
import { logDebug, logError, logInfo, logWarn } from "../../_shared/lib-ts/base/logger.js";
import { execFileAsync, findExecutable, getInternalSubprocessEnv } from "../../_shared/lib-ts/base/subprocess-utils.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AGENT_SELECTION: Record<string, unknown> = {
  simple: { min: 3, max: 3 },
  medium: { min: 8, max: 8 },
  high: { min: 12, max: 12 },
  fallbackCount: 3,
};

const DEFAULT_COMPLEXITY_CATEGORIES = [
  "code",
  "infrastructure",
  "documentation",
  "life",
  "business",
  "design",
  "research",
];

// ---------------------------------------------------------------------------
// Schema Builder
// ---------------------------------------------------------------------------

/**
 * Build orchestrator JSON schema with enum-constrained agent names.
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
  const selection = (settings.agentSelection as Record<string, unknown>) ?? DEFAULT_AGENT_SELECTION;
  const categories = (settings.complexityCategories as string[]) ?? DEFAULT_COMPLEXITY_CATEGORIES;
  const fallbackCount = (selection.fallbackCount as number) ?? 2;

  // Filter out mandatory agents — they always run
  const nonMandatory = agentLibrary.filter(
    (a) => a.enabled && !mandatory.has(a.name),
  );
  const validNames = nonMandatory.map((a) => a.name);

  logDebug("orchestrator", `Mandatory agents (always run): ${[...mandatory].sort().join(", ")}`);
  logDebug("orchestrator", `Non-mandatory agents for selection: ${validNames.join(", ")}`);

  const claudePath = findExecutable("claude");
  if (!claudePath) {
    logWarn(
      "orchestrator",
      "Claude CLI not found on PATH, falling back to medium complexity",
    );
    return makeFallback(nonMandatory, fallbackCount, "Orchestrator skipped - Claude CLI not found", "claude CLI not found on PATH");
  }

  logDebug("orchestrator", `Found Claude CLI at: ${claudePath}`);

  // Build agent list from non-mandatory agents
  const agentList = nonMandatory
    .map(
      (a) =>
        `- ${a.name} [${a.categories.join(", ")}]\n  Focus: ${a.focus}\n  Expertise: ${a.description}`,
    )
    .join("\n");
  const categoryList = categories.join("/");

  // Compute additional agent counts
  const mandatoryCount = agentLibrary.filter((a) => mandatory.has(a.name)).length;
  const simpleAdditional = Math.max(0, ((selection.simple as Record<string, number> | undefined)?.max ?? 3) - mandatoryCount);
  const mediumAdditional = Math.max(0, ((selection.medium as Record<string, number> | undefined)?.max ?? 8) - mandatoryCount);
  const highAdditional = Math.max(0, ((selection.high as Record<string, number> | undefined)?.max ?? 12) - mandatoryCount);

  const systemPrompt = `You are a plan orchestrator for code review. Your job is to analyze plans and select appropriate reviewer agents.

You MUST call StructuredOutput immediately with your analysis. Do NOT ask questions or use any other tools.

When selecting agents:
- Match agent expertise to plan requirements
- Consider what each agent specializes in
- Only select agents whose categories match the plan category
- Fewer agents for simple plans, more for complex plans`;

  const prompt = `Analyze this plan and select appropriate reviewer agents.

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

  const schema =
    validNames.length > 0
      ? buildOrchestratorSchema(validNames, categories)
      : ORCHESTRATOR_SCHEMA;
  const schemaJson = JSON.stringify(schema);

  const cmdArgs = [
    "--model", config.model,
    "--output-format", "json",
    "--json-schema", schemaJson,
    "--max-turns", "3",
    "--setting-sources", "",
    "--system-prompt", systemPrompt,
    "-p",
  ];

  logInfo("orchestrator", `Running with model: ${config.model}, timeout: ${config.timeout}s`);

  const env = getInternalSubprocessEnv();

  const result = await execFileAsync(claudePath, cmdArgs, {
    input: prompt,
    timeout: config.timeout * 1000,
    env: env as Record<string, string>,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.killed || result.signal === "SIGTERM") {
    logWarn("orchestrator", `TIMEOUT after ${config.timeout}s, falling back to medium complexity`);
    return makeFallback(nonMandatory, fallbackCount, "Orchestrator timed out - defaulting to medium complexity", `Orchestrator timed out after ${config.timeout}s`);
  }

  const raw = result.stdout.trim();
  if (result.stderr) logDebug("orchestrator", `stderr: ${result.stderr.slice(0, 300)}`);

  if (!raw && !result.stderr && result.exitCode !== 0) {
    logError("orchestrator", `Process exited with code ${result.exitCode}, falling back to medium complexity`);
    return makeFallback(nonMandatory, fallbackCount, `Orchestrator failed (exit ${result.exitCode})`, `Exit code ${result.exitCode}`);
  }

  const obj = parseCliOutput(raw);

  logDebug("orchestrator", `Raw output length: ${raw.length} chars`);
  if (raw) logDebug("orchestrator", `Raw output (first 500 chars): ${raw.slice(0, 500)}`);
  logDebug("orchestrator", `Parsed obj: ${JSON.stringify(obj)}`);

  if (!obj) {
    logWarn("orchestrator", "Failed to parse output, falling back to medium complexity");
    return makeFallback(nonMandatory, fallbackCount, "Orchestrator output could not be parsed", "Failed to parse orchestrator output");
  }

  // Extract and validate fields
  const rawComplexity = String(obj.complexity ?? "medium");
  const complexity: ComplexityCategory =
    rawComplexity === "simple" || rawComplexity === "medium" || rawComplexity === "high"
      ? rawComplexity
      : "medium";

  let category = (obj.category as string) ?? "code";
  if (!categories.includes(category)) category = "code";

  let {selectedAgents} = obj;
  if (!Array.isArray(selectedAgents)) selectedAgents = [];

  const reasoning = String(obj.reasoning ?? "").trim() || "No reasoning provided";
  const skipReason = obj.skipReason as string | undefined;

  logInfo("orchestrator", `Result: complexity=${complexity}, category=${category}, agents=${JSON.stringify(selectedAgents)}`);
  logDebug("orchestrator", `Reasoning: ${reasoning}`);

  return {
    complexity,
    category,
    selected_agents: selectedAgents as string[],
    reasoning,
    skip_reason: skipReason || undefined,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFallback(
  nonMandatory: AgentConfig[],
  fallbackCount: number,
  reasoning: string,
  error: string,
): OrchestratorResult {
  return {
    complexity: "medium",
    category: "code",
    selected_agents: nonMandatory.slice(0, fallbackCount).map((a) => a.name),
    reasoning,
    error,
  };
}
