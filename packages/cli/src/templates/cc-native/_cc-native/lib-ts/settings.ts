/**
 * Settings loading, defaults, and agent library management.
 * Extracted from cc-native-plan-review.ts.
 */

import * as path from "node:path";

import { logInfo } from "../../_core/lib-ts/runtime/logger.js";

import type {
  AgentConfig,
  OrchestratorConfig,
  ProviderConfig,
  ModelsConfig,
} from "./types.js";
import { DEFAULT_DISPLAY, DEFAULT_SANITIZATION } from "./types.js";
import { loadConfig, getDisplaySettings } from "./config.js";
import { aggregateAgents } from "./aggregate-agents.js";
import { DEFAULT_REVIEW_ITERATIONS } from "./state.js";

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

export const DEFAULT_ORCHESTRATOR: { enabled: boolean; model: string; timeout: number } = { enabled: true, model: "opus", timeout: 60 };
export const DEFAULT_AGENT_MODEL = "sonnet";

export const DEFAULT_AGENT_SELECTION: Record<string, unknown> = {
  simple: { min: 3, max: 3 },
  medium: { min: 5, max: 5 },
  high: { min: 7, max: 7 },
  fallbackCount: 3,
};

export const DEFAULT_COMPLEXITY_CATEGORIES = ["code", "infrastructure", "documentation", "life", "business", "design", "research"];

export const DEFAULT_MODELS_CONFIG: ModelsConfig = {
  providers: {
    claude: { enabled: true, models: ["sonnet"] },
    codex: { enabled: true, models: ["gpt-5.4"], reasoning_effort: "low" },
  },
};

// ---------------------------------------------------------------------------
// Settings Loading
// ---------------------------------------------------------------------------

export function loadSettings(projDir: string): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    planReview: {
      enabled: true,
      reviewers: {
        codex: { enabled: true, model: "", timeout: 120 },
        gemini: { enabled: false, model: "", timeout: 120 },
      },
      display: { ...DEFAULT_DISPLAY },
    },
    agentReview: {
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
    },
  };

  const config = loadConfig(projDir);
  if (!config || Object.keys(config).length === 0) return { ...defaults, models: {} };

  // Merge planReview
  const planReview = config.planReview ?? {};
  const mergedPlan = { ...defaults.planReview, ...planReview };
  if (planReview.reviewers) {
    mergedPlan.reviewers = { ...defaults.planReview.reviewers, ...planReview.reviewers };
  }
  mergedPlan.display = getDisplaySettings(config, "planReview");

  // Merge agentReview
  const agentReview = (config as Record<string, unknown>).agentReview ?? {};
  const mergedAgent = { ...defaults.agentReview, ...agentReview };
  if (!mergedAgent.orchestrator || typeof mergedAgent.orchestrator !== "object") {
    mergedAgent.orchestrator = { ...DEFAULT_ORCHESTRATOR };
  } else {
    mergedAgent.orchestrator = { ...DEFAULT_ORCHESTRATOR, ...mergedAgent.orchestrator };
  }
  mergedAgent.display = getDisplaySettings(config, "agentReview");
  const configRecord = config as Record<string, unknown>;
  mergedAgent.agentSelection = { ...DEFAULT_AGENT_SELECTION, ...((configRecord.agentSelection as Record<string, unknown>) ?? {}) };
  mergedAgent.agentDefaults = { model: DEFAULT_AGENT_MODEL, ...((configRecord.agentDefaults as Record<string, unknown>) ?? {}) };
  mergedAgent.complexityCategories = (configRecord.complexityCategories as string[]) ?? [...DEFAULT_COMPLEXITY_CATEGORIES];
  mergedAgent.sanitization = { ...DEFAULT_SANITIZATION, ...((configRecord.sanitization as Record<string, unknown>) ?? {}) };
  mergedAgent.reviewIterations = { ...DEFAULT_REVIEW_ITERATIONS, ...agentReview.reviewIterations ?? {} };

  const modelsRaw = (config as Record<string, unknown>).models ?? {};
  return { planReview: mergedPlan, agentReview: mergedAgent, models: modelsRaw };
}

// ---------------------------------------------------------------------------
// Models Config
// ---------------------------------------------------------------------------

export function loadModelsConfig(settings: Record<string, unknown>): ModelsConfig {
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
      ...(typeof c.reasoning_effort === "string" ? { reasoning_effort: c.reasoning_effort } : {}),
    };
  }
  return { providers };
}

// ---------------------------------------------------------------------------
// Agent Library
// ---------------------------------------------------------------------------

export function loadAgentLibrary(
  projDir: string,
  settings?: Record<string, unknown>,
): AgentConfig[] {
  const agentsData = aggregateAgents(path.join(projDir, "_cc-native", "agents", "plan-review"));
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
