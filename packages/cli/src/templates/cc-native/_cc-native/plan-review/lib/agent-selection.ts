/**
 * Agent selection: mandatory resolution, orchestrator-based selection, model assignment.
 * Extracted from cc-native-plan-review.ts.
 */

import { logDebug, logInfo, logWarn } from "../../../_shared/lib-ts/base/logger.js";
import { findExecutable } from "../../../_shared/lib-ts/base/subprocess-utils.js";

import type {
  AgentConfig,
  ModelsConfig,
  OrchestratorResult,
  AgentSelectionResult,
} from "../../lib-ts/types.js";

const HOOK = "agent-selection";

// ---------------------------------------------------------------------------
// Mandatory Agent Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve mandatory agent names from config. Supports flat arrays or
 * complexity-tiered objects with `always`, `medium+`, and `high` keys.
 */
export function resolveMandatoryAgents(
  configValue: unknown,
  complexity: string,
): Set<string> {
  if (Array.isArray(configValue)) {
    return new Set(configValue as string[]);
  }
  if (!configValue || typeof configValue !== "object") {
    return new Set(["handoff-readiness", "clarity-auditor", "skeptic"]);
  }
  const cfg = configValue as Record<string, string[]>;
  const names = new Set(cfg.always ?? []);
  if (complexity === "medium" || complexity === "high") {
    for (const n of cfg["medium+"] ?? []) names.add(n);
  }
  if (complexity === "high") {
    for (const n of cfg.high ?? []) names.add(n);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Model Assignment
// ---------------------------------------------------------------------------

/**
 * Randomly assign enabled providers and models to agents.
 * Filters to providers whose CLI is available on PATH.
 */
export function assignModelsToAgents(
  agents: AgentConfig[],
  modelsConfig: ModelsConfig,
): AgentConfig[] {
  const enabledProviders = Object.entries(modelsConfig.providers)
    .filter(([name, config]) => {
      if (!config.enabled || config.models.length === 0) return false;
      const cliName = name === "claude" ? "claude" : name;
      const found = findExecutable(cliName);
      if (!found) {
        logWarn(HOOK, `Provider '${name}' enabled but CLI '${cliName}' not found on PATH — skipping`);
      }
      return !!found;
    });

  if (enabledProviders.length === 0) {
    logWarn(HOOK, "No providers with available CLI found, falling back to Claude with agent defaults");
    return agents.map(a => ({ ...a, provider: "claude" }));
  }

  return agents.map(agent => {
    const idx = Math.floor(Math.random() * enabledProviders.length);
    const entry = enabledProviders[idx];
    if (!entry) return { ...agent, provider: "claude" };
    const [providerName, providerConfig] = entry;
    const modelIdx = Math.floor(Math.random() * providerConfig.models.length);
    const model = providerConfig.models[modelIdx] ?? providerConfig.models[0] ?? agent.model;
    return { ...agent, provider: providerName, model };
  });
}

// ---------------------------------------------------------------------------
// Agent Selection
// ---------------------------------------------------------------------------

export interface AgentSelectionInput {
  enabledAgents: AgentConfig[];
  orchResult: OrchestratorResult | null;
  mandatoryConfig: unknown;
  agentSettings: Record<string, unknown>;
  legacyMode: boolean;
}

/**
 * Select agents based on orchestrator result and mandatory config.
 */
export function selectAgents(input: AgentSelectionInput): AgentSelectionResult {
  const { enabledAgents, orchResult, mandatoryConfig, agentSettings, legacyMode } = input;

  let detectedComplexity = "medium";
  let mandatoryNames = resolveMandatoryAgents(mandatoryConfig, "simple");

  if (enabledAgents.length === 0) {
    return { selectedAgents: [], mandatoryNames, detectedComplexity };
  }

  let mandatoryAgents = enabledAgents.filter(a => mandatoryNames.has(a.name));
  let nonMandatory = enabledAgents.filter(a => !mandatoryNames.has(a.name));

  logDebug(HOOK, `Mandatory agents: ${mandatoryAgents.map(a => a.name)}`);
  logDebug(HOOK, `Non-mandatory pool: ${nonMandatory.length} agents`);

  if (orchResult && !legacyMode) {
    detectedComplexity = orchResult.complexity;

    // Recompute mandatory with actual complexity
    mandatoryNames = resolveMandatoryAgents(mandatoryConfig, detectedComplexity);
    mandatoryAgents = enabledAgents.filter(a => mandatoryNames.has(a.name));
    nonMandatory = enabledAgents.filter(a => !mandatoryNames.has(a.name));

    const orchSelectedNames = new Set(
      orchResult.selected_agents.filter(n => !mandatoryNames.has(n)),
    );
    let orchSelected = nonMandatory.filter(a => orchSelectedNames.has(a.name));

    logDebug(HOOK, `Orchestrator selected (non-mandatory): ${orchSelected.map(a => a.name)}`);

    // Warn if orchestrator returned unknown names
    const knownNames = new Set(nonMandatory.map(a => a.name));
    const unmatched = [...orchSelectedNames].filter(n => !knownNames.has(n));
    if (unmatched.length > 0) {
      logWarn(HOOK, `Orchestrator selected unknown agents: ${unmatched}`);
    }

    // Enforce minimum agent count
    const fallbackByComplexity = agentSettings.fallbackByComplexity ?? { simple: 0, medium: 2, high: 4 };
    const minAdditional = fallbackByComplexity[detectedComplexity] ?? 5;
    if (orchSelected.length < minAdditional && nonMandatory.length > 0) {
      const remaining = nonMandatory.filter(a => !orchSelected.includes(a));
      const topUpCount = Math.min(minAdditional - orchSelected.length, remaining.length);
      if (topUpCount > 0) {
        const shuffled = [...remaining].sort(() => Math.random() - 0.5);
        const topUp = shuffled.slice(0, topUpCount);
        orchSelected = [...orchSelected, ...topUp];
        logDebug(HOOK, `Topped up ${topUpCount} agents to meet ${detectedComplexity} minimum: ${topUp.map(a => a.name)}`);
      }
    }

    const selectedAgents = [...mandatoryAgents, ...orchSelected];
    logInfo(HOOK, `Final selection: ${selectedAgents.length} agents (${mandatoryAgents.length} mandatory + ${orchSelected.length} additional)`);
    return { selectedAgents, mandatoryNames, detectedComplexity };
  }

  // Legacy mode: all enabled agents
  logInfo(HOOK, "Running in legacy mode (all enabled agents)");
  detectedComplexity = "medium";
  mandatoryNames = resolveMandatoryAgents(mandatoryConfig, detectedComplexity);
  return { selectedAgents: enabledAgents, mandatoryNames, detectedComplexity };
}
