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
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getProjectRoot, getAiwcliDir, getContextReviewsDir, getContextDir, getReviewFolderPath } from "../../_shared/lib-ts/base/constants.js";
import { eprint } from "../../_shared/lib-ts/base/utils.js";
import { getContextBySessionId, getAllContexts } from "../../_shared/lib-ts/context/context-store.js";

import type {
  AgentConfig,
  OrchestratorConfig,
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
  markPlanReviewed,
} from "../lib-ts/cc-native-state.js";

import { worstVerdict, computeReviewDecision } from "../lib-ts/verdict.js";
import { loadConfig, getDisplaySettings } from "../lib-ts/config.js";
import { runOrchestrator } from "../lib-ts/orchestrator.js";
import { aggregateAgents } from "../lib-ts/aggregate-agents.js";
import { debugLog } from "../lib-ts/debug.js";
import {
  writeCombinedArtifacts,
  buildInlineReviewSummary,
  extractTopIssuesText,
  buildHighIssuesDocument,
  writeReviewTracker,
} from "../lib-ts/artifacts.js";
import type { ReviewTrackerEntry } from "../lib-ts/artifacts.js";
import { runAgentReview, runCodexReview, runGeminiReview } from "../lib-ts/reviewers/index.js";

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
  const allReviewers = [
    ...Object.values(combined.cli_reviewers),
    ...Object.values(combined.agents),
  ];
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
 * Determine which agents should graduate based on their review results.
 * Graduation criteria: verdict === "pass" OR zero high-severity issues.
 * Agents with "skip"/"error" do NOT graduate (no signal).
 */
function computeGraduated(agentResults: Record<string, ReviewerResult>): string[] {
  const graduated: string[] = [];
  for (const [name, result] of Object.entries(agentResults)) {
    if (result.verdict === "skip" || result.verdict === "error") continue;
    if (result.verdict === "pass") { graduated.push(name); continue; }
    const issues = Array.isArray(result.data?.issues)
      ? (result.data.issues as Array<{ severity?: string }>) : [];
    if (issues.filter(i => i.severity === "high").length === 0) {
      graduated.push(name);
    }
  }
  return graduated;
}

/**
 * Load the set of graduated agent names from previous iterations.
 * Returns empty set on iteration 1 (no iteration.json exists).
 */
