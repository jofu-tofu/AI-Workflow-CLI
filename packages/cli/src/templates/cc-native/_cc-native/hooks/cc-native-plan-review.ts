#!/usr/bin/env bun
/**
 * CC-Native Plan Review Hook (Unified)
 *
 * Claude Code PreToolUse hook that intercepts ExitPlanMode and
 * automatically reviews plans using:
 * 1. CLI reviewers (Codex + Gemini)
 * 2. Plan orchestrator for complexity analysis
 * 3. Claude Code agents in parallel
 *
 * Trigger: ExitPlanMode tool use (PreToolUse - runs BEFORE user approval prompt)
 *
 * Configuration: _cc-native/plan-review.config.json -> planReview, agentReview
 *
 * Output: _output/cc-native/plans/{YYYY-MM-DD}/{slug}/reviews/
 *   - review.json (combined review data)
 *   - review.md (combined markdown)
 *   - plan.md (plan snapshot at review time)
 *   - reviewer-output/{reviewer}.json (individual reviewer results)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  loadHookInput,
  runHookAsync,
  logDebug,
  logInfo,
  logWarn,
  logError,
  logDiagnostic,
  emitContext,
  emitContextAndBlock,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall, findExecutable } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getProjectRoot, getAiwcliDir, getContextReviewsDir, getContextDir, getReviewFolderPath } from "../../_shared/lib-ts/base/constants.js";
import { eprint } from "../../_shared/lib-ts/base/utils.js";
import { getContextBySessionId, getAllContexts } from "../../_shared/lib-ts/context/context-store.js";
import { findPlanPathInTranscript } from "../../_shared/lib-ts/context/plan-manager.js";

import type {
  AgentConfig,
  OrchestratorConfig,
  ProviderConfig,
  ModelsConfig,
  ReviewerResult,
  CombinedReviewResult,
  OrchestratorResult,
  Verdict,
  IterationState,
} from "../lib-ts/types.js";
import type { ContextState } from "../../_shared/lib-ts/types.js";
import {
  REVIEW_SCHEMA,
  DEFAULT_DISPLAY,
  DEFAULT_SANITIZATION,
} from "../lib-ts/types.js";

import {
  isPlanAlreadyReviewed,
  wasPlanPreviouslyDenied,
  getLastPlanReview,
  markPlanReviewed,
  wasQuestionsAsked,
  markQuestionsAsked,
} from "../lib-ts/cc-native-state.js";

import { worstVerdict } from "../lib-ts/verdict.js";
import { computeCorroboratedDecision } from "../lib-ts/corroboration.js";
import { loadConfig, getDisplaySettings } from "../lib-ts/config.js";
import { runOrchestrator } from "../lib-ts/orchestrator.js";
import { aggregateAgents } from "../lib-ts/aggregate-agents.js";
import { debugLog } from "../lib-ts/debug.js";
import {
  writeCombinedArtifacts,
  buildInlineReviewSummary,
  extractTopIssuesText,
  buildHighIssuesDocument,
  buildCorroborationReport,
  writeReviewTracker,
} from "../lib-ts/artifacts.js";
import type { ReviewTrackerEntry } from "../lib-ts/artifacts.js";
import { runAgentReview } from "../lib-ts/reviewers/index.js";
import { DEFAULT_REVIEW_ITERATIONS } from "../lib-ts/state.js";
import { runPlanQuestions } from "../lib-ts/plan-questions.js";

// ---------------------------------------------------------------------------
// Hook Name
// ---------------------------------------------------------------------------

const HOOK = "cc-native-plan-review";

// ---------------------------------------------------------------------------
// Inline Utilities (no TS export for these yet)
// ---------------------------------------------------------------------------

function findPlanFile(): string | null {
  const plansDir = path.join(os.homedir(), ".claude", "plans");
  if (!fs.existsSync(plansDir)) return null;
  const files = fs.readdirSync(plansDir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const p = path.join(plansDir, f);
      return { path: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0]!.path : null;
}

function computePlanHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex").slice(0, 16);
}

function skipWithInfo(reason: string): void {
  logInfo(HOOK, `Skipping: ${reason}`);
  emitContext(`[Plan Review Skipped] ${reason}`);
}

function extractTopIssuesForTracker(
  combined: CombinedReviewResult,
  maxCount = 5,
): string[] {
  const allReviewers = Object.values(combined.agents);
  const issues: string[] = [];
  for (const r of allReviewers) {
    if (!r.data) continue;
    const issueList = r.data.issues as Array<Record<string, unknown>> | undefined;
    if (!issueList) continue;
    for (const issue of issueList) {
      if (issue.severity === "high") {
        const text = String(issue.issue ?? "").trim();
        if (text) {
          issues.push(`[${r.name}] ${text}`);
        }
      }
    }
    if (issues.length >= maxCount) break;
  }
  return issues.slice(0, maxCount);
}

// ---------------------------------------------------------------------------
// Graduation Logic
// ---------------------------------------------------------------------------

/**
 * Determine which agents are pass-eligible this iteration.
 * Criteria: verdict === "pass" OR zero high-severity issues.
 * Agents with "skip"/"error" are NOT eligible (no signal).
 */
