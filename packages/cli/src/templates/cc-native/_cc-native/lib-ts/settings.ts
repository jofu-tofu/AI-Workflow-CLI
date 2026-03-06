/**
 * Settings loading, defaults, and agent library management.
 * Extracted from cc-native-plan-review.ts.
 */

import * as path from "node:path";


import { aggregateAgents } from "./aggregate-agents.js";
import { loadConfig, getDisplaySettings } from "./config.js";
import { DEFAULT_REVIEW_ITERATIONS } from "./state.js";
import type {
  AgentConfig,
  AgentReviewSettings,
  AgentSelectionConfig,
  LoadedSettings,
  ModelsConfig,
  PlanReviewSettings,
  ProviderConfig,
} from "./types.js";
import { DEFAULT_DISPLAY, DEFAULT_SANITIZATION } from "./types.js";
import { logInfo } from "../../_core/lib-ts/runtime/logger.js";
import { CODEX_MODELS } from "../../_core/lib-ts/runtime/models.js";

const HOOK = "settings";

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = ["code", "infrastructure", "documentation", "design", "research", "life", "business"];
const CODE_INFRA_DESIGN = ["code", "infrastructure", "design"];
const CODE_INFRA = ["code", "infrastructure"];
const AGENT_DEFAULTS = { model: "sonnet", provider: "claude", enabled: true } as const;

export const DEFAULT_AGENTS: Array<{ name: string; model: string; provider: string; focus: string; enabled: boolean; categories: string[] }> = [
  { ...AGENT_DEFAULTS, name: "handoff-readiness", focus: "fresh context execution readiness", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "clarity-auditor", focus: "communication clarity and execution readiness", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "skeptic", focus: "problem-solution alignment and assumption validation", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "documentation-philosophy", focus: "knowledge capture and documentation placement", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "risk-premortem", focus: "pre-mortem failure analysis", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "risk-fmea", focus: "systematic failure mode analysis", categories: CODE_INFRA_DESIGN },
  { ...AGENT_DEFAULTS, name: "risk-dependency", focus: "dependency chain and blast radius analysis", categories: CODE_INFRA },
  { ...AGENT_DEFAULTS, name: "risk-reversibility", focus: "decision reversibility and optionality", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "completeness-gaps", focus: "structural gap analysis", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "completeness-feasibility", focus: "feasibility and resource analysis", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "completeness-ordering", focus: "step ordering and critical path analysis", categories: CODE_INFRA_DESIGN },
  { ...AGENT_DEFAULTS, name: "arch-structure", focus: "coupling, cohesion, and boundary analysis", categories: CODE_INFRA_DESIGN },
  { ...AGENT_DEFAULTS, name: "arch-evolution", focus: "evolutionary architecture and change amplification", categories: CODE_INFRA_DESIGN },
  { ...AGENT_DEFAULTS, name: "arch-patterns", focus: "pattern selection and technology fit", categories: CODE_INFRA },
  { ...AGENT_DEFAULTS, name: "verify-coverage", focus: "verification coverage mapping", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "verify-strength", focus: "test quality and mutation analysis", categories: CODE_INFRA },
  { ...AGENT_DEFAULTS, name: "tradeoff-costs", focus: "opportunity cost and capability sacrifice", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "tradeoff-stakeholders", focus: "stakeholder impact and cost-benefit asymmetry", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "scope-boundary", focus: "scope drift and boundary enforcement", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "hidden-complexity", focus: "understated complexity and hidden difficulty", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "simplicity-guardian", focus: "over-engineering and unnecessary complexity", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "devils-advocate", focus: "contrarian analysis and reductio ad absurdum", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "assumption-tracer", focus: "dependency chains and foundational assumptions", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "incremental-delivery", focus: "incremental delivery and vertical slicing", categories: ALL_CATEGORIES },
  { ...AGENT_DEFAULTS, name: "constraint-validator", focus: "constraint identification and satisfaction", categories: ALL_CATEGORIES },
];

export const DEFAULT_ORCHESTRATOR = { enabled: true, model: CODEX_MODELS.codex, provider: "codex", timeout: 60 } as const;
export const DEFAULT_AGENT_MODEL = "sonnet";

