/**
 * Plan orchestrator — analyzes complexity and selects reviewer agents.
 * See cc-native-plan-review-spec.md §4.8
 */

import { execSync } from "node:child_process";
import { logDebug, logInfo, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { getInternalSubprocessEnv } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import { parseCliOutput } from "./cli-output-parser.js";
import type { AgentConfig, OrchestratorConfig, OrchestratorResult } from "./types.js";
import { ORCHESTRATOR_SCHEMA } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AGENT_SELECTION: Record<string, any> = {
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
): Record<string, any> {
  const itemsSchema: Record<string, any> = { type: "string" };
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
export function runOrchestrator(
  plan: string,
  agentLibrary: AgentConfig[],
  config: OrchestratorConfig,
  settings: Record<string, any>,
  mandatoryNames?: Set<string>,
): OrchestratorResult {
  logInfo("orchestrator", "Starting plan analysis...");

  const mandatory = mandatoryNames ?? new Set<string>();
  const selection = (settings.agentSelection as Record<string, any>) ?? DEFAULT_AGENT_SELECTION;
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
    claudePath,
    "-p",
    "--model", config.model,
    "--output-format", "json",
    "--json-schema", schemaJson,
    "--max-turns", "3",
    "--setting-sources", "",
    "--system-prompt", systemPrompt,
  ];

  logInfo("orchestrator", `Running with model: ${config.model}, timeout: ${config.timeout}s`);

  const env = getInternalSubprocessEnv();

  let stdout = "";
  let stderr = "";

  try {
    stdout = execSync(cmdArgs.join("\x00"), {
      input: prompt,
      encoding: "utf-8",
      timeout: config.timeout * 1000,
      env: env as Record<string, string>,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString();
  } catch (e: any) {
    if (e.killed || e.signal === "SIGTERM") {
      logWarn("orchestrator", `TIMEOUT after ${config.timeout}s, falling back to medium complexity`);
      return makeFallback(nonMandatory, fallbackCount, "Orchestrator timed out - defaulting to medium complexity", `Orchestrator timed out after ${config.timeout}s`);
    }
    stdout = (e.stdout ?? "").toString();
    stderr = (e.stderr ?? "").toString();

    if (!stdout && !stderr) {
      logError("orchestrator", `Exception: ${e.message ?? e}, falling back to medium complexity`);
      return makeFallback(nonMandatory, fallbackCount, `Orchestrator failed: ${e.message ?? e}`, String(e.message ?? e));
    }
  }

  const raw = stdout.trim();
  if (stderr) logDebug("orchestrator", `stderr: ${stderr.slice(0, 300)}`);

  const obj = parseCliOutput(raw);

  logDebug("orchestrator", `Raw output length: ${raw.length} chars`);
  if (raw) logDebug("orchestrator", `Raw output (first 500 chars): ${raw.slice(0, 500)}`);
  logDebug("orchestrator", `Parsed obj: ${JSON.stringify(obj)}`);

  if (!obj) {
    logWarn("orchestrator", "Failed to parse output, falling back to medium complexity");
    return makeFallback(nonMandatory, fallbackCount, "Orchestrator output could not be parsed", "Failed to parse orchestrator output");
  }

  // Extract and validate fields
  let complexity = (obj.complexity as string) ?? "medium";
  if (!["simple", "medium", "high"].includes(complexity)) complexity = "medium";

  let category = (obj.category as string) ?? "code";
  if (!categories.includes(category)) category = "code";

  let selectedAgents = obj.selectedAgents;
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

function findExecutable(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] })
      .trim()
      .split("\n")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

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
