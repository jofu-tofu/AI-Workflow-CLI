/**
 * Agent selection: mandatory resolution, orchestrator-based selection, model assignment.
 * Extracted from cc-native-plan-review.ts.
 */

import { logDebug, logInfo, logWarn } from "../../../_shared/lib-ts/base/logger.js";
import { findExecutable } from "../../../_shared/lib-ts/base/subprocess-utils.js";
import type {
  AgentConfig,
  AgentReviewSettings,
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
    return new Set(["clarity-auditor", "handoff-readiness", "skeptic"]);
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

/** Provider priority order: codex first (cheaper/faster), claude as fallback */
const PROVIDER_PRIORITY = ["codex", "claude"];

/**
 * Assign providers and models to agents.
 * When preflightAvailable is provided, filters to only models that passed preflight.
 * Providers are ordered by PROVIDER_PRIORITY (codex first, claude fallback).
 * All agents get the first available provider; random model within that provider.
 */
export function assignModelsToAgents(
  agents: AgentConfig[],
  modelsConfig: ModelsConfig,
  preflightAvailable?: Map<string, Set<string>>,
): AgentConfig[] {
  const enabledProviders = Object.entries(modelsConfig.providers)
    .filter(([name, config]) => {
      if (!config.enabled || config.models.length === 0) return false;
      const cliName = name === "claude" ? "claude" : name;
      const found = findExecutable(cliName);
      if (!found) {
        logWarn(HOOK, `Provider '${name}' enabled but CLI '${cliName}' not found on PATH — skipping`);
        return false;
      }
      return true;
    })
    .map(([name, config]) => {
      // Filter models by preflight results when available
      if (preflightAvailable) {
        const passedModels = preflightAvailable.get(name);
        if (!passedModels || passedModels.size === 0) {
          logWarn(HOOK, `Provider '${name}' has no models that passed preflight — skipping`);
          return null;
        }
        const filteredModels = config.models.filter(m => passedModels.has(m));
        if (filteredModels.length === 0) {
          logWarn(HOOK, `Provider '${name}': none of its configured models passed preflight — skipping`);
          return null;
        }
        return [name, { ...config, models: filteredModels }] as [string, typeof config];
      }
      return [name, config] as [string, typeof config];
    })
    .filter((entry): entry is [string, { enabled: boolean; models: string[] }] => entry !== null);

  // Sort by provider priority (codex first)
  enabledProviders.sort((a, b) => {
    const aIdx = PROVIDER_PRIORITY.indexOf(a[0]);
    const bIdx = PROVIDER_PRIORITY.indexOf(b[0]);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  if (enabledProviders.length === 0) {
    logWarn(HOOK, "No providers with available CLI found, falling back to Claude with agent defaults");
    return agents.map(a => ({ ...a, provider: "claude" }));
  }

  // Assign all agents to the first (highest-priority) available provider
  const [providerName, providerConfig] = enabledProviders[0]!;
  logInfo(HOOK, `Using provider: ${providerName} (models: ${providerConfig.models.join(", ")})`);

  return agents.map(agent => {
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
  agentSettings: AgentReviewSettings;
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
    const fallbackByComplexity: Record<string, number> = agentSettings.fallbackByComplexity ?? { simple: 0, medium: 2, high: 4 };
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