export const DEFAULT_AGENT_SELECTION: AgentSelectionConfig = {
  simple: { min: 3, max: 3 },
  medium: { min: 5, max: 5 },
  high: { min: 7, max: 7 },
  fallbackCount: 3,
};

export const DEFAULT_COMPLEXITY_CATEGORIES = ["code", "infrastructure", "documentation", "life", "business", "design", "research"];

export const DEFAULT_MODELS_CONFIG: ModelsConfig = {
  providers: {
    claude: { enabled: false, models: ["sonnet"] },
    codex: { enabled: true, models: [CODEX_MODELS.codex] },
  },
};

// ---------------------------------------------------------------------------
// Settings Loading
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

export function loadSettings(projDir: string): LoadedSettings {
  const defaultPlan: PlanReviewSettings = {
    enabled: true,
    reviewers: {
      codex: { enabled: true, model: "", timeout: 120 },
      gemini: { enabled: false, model: "", timeout: 120 },
    },
    display: { ...DEFAULT_DISPLAY },
  };

  const defaultAgent: AgentReviewSettings = {
    enabled: true,
    orchestrator: { ...DEFAULT_ORCHESTRATOR },
    timeout: 180,
    highIssueThreshold: 3,
    legacyMode: false,
    display: { ...DEFAULT_DISPLAY },
    agentSelection: { ...DEFAULT_AGENT_SELECTION },
    agentDefaults: { model: DEFAULT_AGENT_MODEL },
    complexityCategories: [...DEFAULT_COMPLEXITY_CATEGORIES],
    sanitization: { ...DEFAULT_SANITIZATION },
  };

  const config = loadConfig(projDir);
  if (!config || Object.keys(config).length === 0) {
    return { planReview: defaultPlan, agentReview: defaultAgent, models: {} };
  }

  // Cast raw config to access arbitrary keys from JSON
  const raw = config as Record<string, unknown>;

  // Merge planReview
  const planReviewRaw = (asRecord(raw.planReview) ?? {}) as Partial<PlanReviewSettings>;
  const mergedPlan: PlanReviewSettings = { ...defaultPlan, ...planReviewRaw };
  if (planReviewRaw.reviewers) {
    mergedPlan.reviewers = { ...defaultPlan.reviewers, ...planReviewRaw.reviewers };
  }
  mergedPlan.display = getDisplaySettings(config, "planReview");

  // Merge agentReview
  const agentReviewRawRecord = asRecord(raw.agentReview);
  const agentReviewRaw = (agentReviewRawRecord ?? {}) as Partial<AgentReviewSettings>;
  const mergedAgent: AgentReviewSettings = { ...defaultAgent, ...agentReviewRaw };
  if (!mergedAgent.orchestrator || typeof mergedAgent.orchestrator !== "object") {
    mergedAgent.orchestrator = { ...DEFAULT_ORCHESTRATOR };
  } else {
    mergedAgent.orchestrator = { ...DEFAULT_ORCHESTRATOR, ...mergedAgent.orchestrator };
  }
  mergedAgent.display = getDisplaySettings(config, "agentReview");

  const nestedAgentSelection = asRecord(agentReviewRawRecord?.agentSelection) as AgentSelectionConfig | undefined;
  const topLevelAgentSelection = asRecord(raw.agentSelection) as AgentSelectionConfig | undefined;
  mergedAgent.agentSelection = {
    ...DEFAULT_AGENT_SELECTION,
    ...nestedAgentSelection,
    ...topLevelAgentSelection,
  };

  const nestedAgentDefaults = asRecord(agentReviewRawRecord?.agentDefaults) as { model?: string } | undefined;
  const topLevelAgentDefaults = asRecord(raw.agentDefaults) as { model?: string } | undefined;
  mergedAgent.agentDefaults = {
    model: DEFAULT_AGENT_MODEL,
    ...nestedAgentDefaults,
    ...topLevelAgentDefaults,
  };

  const nestedComplexityCategories = asStringArray(agentReviewRawRecord?.complexityCategories);
  const topLevelComplexityCategories = asStringArray(raw.complexityCategories);
  mergedAgent.complexityCategories = topLevelComplexityCategories
    ?? nestedComplexityCategories
    ?? [...DEFAULT_COMPLEXITY_CATEGORIES];

  const nestedSanitization = asRecord(agentReviewRawRecord?.sanitization);
  const topLevelSanitization = asRecord(raw.sanitization);
  mergedAgent.sanitization = {
    ...DEFAULT_SANITIZATION,
    ...nestedSanitization,
    ...topLevelSanitization,
  };

  const nestedFallbackByComplexity = asRecord(agentReviewRawRecord?.fallbackByComplexity) as Record<string, number> | undefined;
  const topLevelFallbackByComplexity = asRecord(raw.fallbackByComplexity) as Record<string, number> | undefined;
  if (nestedFallbackByComplexity || topLevelFallbackByComplexity) {
    mergedAgent.fallbackByComplexity = {
      ...(nestedFallbackByComplexity ?? {}),
      ...(topLevelFallbackByComplexity ?? {}),
    };
  }

  const nestedMandatoryAgents = agentReviewRawRecord?.mandatoryAgents as AgentReviewSettings["mandatoryAgents"] | undefined;
  const topLevelMandatoryAgents = raw.mandatoryAgents as AgentReviewSettings["mandatoryAgents"] | undefined;
  if (nestedMandatoryAgents !== undefined || topLevelMandatoryAgents !== undefined) {
    mergedAgent.mandatoryAgents = topLevelMandatoryAgents ?? nestedMandatoryAgents;
  }

  const nestedPreflight = asRecord(agentReviewRawRecord?.preflight);
  const topLevelPreflight = asRecord(raw.preflight);
  if (nestedPreflight || topLevelPreflight) {
    mergedAgent.preflight = {
      ...(nestedPreflight ?? {}),
      ...(topLevelPreflight ?? {}),
    };
  }

  const nestedReviewIterations = asRecord(agentReviewRawRecord?.reviewIterations) as Record<string, number> | undefined;
  const topLevelReviewIterations = asRecord(raw.reviewIterations) as Record<string, number> | undefined;
  mergedAgent.reviewIterations = {
    ...DEFAULT_REVIEW_ITERATIONS,
    ...(nestedReviewIterations ?? {}),
    ...(topLevelReviewIterations ?? {}),
  };

  const modelsRaw = (raw.models ?? {}) as Record<string, unknown>;
  return { planReview: mergedPlan, agentReview: mergedAgent, models: modelsRaw };
}