function loadGraduatedSet(reviewsDir: string): Set<string> {
  const existing = loadIterationState(reviewsDir);
  return new Set(existing?.graduated ?? []);
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_AGENTS: Array<{ name: string; model: string; focus: string; enabled: boolean; categories: string[] }> = [
  { name: "handoff-readiness", model: "sonnet", focus: "fresh context execution readiness", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "clarity-auditor", model: "sonnet", focus: "communication clarity and execution readiness", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "skeptic", model: "sonnet", focus: "problem-solution alignment and assumption validation", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "documentation-philosophy", model: "sonnet", focus: "knowledge capture and documentation placement", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "risk-premortem", model: "sonnet", focus: "pre-mortem failure analysis", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "risk-fmea", model: "sonnet", focus: "systematic failure mode analysis", enabled: true, categories: ["code", "infrastructure", "design"] },
  { name: "risk-dependency", model: "sonnet", focus: "dependency chain and blast radius analysis", enabled: true, categories: ["code", "infrastructure"] },
  { name: "risk-reversibility", model: "sonnet", focus: "decision reversibility and optionality", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "completeness-gaps", model: "sonnet", focus: "structural gap analysis", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "completeness-feasibility", model: "sonnet", focus: "feasibility and resource analysis", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "completeness-ordering", model: "sonnet", focus: "step ordering and critical path analysis", enabled: true, categories: ["code", "infrastructure", "design"] },
  { name: "arch-structure", model: "sonnet", focus: "coupling, cohesion, and boundary analysis", enabled: true, categories: ["code", "infrastructure", "design"] },
  { name: "arch-evolution", model: "sonnet", focus: "evolutionary architecture and change amplification", enabled: true, categories: ["code", "infrastructure", "design"] },
  { name: "arch-patterns", model: "sonnet", focus: "pattern selection and technology fit", enabled: true, categories: ["code", "infrastructure"] },
  { name: "verify-coverage", model: "sonnet", focus: "verification coverage mapping", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "verify-strength", model: "sonnet", focus: "test quality and mutation analysis", enabled: true, categories: ["code", "infrastructure"] },
  { name: "tradeoff-costs", model: "sonnet", focus: "opportunity cost and capability sacrifice", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "tradeoff-stakeholders", model: "sonnet", focus: "stakeholder impact and cost-benefit asymmetry", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "scope-boundary", model: "sonnet", focus: "scope drift and boundary enforcement", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "hidden-complexity", model: "sonnet", focus: "understated complexity and hidden difficulty", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "simplicity-guardian", model: "sonnet", focus: "over-engineering and unnecessary complexity", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "devils-advocate", model: "sonnet", focus: "contrarian analysis and reductio ad absurdum", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "assumption-tracer", model: "sonnet", focus: "dependency chains and foundational assumptions", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "incremental-delivery", model: "sonnet", focus: "incremental delivery and vertical slicing", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
  { name: "constraint-validator", model: "sonnet", focus: "constraint identification and satisfaction", enabled: true, categories: ["code", "infrastructure", "documentation", "design", "research", "life", "business"] },
];

const DEFAULT_ORCHESTRATOR: { enabled: boolean; model: string; timeout: number } = { enabled: true, model: "opus", timeout: 60 };
const DEFAULT_AGENT_MODEL = "sonnet";

const DEFAULT_REVIEW_ITERATIONS: Record<string, number> = {
  simple: 1,
  medium: 2,
  high: 2,
};

const DEFAULT_AGENT_SELECTION: Record<string, unknown> = {
  simple: { min: 3, max: 3 },
  medium: { min: 8, max: 8 },
  high: { min: 12, max: 12 },
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

function getIterationStateFromContext(
  reviewsDir: string,
  complexity: string,
  config?: Record<string, unknown>,
): IterationState {
  const existing = loadIterationState(reviewsDir);
  if (existing) return existing;
  const reviewIterations: Record<string, number> = { ...DEFAULT_REVIEW_ITERATIONS };
  if (config) {
    const overrides = config.reviewIterations;
    if (overrides && typeof overrides === "object") {
      Object.assign(reviewIterations, overrides);
    }
  }
  return {
    current: 1,
    max: reviewIterations[complexity] ?? 1,
    complexity,
    history: [],
    graduated: [],
  };
}

// ---------------------------------------------------------------------------
// Settings Loading
// ---------------------------------------------------------------------------

function loadSettings(projDir: string): Record<string, any> {
  const defaults: Record<string, any> = {
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
  if (!config || Object.keys(config).length === 0) return defaults;

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

  return { planReview: mergedPlan, agentReview: mergedAgent };
}

function loadAgentLibrary(
  projDir: string,
  settings?: Record<string, any>,
): AgentConfig[] {
  const agentsData = aggregateAgents(path.join(projDir, "_cc-native", "agents"));
  const defaultModel = settings?.agentDefaults?.model ?? DEFAULT_AGENT_MODEL;

  if (!agentsData || agentsData.length === 0) {
    logInfo(HOOK, "No agents found in frontmatter, using defaults");
    return DEFAULT_AGENTS.map(a => ({
      name: a.name,
      model: a.model ?? defaultModel,
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

  // Find and read plan
  const planPath = findPlanFile();
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
    if (wasPlanPreviouslyDenied(sessionId, planHash, base)) {
      emitContextAndBlock(
        "[Plan Review] Plan content unchanged since last review which found issues.",
        "Plan unchanged since denial. Modify the plan to address review findings, then attempt ExitPlanMode again.",
      );
      return;
    } else {
      skipWithInfo("Plan already reviewed and approved (same hash).");
      return;
    }
  }

  // Early iteration check: if we've exhausted max iterations, allow plan through
  const earlyIterState = loadIterationState(reviewsDir);
  if (earlyIterState && earlyIterState.current > earlyIterState.max) {
    skipWithInfo(`Max review iterations reached (${earlyIterState.current - 1}/${earlyIterState.max}), allowing plan through.`);
    return;
  }

  // Initialize result containers
  const cliResults: Record<string, ReviewerResult> = {};
  let orchResult: OrchestratorResult | null = null;
  const agentResults: Record<string, ReviewerResult> = {};
  let allVerdicts: Verdict[] = [];
  let iterationState: IterationState | null = null;
  let detectedComplexity = "medium";

  // ============================================
  // PHASE 1 & 2: CLI Reviewers + Orchestrator (PARALLEL)
  // ============================================
  const reviewersConfig = planReviewEnabled ? (planSettings.reviewers ?? {}) : {};
  const codexEnabled = planReviewEnabled && (reviewersConfig.codex?.enabled ?? true);
  const geminiEnabled = planReviewEnabled && (reviewersConfig.gemini?.enabled ?? false);

  // Load graduated agents from previous iterations (empty on iteration 1)
  const graduatedSet = loadGraduatedSet(reviewsDir);
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

  logDebug(HOOK, `Codex enabled: ${codexEnabled}, Gemini enabled: ${geminiEnabled}`);
  logDebug(HOOK, `Agent library: ${agentLibrary.map(a => a.name)}`);
  logDebug(HOOK, `Mandatory agents: ${[...mandatoryNames].sort()}`);
  logDebug(HOOK, `Orchestrator enabled: ${orchestratorConfig.enabled}`);

  // Build phase 1 tasks as promises
  const phase1Promises: Array<{ name: string; promise: Promise<ReviewerResult | OrchestratorResult> }> = [];

  if (codexEnabled) {
    phase1Promises.push({
      name: "codex",
      promise: runCodexReview(plan, REVIEW_SCHEMA, planSettings),
    });
  }
  if (geminiEnabled) {
    phase1Promises.push({
      name: "gemini",
      promise: runGeminiReview(plan, REVIEW_SCHEMA, planSettings),
    });
  }
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

  // Collect CLI results
  if (phase1Results.codex) cliResults.codex = phase1Results.codex as ReviewerResult;
  if (phase1Results.gemini) cliResults.gemini = phase1Results.gemini as ReviewerResult;
  if (phase1Results.orchestrator) orchResult = phase1Results.orchestrator as OrchestratorResult;

  // ============================================
  // PHASE 2: Agent Selection
  // ============================================
  if (agentReviewEnabled) {
    logInfo(HOOK, "=== PHASE 2: Agent Selection ===");

    let selectedAgents: AgentConfig[] = [];
    const fallbackByComplexity = agentSettings.fallbackByComplexity ?? { simple: 0, medium: 5, high: 9 };

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

    // Initialize iteration state
    if (reviewsDir) {
      iterationState = getIterationStateFromContext(reviewsDir, detectedComplexity, agentSettings);
      logDebug(HOOK, `Iteration state: ${iterationState.current}/${iterationState.max} (${detectedComplexity})`);
    }

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
  // Persist newly graduated agents (before verdict overrides)
  // ============================================
  const newlyGraduated = computeGraduated(agentResults);
  if (newlyGraduated.length > 0) {
    logInfo(HOOK, `Newly graduated agents: ${newlyGraduated.join(", ")}`);
  }

  // ============================================
  // Per-agent high-severity threshold: override verdict to "fail"
  // ============================================
  const highIssueThreshold = typeof agentSettings.highIssueThreshold === "number" ? agentSettings.highIssueThreshold : 3;
  allVerdicts = [];

  for (const r of [...Object.values(cliResults), ...Object.values(agentResults)]) {
    if (!r.verdict || r.verdict === "skip" || r.verdict === "error") continue;
    const issues = Array.isArray(r.data?.issues) ? r.data.issues as Array<{ severity?: string }> : [];
    const agentHigh = issues.filter(i => i.severity === "high").length;
    let verdict = r.verdict;
    if (agentHigh >= highIssueThreshold) {
      logInfo(HOOK, `${r.name}: verdict overridden to 'fail' (${agentHigh} high issues >= ${highIssueThreshold})`);
      verdict = "fail";
      r.verdict = verdict;
    }
    allVerdicts.push(verdict);
  }

  // ============================================
  // PHASE 4: Generate Combined Output
  // ============================================
  logInfo(HOOK, "=== PHASE 4: Generate Output ===");

  if (Object.keys(cliResults).length === 0 && Object.keys(agentResults).length === 0) {
    if (graduatedSet.size > 0 && originalAgentCount > 0) {
      skipWithInfo("All agent reviewers graduated from previous iterations — no review needed.");
    } else {
      skipWithInfo("All reviewers failed to produce results. Check stderr logs for details.");
    }
    return;
  }

  const overall = allVerdicts.length > 0 ? worstVerdict(allVerdicts) : "pass";

  const combinedResult: CombinedReviewResult = {
    plan_hash: planHash,
    overall_verdict: overall,
    cli_reviewers: cliResults,
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
  const currentIteration = iterationState?.current ?? 1;

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
  );
  logInfo(HOOK, `Saved review: ${reviewFile}`);

  // Save plan snapshot for diffing between iterations
  try {
    fs.writeFileSync(path.join(reviewFolder, "plan.md"), plan, "utf-8");
    logDebug(HOOK, `Saved plan snapshot: ${path.join(reviewFolder, "plan.md")}`);
  } catch (e) {
    logWarn(HOOK, `Failed to save plan snapshot: ${e}`);
  }

  // Build inline summary with top issues (always emitted, even on pass)
  const inlineSummary = buildInlineReviewSummary(combinedResult);
  const topIssuesList = extractTopIssuesForTracker(combinedResult, 5);
  const contextParts = [inlineSummary];
  if (topIssuesList.length > 0) {
    contextParts.push(`\nTop high-severity issues:\n${topIssuesList.map(i => `- ${i}`).join("\n")}`);
  }
  contextParts.push(`\nFull review: \`${reviewFile}\`\n`);

  // Review decision
  const { should_deny: shouldDeny, reason: denyReason, score: reviewScore } = computeReviewDecision(allVerdicts);

  logInfo(HOOK, `REVIEW_DECISION: verdict=${combinedResult.overall_verdict}, deny=${shouldDeny}, reason=${denyReason}, score=${reviewScore.toFixed(2)}`);
  logDiagnostic(HOOK, "result", `verdict=${combinedResult.overall_verdict}, deny=${shouldDeny}, reason=${denyReason}`, {
    decision: shouldDeny ? "deny" : "allow",
    reasoning: `reason=${denyReason}, score=${reviewScore.toFixed(2)}`,
    inputs: {
      overall_verdict: combinedResult.overall_verdict,
      review_score: Math.round(reviewScore * 100) / 100,
      cli_count: Object.keys(cliResults).length,
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
  // - On FAIL at max: extend max by 1 (grant one more revision chance)
  // - On WARN: block but do NOT extend max (warns don't earn extra iterations)
  // - On PASS: jump current to max so next call triggers early exit (no more reviews)
  const isFail = overall === "fail";
  if (iterationState && reviewsDir) {
    iterationState.history.push({ hash: planHash, verdict: overall, timestamp: new Date().toISOString() });

    if (isFail && iterationState.current >= iterationState.max) {
      iterationState.max += 1;
      logInfo(HOOK, `Extending max iterations to ${iterationState.max} due to fail at boundary (${iterationState.current}/${iterationState.max})`);
    }

    if (!shouldDeny) {
      // Pass: set current to max so next call (current+1 > max) triggers early exit
      iterationState.current = iterationState.max;
      logInfo(HOOK, `Pass: setting current to max (${iterationState.max}) to exhaust iterations`);
    }

    // Merge newly graduated agents into persistent state
    if (newlyGraduated.length > 0) {
      const allGraduated = new Set([
        ...(iterationState.graduated ?? []),
        ...newlyGraduated,
      ]);
      iterationState.graduated = [...allGraduated];
    }

    iterationState.current += 1;
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
    topIssues: extractTopIssuesForTracker(combinedResult, 5),
    reviewFolder,
  };
  writeReviewTracker(ccNativeReviewsDir, trackerEntry);
  logInfo(HOOK, `Updated review tracker: ${path.join(ccNativeReviewsDir, "review-tracker.md")}`);

  // Emit output — always emit context with top issues + link; block only on fail
  const contextText = contextParts.join("");

  logDebug(HOOK, `REVIEW_CONTEXT_INJECTED: chars=${contextText.length}, inline_chars=${inlineSummary.length}`);

  const REVIEWER_CAVEAT = "Reviewers have limited context compared to your full session — use your judgment to adopt valid points and dismiss genuine false positives. However, treat false positives as a clarity signal: if a reviewer misunderstood your plan, an agent executing it will likely hit the same confusion. Revise those sections to be unambiguous so no future reader — human or AI — makes the same mistake.";
  const RESUBMIT_INSTRUCTION = "IMPORTANT: After revising the plan file, you MUST call ExitPlanMode again to trigger re-review. Do not end your turn or ask the user without calling ExitPlanMode.";

  if (shouldDeny) {
    const disposition = iterationState
      ? `hook_deny_iter_${iterationState.current - 1}`
      : "hook_deny";
    markPlanReviewed(sessionId, planHash, base, HOOK, iterationState ?? undefined, disposition);
    const topIssuesText = extractTopIssuesText(combinedResult, 3, "high");
    const highIssuesDoc = buildHighIssuesDocument(combinedResult);
    const highIssuesPath = path.join(reviewFolder, "high-issues.md");
    fs.writeFileSync(highIssuesPath, highIssuesDoc, "utf-8");

    const iterInfo = iterationState
      ? ` (iteration ${iterationState.current - 1}/${iterationState.max}, score=${reviewScore.toFixed(2)})`
      : ` (score=${reviewScore.toFixed(2)})`;

    emitContextAndBlock(
      contextText,
      `Plan review FAILED${iterInfo}. ` +
      `Critical issues: ${topIssuesText}. ` +
      `IMPORTANT: Read \`${highIssuesPath}\` for ALL high-severity issues — ` +
      `this file contains only the most critical findings, no noise. ` +
      `${REVIEWER_CAVEAT} ` +
      `Revise the plan to address these issues, then call ExitPlanMode again. ` +
      RESUBMIT_INSTRUCTION,
    );
  } else {
    markPlanReviewed(sessionId, planHash, base, HOOK, iterationState ?? undefined, "allow");
    emitContext(contextText);
  }
}

runHookAsync(main, "cc_native_plan_review");