function computePassEligible(agentResults: Record<string, ReviewerResult>): string[] {
  const eligible: string[] = [];
  for (const [name, result] of Object.entries(agentResults)) {
    if (result.verdict === "skip" || result.verdict === "error") continue;
    if (result.verdict === "pass") { eligible.push(name); continue; }
    const issues = Array.isArray(result.data?.issues)
      ? (result.data.issues as Array<{ severity?: string }>) : [];
    if (issues.filter(i => i.severity === "high").length === 0) {
      eligible.push(name);
    }
  }
  return eligible;
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const ALL_CATEGORIES = ["code", "infrastructure", "documentation", "design", "research", "life", "business"];
const CODE_INFRA_DESIGN = ["code", "infrastructure", "design"];
const CODE_INFRA = ["code", "infrastructure"];
const AGENT_DEFAULTS = { model: "sonnet", provider: "claude", enabled: true } as const;

const DEFAULT_AGENTS: Array<{ name: string; model: string; provider: string; focus: string; enabled: boolean; categories: string[] }> = [
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

const DEFAULT_ORCHESTRATOR: { enabled: boolean; model: string; timeout: number } = { enabled: true, model: "opus", timeout: 60 };
const DEFAULT_AGENT_MODEL = "sonnet";

const DEFAULT_AGENT_SELECTION: Record<string, unknown> = {
  simple: { min: 3, max: 3 },
  medium: { min: 5, max: 5 },
  high: { min: 7, max: 7 },
  fallbackCount: 3,
};

const DEFAULT_COMPLEXITY_CATEGORIES = ["code", "infrastructure", "documentation", "life", "business", "design", "research"];

// ---------------------------------------------------------------------------
// Mandatory Agent Resolution
// ---------------------------------------------------------------------------

function resolveMandatoryAgents(
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
// Context Lookup
// ---------------------------------------------------------------------------

function getActiveContextForReview(sessionId: string, projectRoot: string): ContextState | null {
  // Strategy 1: By session_id
  const ctx = getContextBySessionId(sessionId, projectRoot);
  if (ctx) {
    logInfo(HOOK, `Found context by session_id: ${ctx.id}`);
    return ctx;
  }
  // Strategy 2: Single planning context
  const allActive = getAllContexts("active", projectRoot);
  const planning = allActive.filter(c => c.mode === "active" || c.mode === "has_plan");
  if (planning.length === 1) {
    logInfo(HOOK, `Found single planning context: ${planning[0]!.id}`);
    return planning[0]!;
  }
  if (planning.length > 1) {
    logWarn(HOOK, `Multiple planning contexts (${planning.length}), cannot determine which to use`);
  } else if (allActive.length > 0) {
    logInfo(HOOK, `Found ${allActive.length} active context(s) but none in planning mode`);
  } else {
    logInfo(HOOK, "No active contexts found");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Iteration State
// ---------------------------------------------------------------------------

function loadIterationState(reviewsDir: string): IterationState | null {
  const iterationFile = path.join(reviewsDir, "iteration.json");
  if (!fs.existsSync(iterationFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(iterationFile, "utf-8")) as IterationState;
  } catch (e) {
    logError(HOOK, `Failed to load iteration state: ${e}`);
    return null;
  }
}

function saveIterationState(reviewsDir: string, state: IterationState & { schema_version?: string }): boolean {
  const iterationFile = path.join(reviewsDir, "iteration.json");
  try {
    fs.mkdirSync(reviewsDir, { recursive: true });
    state.schema_version = "1.0.0";
    fs.writeFileSync(iterationFile, JSON.stringify(state, null, 2), "utf-8");
    return true;
  } catch (e) {
    logError(HOOK, `Failed to save iteration state: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Model Provider Assignment
// ---------------------------------------------------------------------------

const DEFAULT_MODELS_CONFIG: ModelsConfig = {
  providers: {
    claude: { enabled: true, models: ["sonnet"] },
    codex: { enabled: true, models: ["gpt-5.1-codex-mini"] },
  },
};

function loadModelsConfig(settings: Record<string, unknown>): ModelsConfig {
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

function assignModelsToAgents(
  agents: AgentConfig[],
  modelsConfig: ModelsConfig,
): AgentConfig[] {
  // Filter to providers that are enabled, have models, AND whose CLI exists
  const enabledProviders = Object.entries(modelsConfig.providers)
    .filter(([name, config]) => {
      if (!config.enabled || config.models.length === 0) return false;
      const cliName = name === "claude" ? "claude" : name; // CLI name matches provider name
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
// Settings Loading
// ---------------------------------------------------------------------------

function loadSettings(projDir: string): Record<string, unknown> {
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

function loadAgentLibrary(
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

// ---------------------------------------------------------------------------
// Main Hook
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logInfo(HOOK, "Unified hook started (PreToolUse)");

  if (isInternalCall()) {
    logDebug(HOOK, "Skipping: internal subprocess call");
    return;
  }

  const payload = loadHookInput();
  if (!payload) {
    skipWithInfo("Invalid JSON input from Claude Code");
    return;
  }

  const toolName = payload.tool_name;
  logDebug(HOOK, `tool_name: ${toolName}`);

  if (toolName !== "ExitPlanMode") {
    logDebug(HOOK, "Skipping: not ExitPlanMode");
    return;
  }

  const sessionId = String(payload.session_id ?? "unknown");
  const base = getProjectRoot(payload.cwd);
  const aiwcliDir = getAiwcliDir(base);
  const settings = loadSettings(aiwcliDir);

  const planSettings = settings.planReview ?? {};
  const agentSettings = settings.agentReview ?? {};

  const planReviewEnabled = planSettings.enabled ?? true;
  const agentReviewEnabled = agentSettings.enabled ?? true;

  if (!planReviewEnabled && !agentReviewEnabled) {
    logInfo(HOOK, "Skipping: both plan and agent review disabled");
    return;
  }

  // Find plan file: prefer transcript-based discovery (session-accurate), fall back to mtime scan
  const transcriptPath = payload.transcript_path as string | undefined;
  let planPath: string | null = null;

  if (transcriptPath) {
    planPath = findPlanPathInTranscript(transcriptPath);
    if (planPath) {
      logInfo(HOOK, `Found plan via transcript: ${planPath}`);
    } else {
      logDebug(HOOK, "No plan Write found in transcript, falling back to mtime scan");
    }
  }

  if (!planPath) {
    planPath = findPlanFile();
  }

  if (!planPath) {
    skipWithInfo("No plan file found in ~/.claude/plans/. The plan may not have been written yet.");
    return;
  }

  let plan: string;
  try {
    plan = fs.readFileSync(planPath, "utf-8").trim();
  } catch (e) {
    skipWithInfo(`Failed to read plan file: ${e}`);
    return;
  }

  if (!plan) {
    skipWithInfo("Plan file exists but is empty.");
    return;
  }

  logInfo(HOOK, `Found plan at: ${planPath}`);
  logDebug(HOOK, `Plan length: ${plan.length} chars`);

  // ============================================
  // Questions Gate: ask user questions before review
  // ============================================
  if (!wasQuestionsAsked(sessionId, base)) {
    logInfo(HOOK, "Questions gate: user has not been asked questions yet, running plan-questions agent");
    const timeout = typeof (settings.agentReview ?? {}).timeout === "number"
      ? (settings.agentReview as Record<string, unknown>).timeout as number : 120;
    const questionsResult = await runPlanQuestions(plan, aiwcliDir, timeout, undefined, sessionId);

    // Mark questions as asked NOW — prevents infinite gate loop if Claude
    // doesn't use AskUserQuestion after denial. Gate fires at most once.
    markQuestionsAsked(sessionId, base);

    const hasQuestions = questionsResult && (
      questionsResult.questions.length > 0 ||
      questionsResult.assumptions.length > 0 ||
      questionsResult.ambiguities.length > 0
    );

    if (hasQuestions) {
      const questionsList = questionsResult.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n");
      const assumptionsList = questionsResult.assumptions.length > 0
        ? `\n\nAssumptions detected:\n${questionsResult.assumptions.map((a: string) => `- ${a}`).join("\n")}`
        : "";
      const ambiguitiesList = questionsResult.ambiguities.length > 0
        ? `\n\nAmbiguities detected:\n${questionsResult.ambiguities.map((a: string) => `- ${a}`).join("\n")}`
        : "";
      const contextMsg = `## Plan Questions (from independent review)\n\nAn agent reviewed your plan in a fresh context — without access to your session history or codebase exploration. It identified these questions:\n\n${questionsList}${assumptionsList}${ambiguitiesList}\n\nAsk the user these questions using AskUserQuestion before submitting the plan.`;
      emitContextAndBlock(contextMsg, "Ask the user clarifying questions before submitting the plan. Use AskUserQuestion with the questions above.");
      return;
    }

    logInfo(HOOK, "Questions gate: no questions generated, proceeding to review");
  } else {
    logInfo(HOOK, "Questions gate: questions already asked, skipping");
  }

  const planHash = computePlanHash(plan);
  logDiagnostic(HOOK, "receive", `plan_size=${plan.length}, session=${sessionId.slice(0, 8)}`, {
    inputs: { plan_hash: planHash, plan_size: plan.length, session_id: sessionId.slice(0, 12) },
  });

  // Find active context
  const activeContext = getActiveContextForReview(sessionId, base);
  if (!activeContext) {
    skipWithInfo("No active planning context found for this session.");
    return;
  }

  const contextId = activeContext.id;
  const reviewsDir = path.join(getContextReviewsDir(contextId, base), "cc-native");
  logDebug(HOOK, `Using context reviews dir: ${reviewsDir}`);

  const contextPath = getContextDir(contextId, base);
  logDebug(HOOK, `Context path for debug: ${contextPath}`);

  // Plan-hash deduplication
  logDebug(HOOK, `Plan hash: ${planHash}`);
  if (isPlanAlreadyReviewed(sessionId, planHash, base)) {
    const lastReview = getLastPlanReview(sessionId, planHash, base);

    if (wasPlanPreviouslyDenied(sessionId, planHash, base)) {
      // Plan unchanged since last FAIL verdict
      emitContextAndBlock(
        "[Plan Review] Plan content unchanged since last review which found issues.",
        "Plan unchanged since denial. Modify the plan to address review findings, then attempt ExitPlanMode again.",
      );
      return;
    } else {
      // Plan already reviewed with PASS or WARN verdict - skip review
      const verdict = lastReview?.iteration?.latest_verdict || "pass";
      const skipMsg = `[Plan Review] Plan already reviewed (verdict: ${verdict}). Skipping re-review.`;
      emitContext(skipMsg);
      logInfo(HOOK, skipMsg);
      return;
    }
  }

  // Single load of iteration state — reused throughout, saved once at end.
  // Default max=1 is safe: first iteration 1>1=false (runs), Edit E updates max from config before save.
  let iterationState: IterationState = loadIterationState(reviewsDir) ?? {
    current: 1, max: 1, complexity: "medium",
    history: [], graduated: [], passStreaks: {}, lastPlanHash: "",
  };

  // Log plan hash changes for diagnostics (iteration counter no longer resets —
  // plans change every iteration as Claude addresses feedback, so resetting
  // would keep iteration perpetually at 1).
  const lastHash = iterationState.lastPlanHash ?? "";
  if (lastHash && lastHash !== planHash) {
    logInfo(HOOK, `Plan hash changed (${lastHash.slice(0, 8)}→${planHash.slice(0, 8)}), iteration continues at ${iterationState.current}`);
  }

  // Early iteration check: if we've exhausted max iterations, allow plan through
  if (iterationState.current > iterationState.max) {
    skipWithInfo(`Max review iterations reached (${iterationState.current - 1}/${iterationState.max}), allowing plan through.`);
    return;
  }

  // Initialize result containers
  let orchResult: OrchestratorResult | null = null;
  const agentResults: Record<string, ReviewerResult> = {};
  let detectedComplexity = "medium";

  // ============================================
  // PHASE 1: Orchestrator (Complexity Analysis)
  // ============================================

  // Graduated agents from previous iterations (empty after hash reset or on iteration 1)
  const graduatedSet = new Set(iterationState.graduated);
  if (graduatedSet.size > 0) {
    logInfo(HOOK, `Graduated agents from previous iterations: ${[...graduatedSet].sort().join(", ")}`);
  }

  const agentLibrary = agentReviewEnabled ? loadAgentLibrary(aiwcliDir, agentSettings) : [];
  const originalAgentCount = agentLibrary.length;
  const enabledAgents = agentLibrary.filter(a => !graduatedSet.has(a.name));
  const timeout = typeof agentSettings.timeout === "number" ? agentSettings.timeout : 120;
  const legacyMode = agentSettings.legacyMode === true;

  const orchSettings = agentSettings.orchestrator ?? DEFAULT_ORCHESTRATOR;
  const orchestratorConfig: OrchestratorConfig = {
    enabled: (orchSettings.enabled ?? true) && agentReviewEnabled,
    model: orchSettings.model ?? "haiku",
    timeout: orchSettings.timeout ?? 30,
  };

  const mandatoryConfig = agentSettings.mandatoryAgents ?? ["handoff-readiness", "clarity-auditor", "skeptic"];
  const alwaysMandatory = resolveMandatoryAgents(mandatoryConfig, "simple");
  let mandatoryNames = alwaysMandatory;

  logDebug(HOOK, `Agent library: ${agentLibrary.map(a => a.name)}`);
  logDebug(HOOK, `Mandatory agents: ${[...mandatoryNames].sort()}`);
  logDebug(HOOK, `Orchestrator enabled: ${orchestratorConfig.enabled}`);

  // Build phase 1 tasks as promises
  const phase1Promises: Array<{ name: string; promise: Promise<ReviewerResult | OrchestratorResult> }> = [];

  if (orchestratorConfig.enabled && enabledAgents.length > 0 && !legacyMode) {
    phase1Promises.push({
      name: "orchestrator",
      promise: runOrchestrator(plan, enabledAgents, orchestratorConfig, agentSettings, alwaysMandatory),
    });
  }

  logInfo(HOOK, `=== PHASE 1: Running ${phase1Promises.length} tasks in parallel ===`);

  const phase1Results: Record<string, ReviewerResult | OrchestratorResult> = {};
  if (phase1Promises.length > 0) {
    const results = await Promise.allSettled(
      phase1Promises.map(async ({ name, promise }) => {
        const result = await promise;
        return { name, result };
      }),
    );
    for (const [i, r] of results.entries()) {
      if (r.status === "fulfilled") {
        phase1Results[r.value.name] = r.value.result;
        logInfo(HOOK, `${r.value.name} completed`);
      } else {
        const failedName = phase1Promises[i]?.name ?? "unknown";
        logError(HOOK, `${failedName} failed: ${r.reason}`);
      }
    }
  }

  // Collect orchestrator result
  if (phase1Results.orchestrator) orchResult = phase1Results.orchestrator as OrchestratorResult;

  // ============================================
  // PHASE 2: Agent Selection
  // ============================================
  if (agentReviewEnabled) {
    logInfo(HOOK, "=== PHASE 2: Agent Selection ===");

    let selectedAgents: AgentConfig[] = [];
    const fallbackByComplexity = agentSettings.fallbackByComplexity ?? { simple: 0, medium: 2, high: 4 };

    if (enabledAgents.length > 0) {
      let mandatoryAgents = enabledAgents.filter(a => mandatoryNames.has(a.name));
      let nonMandatory = enabledAgents.filter(a => !mandatoryNames.has(a.name));

      logDebug(HOOK, `Mandatory agents: ${mandatoryAgents.map(a => a.name)}`);
      logDebug(HOOK, `Non-mandatory pool: ${nonMandatory.length} agents`);

      if (orchResult && !legacyMode) {
        detectedComplexity = orchResult.complexity;

        // Phase 2: Recompute mandatory with actual complexity
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
        const minAdditional = fallbackByComplexity[detectedComplexity] ?? 5;
        if (orchSelected.length < minAdditional && nonMandatory.length > 0) {
          const remaining = nonMandatory.filter(a => !orchSelected.includes(a));
          const topUpCount = Math.min(minAdditional - orchSelected.length, remaining.length);
          if (topUpCount > 0) {
            // Shuffle and take random sample
            const shuffled = [...remaining].sort(() => Math.random() - 0.5);
            const topUp = shuffled.slice(0, topUpCount);
            orchSelected = [...orchSelected, ...topUp];
            logDebug(HOOK, `Topped up ${topUpCount} agents to meet ${detectedComplexity} minimum: ${topUp.map(a => a.name)}`);
          }
        }

        selectedAgents = [...mandatoryAgents, ...orchSelected];
        logInfo(HOOK, `Final selection: ${selectedAgents.length} agents (${mandatoryAgents.length} mandatory + ${orchSelected.length} additional)`);
      } else {
        logInfo(HOOK, "Running in legacy mode (all enabled agents)");
        detectedComplexity = "medium";
        mandatoryNames = resolveMandatoryAgents(mandatoryConfig, detectedComplexity);
        selectedAgents = enabledAgents;
      }
    }

    logDiagnostic(HOOK, "decide", `Selected ${selectedAgents.length} agents, complexity=${detectedComplexity}`, {
      decision: "agents_selected",
      reasoning: `orchestrator=${orchResult !== null}, legacy=${legacyMode}`,
      inputs: {
        agents: selectedAgents.map(a => a.name),
        complexity: detectedComplexity,
        mandatory_count: selectedAgents.filter(a => mandatoryNames.has(a.name)).length,
      },
    });

    // Update complexity/max on the already-loaded iteration state (no second disk read)
    const reviewIterations: Record<string, number> = {
      ...DEFAULT_REVIEW_ITERATIONS,
      ...(agentSettings.reviewIterations ?? {}),
    };
    iterationState.complexity = detectedComplexity;
    iterationState.max = reviewIterations[detectedComplexity] ?? iterationState.max;
    logDebug(HOOK, `Iteration state: ${iterationState.current}/${iterationState.max} (${detectedComplexity})`);

    // Assign random providers + models to selected agents
    const modelsConfig = loadModelsConfig(settings);
    selectedAgents = assignModelsToAgents(selectedAgents, modelsConfig);
    logInfo(HOOK, `Model assignments: ${selectedAgents.map(a => `${a.name}→${a.provider}:${a.model}`).join(", ")}`);

    // PHASE 3: Run selected agents in parallel
    if (selectedAgents.length > 0) {
      logInfo(HOOK, "=== PHASE 3: Agent Reviews ===");
      logInfo(HOOK, `Launching ${selectedAgents.length} agents in parallel`);

      debugLog(contextPath, sessionId, "hook", "agent_review_start", {
        agents: selectedAgents.map(a => a.name),
        timeout,
        complexity: detectedComplexity,
      });

      const agentPromises = selectedAgents.map(async agent => {
        const result = await runAgentReview(plan, agent, REVIEW_SCHEMA, timeout, contextPath, sessionId);
        return { agent, result };
      });

      const agentSettled = await Promise.allSettled(agentPromises);
      for (const [i, r] of agentSettled.entries()) {
        if (r.status === "fulfilled") {
          const { agent, result } = r.value;
          agentResults[agent.name] = result;
          logInfo(HOOK, `${agent.name} completed with verdict: ${result.verdict}`);
        } else {
          const failedAgent = selectedAgents[i]!;
          logError(HOOK, `${failedAgent.name} failed with exception: ${r.reason}`);
          agentResults[failedAgent.name] = {
            name: failedAgent.name,
            ok: false,
            verdict: "error",
            data: {},
            raw: "",
            err: String(r.reason),
          };
        }
      }
    }
  }

  // ============================================
  // Enforce per-agent issue limit (truncate to top N by severity)
  // ============================================
  const maxIssuesPerAgent = typeof agentSettings.maxIssuesPerAgent === "number"
    ? agentSettings.maxIssuesPerAgent : 3;

  for (const r of Object.values(agentResults)) {
    if (!Array.isArray(r.data?.issues)) continue;
    const issues = r.data.issues as Array<{ severity?: string }>;
    if (issues.length <= maxIssuesPerAgent) continue;
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => (severityOrder[a.severity ?? "low"] ?? 2) - (severityOrder[b.severity ?? "low"] ?? 2));
    const originalCount = issues.length;
    r.data.issues = issues.slice(0, maxIssuesPerAgent);
    logInfo(HOOK, `${r.name}: truncated issues ${originalCount} → ${maxIssuesPerAgent}`);
  }

  // ============================================
  // Compute pass-eligible agents (before verdict overrides)
  // ============================================
  const passEligible = computePassEligible(agentResults);
  if (passEligible.length > 0) {
    logInfo(HOOK, `Pass-eligible agents this iteration: ${passEligible.join(", ")}`);
  }

  // ============================================
  // Per-agent high-severity threshold: override verdict to "fail"
  // ============================================
  const highIssueThreshold = typeof agentSettings.highIssueThreshold === "number" ? agentSettings.highIssueThreshold : 3;

  for (const r of Object.values(agentResults)) {
    if (!r.verdict || r.verdict === "skip" || r.verdict === "error") continue;
    const issues = Array.isArray(r.data?.issues) ? r.data.issues as Array<{ severity?: string }> : [];
    const agentHigh = issues.filter(i => i.severity === "high").length;
    let verdict = r.verdict;
    if (agentHigh >= highIssueThreshold) {
      logInfo(HOOK, `${r.name}: verdict overridden to 'fail' (${agentHigh} high issues >= ${highIssueThreshold})`);
      verdict = "fail";
      r.verdict = verdict;
    }
  }

  // ============================================
  // PHASE 4: Generate Combined Output
  // ============================================
  logInfo(HOOK, "=== PHASE 4: Generate Output ===");

  if (Object.keys(agentResults).length === 0) {
    if (graduatedSet.size > 0 && originalAgentCount > 0) {
      skipWithInfo("All agent reviewers graduated from previous iterations — no review needed.");
    } else {
      skipWithInfo("All reviewers failed to produce results. Check stderr logs for details.");
    }
    return;
  }

  // Review decision — corroboration-based (proportional threshold per dimension)
  // Must be computed before writeCombinedArtifacts and buildInlineReviewSummary which consume it.
  const allReviewerResults: Record<string, ReviewerResult> = agentResults;
  const corroborationResult = computeCorroboratedDecision(allReviewerResults);

  // Use corroboration verdict as single source of truth (not worstVerdict from individual agents)
  const overall = corroborationResult.verdict;

  const combinedResult: CombinedReviewResult = {
    plan_hash: planHash,
    overall_verdict: overall,
    orchestration: orchResult,
    agents: agentResults,
    timestamp: new Date().toISOString(),
  };

  const displaySettings = {
    ...(planSettings.display ?? {}),
    ...(agentSettings.display ?? {}),
  };
  const combinedSettings = { display: displaySettings };

  // Get current iteration number
  const currentIteration = iterationState.current;

  // Create review folder
  const reviewFolder = getReviewFolderPath(contextId, currentIteration, base);
  fs.mkdirSync(reviewFolder, { recursive: true });
  logInfo(HOOK, `Created review folder: ${reviewFolder}`);

  const reviewFile = writeCombinedArtifacts(
    base,
    plan,
    combinedResult,
    payload as Record<string, unknown>,
    combinedSettings,
    undefined,
    reviewFolder,
    currentIteration,
    corroborationResult,
  );
  logInfo(HOOK, `Saved review: ${reviewFile}`);

  // Write corroboration analysis report
  const corroborationReport = buildCorroborationReport(corroborationResult);
  const corroborationPath = path.join(reviewFolder, "corroboration.md");
  fs.writeFileSync(corroborationPath, corroborationReport, "utf-8");
  logInfo(HOOK, `Saved corroboration report: ${corroborationPath}`);

  // Save plan snapshot for diffing between iterations
  try {
    fs.writeFileSync(path.join(reviewFolder, "plan.md"), plan, "utf-8");
    logDebug(HOOK, `Saved plan snapshot: ${path.join(reviewFolder, "plan.md")}`);
  } catch (e) {
    logWarn(HOOK, `Failed to save plan snapshot: ${e}`);
  }

  // Build inline summary with top issues (always emitted, even on pass)
  const inlineSummary = buildInlineReviewSummary(combinedResult, 5, 800, corroborationResult);
  const topIssuesList = extractTopIssuesForTracker(combinedResult, 5);
  const contextParts = [inlineSummary];
  if (topIssuesList.length > 0) {
    contextParts.push(`\nTop high-severity issues:\n${topIssuesList.map(i => `- ${i}`).join("\n")}`);
  }
  contextParts.push(`\nFull review: \`${reviewFile}\`\n`);
  const shouldDeny = corroborationResult.blocking.length > 0;
  const denyReason = shouldDeny ? "corroborated_issues" : "no_corroboration";
  const reviewScore = shouldDeny ? 1.0 : 0.0;

  logInfo(HOOK, `REVIEW_DECISION: verdict=${combinedResult.overall_verdict}, deny=${shouldDeny}, reason=${denyReason}, score=${reviewScore.toFixed(2)}`);
  logDiagnostic(HOOK, "result", `verdict=${combinedResult.overall_verdict}, deny=${shouldDeny}, reason=${denyReason}`, {
    decision: shouldDeny ? "deny" : "allow",
    reasoning: `reason=${denyReason}, score=${reviewScore.toFixed(2)}`,
    inputs: {
      overall_verdict: combinedResult.overall_verdict,
      review_score: Math.round(reviewScore * 100) / 100,
      agent_count: Object.keys(agentResults).length,
    },
  });

  // Terminal progress
  const verdictEmoji = shouldDeny ? "❌" : "✅";
  eprint(`[plan-review] ${verdictEmoji} ${combinedResult.overall_verdict.toUpperCase()} (score=${reviewScore.toFixed(2)})`);
  if (shouldDeny) {
    eprint(`[plan-review] Blocking ExitPlanMode — ${denyReason}`);
  }

  // Iteration logic:
  // - On PASS/WARRANT: set current past max so no more reviews happen
  // - On DENY (fail/warn): increment current toward max (safety valve)
  // - Max iterations (high=5, medium=3, simple=1) caps total reviews before auto-allow
  if (reviewsDir) {
    iterationState.history.push({ hash: planHash, verdict: overall, timestamp: new Date().toISOString() });
    iterationState.lastPlanHash = planHash;

    if (!shouldDeny) {
      // Pass/warrant: stop iterating — set current past max
      iterationState.current = iterationState.max + 1;
      logInfo(HOOK, `Pass/warrant: stopping iterations`);
    } else {
      // Deny: advance iteration counter toward max so safety valve triggers
      iterationState.current += 1;
      logInfo(HOOK, `Deny: advancing iteration (${iterationState.current}/${iterationState.max})`);
    }

    // Update pass streaks — only for agents that actually ran this iteration
    const passStreaks = { ...(iterationState.passStreaks ?? {}) };
    const passEligibleSet = new Set(passEligible);
    const graduatedSetCurrent = new Set(iterationState.graduated);

    for (const name of Object.keys(agentResults)) {
      if (graduatedSetCurrent.has(name)) continue;
      if (passEligibleSet.has(name)) {
        passStreaks[name] = (passStreaks[name] ?? 0) + 1;
      } else {
        passStreaks[name] = 0;
      }
    }
    iterationState.passStreaks = passStreaks;

    // Graduate agents that reached threshold
    const GRADUATION_THRESHOLD = 2;
    const newGrads: string[] = [];
    for (const [name, streak] of Object.entries(passStreaks)) {
      if (streak >= GRADUATION_THRESHOLD && !graduatedSetCurrent.has(name)) {
        newGrads.push(name);
      }
    }
    if (newGrads.length > 0) {
      iterationState.graduated = [...iterationState.graduated, ...newGrads];
      logInfo(HOOK, `Newly graduated (${GRADUATION_THRESHOLD} consecutive passes): ${newGrads.join(", ")}`);
    }

    saveIterationState(reviewsDir, iterationState);
  }

  // Write review tracker (human-readable lifecycle summary)
  const ccNativeReviewsDir = path.dirname(reviewFolder);
  const trackerDecision = shouldDeny ? "blocked" : "allow";
  const trackerEntry: ReviewTrackerEntry = {
    iteration: currentIteration,
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 16),
    planHash,
    verdict: combinedResult.overall_verdict,
    decision: trackerDecision,
    score: reviewScore,
    topIssues: topIssuesList,
    reviewFolder,
  };
  writeReviewTracker(ccNativeReviewsDir, trackerEntry);
  logInfo(HOOK, `Updated review tracker: ${path.join(ccNativeReviewsDir, "review-tracker.md")}`);

  // ALL first-time reviews block ExitPlanMode and inject feedback
  // Verdict controls iteration logic and next-run skip decision only
  const contextText = contextParts.join("");

  logDebug(HOOK, `REVIEW_CONTEXT_INJECTED: chars=${contextText.length}, inline_chars=${inlineSummary.length}`);

  const REVIEWER_CAVEAT = "Reviewers have limited context compared to your full session — use your judgment to adopt valid points and dismiss genuine false positives. However, treat false positives as a clarity signal: if a reviewer misunderstood your plan, an agent executing it will likely hit the same confusion. Revise those sections to be unambiguous so no future reader — human or AI — makes the same mistake.";
  const RESUBMIT_INSTRUCTION = "IMPORTANT: After revising the plan file, you MUST call ExitPlanMode again to trigger re-review. Do not end your turn or ask the user without calling ExitPlanMode.";

  const iterInfo = ` (iteration ${iterationState.current - 1}/${iterationState.max}, score=${reviewScore.toFixed(2)})`;

  if (shouldDeny) {
    // FAIL verdict - critical issues found
    const disposition = `hook_deny_iter_${iterationState.current - 1}`;
    markPlanReviewed(sessionId, planHash, base, HOOK, iterationState, disposition);
    const topIssuesText = extractTopIssuesText(combinedResult, 3, "high");
    const highIssuesDoc = buildHighIssuesDocument(combinedResult, corroborationResult);
    const highIssuesPath = path.join(reviewFolder, "high-issues.md");
    fs.writeFileSync(highIssuesPath, highIssuesDoc, "utf-8");

    const blockReason = `Plan review FAILED${iterInfo}. ` +
      `Critical issues: ${topIssuesText}. ` +
      `IMPORTANT: Read \`${highIssuesPath}\` for ALL high-severity issues — ` +
      `this file contains only the most critical findings, no noise. ` +
      `${REVIEWER_CAVEAT} ` +
      `Revise the plan to address these issues, then call ExitPlanMode again. ` +
      RESUBMIT_INSTRUCTION;

    emitContextAndBlock(contextText, blockReason);
  } else {
    // PASS or WARN verdict - block to inject feedback, but mark as allowed
    const disposition = `hook_allow_iter_${iterationState.current - 1}`;
    markPlanReviewed(sessionId, planHash, base, HOOK, iterationState, disposition);

    const blockReason = `Plan review ${overall.toUpperCase()}${iterInfo}. Review complete. ${REVIEWER_CAVEAT}`;

    emitContextAndBlock(contextText, blockReason);
  }
}

runHookAsync(main, "cc_native_plan_review");