// ---------------------------------------------------------------------------
// Models Config
// ---------------------------------------------------------------------------

export function loadModelsConfig(settings: LoadedSettings): ModelsConfig {
  const raw = settings.models as Record<string, unknown> | undefined;
  if (!raw?.providers || typeof raw.providers !== "object") {
    return DEFAULT_MODELS_CONFIG;
  }
  const providers: Record<string, ProviderConfig> = {};
  for (const [name, cfg] of Object.entries(raw.providers as Record<string, unknown>)) {
    const c = cfg as Record<string, unknown>;
    providers[name] = {
      enabled: c.enabled !== false,
      models: Array.isArray(c.models) ? (c.models as string[]).filter(Boolean) : [],
    };
  }
  return { providers };
}

// ---------------------------------------------------------------------------
// Agent Library
// ---------------------------------------------------------------------------

export function loadAgentLibrary(
  projDir: string,
  settings?: AgentReviewSettings,
): AgentConfig[] {
  const agentsData = aggregateAgents(path.join(projDir, "_cc-native", "plan-review", "agents", "plan-review"));
  const defaultModel = settings?.agentDefaults?.model ?? DEFAULT_AGENT_MODEL;

  if (!agentsData || agentsData.length === 0) {
    logInfo(HOOK, "No agents found in frontmatter, using defaults");
    return DEFAULT_AGENTS.map(a => ({
      name: a.name,
      model: a.model ?? defaultModel,
      provider: a.provider ?? "claude",
      focus: a.focus ?? "general review",
      enabled: a.enabled ?? true,
      categories: a.categories ?? ["code"],
      description: "",
      system_prompt: "",
    }));
  }

  return agentsData.filter(a => a.name !== "plan-orchestrator");
}
