/**
 * Review pipeline: orchestrates the full plan review lifecycle.
 * Wires together plan-discovery, settings, agent-selection, graduation,
 * output-builder, and existing modules (orchestrator, corroboration, etc.).
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { resolveMandatoryAgents, assignModelsToAgents, selectAgents } from "./agent-selection.js";
import { runPreflight } from "./preflight.js";
import { computeCorroboratedDecision } from "./corroboration.js";
import { computePassEligible, extractTopIssuesForTracker, advanceIterationState } from "./graduation.js";
import { runOrchestrator } from "./orchestrator.js";
import { truncateAgentIssues, overrideVerdictsByThreshold, buildReviewOutput } from "./output-builder.js";
import { runPlanQuestions } from "./plan-questions.js";
import { runAgentReview } from "./reviewers/index.js";
import { getContextReviewsDir, getContextDir, getReviewFolderPath } from "../../../_core/lib-ts/runtime/constants.js";
import { logDiagnostic } from "../../../_core/lib-ts/hooks/hook-utils.js";
import {
  logDebug,
  logInfo,
  logWarn,
  logError,
} from "../../../_core/lib-ts/runtime/logger.js";
import { eprint } from "../../../_core/lib-ts/runtime/utils.js";
import { getContextBySessionId, getAllContexts } from "../../../_core/lib-ts/context/context-store.js";
import type { ContextState } from "../../../_core/lib-ts/types.js";
import { writeCombinedArtifacts, buildCorroborationReport, buildHighIssuesDocument, writeReviewTracker } from "../../artifacts/lib/index.js";
import type { ReviewTrackerEntry } from "../../artifacts/lib/index.js";
import {
  isPlanAlreadyReviewed,
  wasPlanPreviouslyDenied,
  getLastPlanReview,
  markPlanReviewed,
  wasPlanQuestionsAgentAsked,
  markQuestionsAsked,
  resetPlanQuestionsAsked,
} from "../../lib-ts/cc-native-state.js";
import { debugLog } from "../../lib-ts/debug.js";
import { discoverPlan } from "../../lib-ts/plan-discovery.js";
import { loadSettings, loadModelsConfig, loadAgentLibrary, DEFAULT_ORCHESTRATOR } from "../../lib-ts/settings.js";
import { DEFAULT_REVIEW_ITERATIONS, loadIterationState, saveIterationState } from "../../lib-ts/state.js";
import type {
  AgentConfig,
  AgentReviewSettings,
  LoadedSettings,
  OrchestratorConfig,
  PlanReviewSettings,
  ReviewerResult,
  CombinedReviewResult,
  OrchestratorResult,
  IterationState,
  PipelineInput,
  PipelineResult,
} from "../../lib-ts/types.js";
import { REVIEW_SCHEMA } from "../../lib-ts/types.js";

const HOOK = "review-pipeline";

// ---------------------------------------------------------------------------
// Context Lookup (private — only used here)
// ---------------------------------------------------------------------------

function getActiveContextForReview(sessionId: string, projectRoot: string): ContextState | null {
  const ctx = getContextBySessionId(sessionId, projectRoot);
  if (ctx) {
    logInfo(HOOK, `Found context by session_id: ${ctx.id}`);
    return ctx;
  }
  const allActive = getAllContexts("active", projectRoot);
  const planning = allActive.filter(c => c.mode === "active" || c.mode === "has_staged_work");
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
// Pipeline
// ---------------------------------------------------------------------------

export async function runReviewPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { sessionId, base, aiwcliDir, transcriptPath, payload } = input;

  // 1. Load settings
  const settings: LoadedSettings = loadSettings(aiwcliDir);
  const planSettings: PlanReviewSettings = settings.planReview;
  const agentSettings: AgentReviewSettings = settings.agentReview;

  const planReviewEnabled = planSettings.enabled ?? true;
  const agentReviewEnabled = agentSettings.enabled ?? true;

  if (!planReviewEnabled && !agentReviewEnabled) {
    return { action: "skip", reason: "Both plan and agent review disabled" };
  }

  // 2. Discover plan
  const discovered = discoverPlan(transcriptPath);
  if (!discovered) {
    return { action: "skip", reason: "No plan file found in ~/.claude/plans/. The plan may not have been written yet." };
  }

  const { content: plan, hash: planHash, path: planPath } = discovered;

  // 3. Find active context (moved before questions gate for plan path change detection)
  const activeContext = getActiveContextForReview(sessionId, base);
  if (!activeContext) {
    return { action: "skip", reason: "No active planning context found for this session." };
  }

  const contextId = activeContext.id;
  const reviewsDir = path.join(getContextReviewsDir(contextId, base), "cc-native");
  const contextPath = getContextDir(contextId, base);

  // 4a. Load iteration state
  let iterationState: IterationState | null = loadIterationState(reviewsDir);

  // 4a-migration. Backfill sessionId for old iteration files
  if (iterationState && !iterationState.sessionId) {
    logInfo(HOOK, `Migrating iteration state: adding sessionId=${sessionId}`);
    iterationState.sessionId = sessionId;
    saveIterationState(reviewsDir, iterationState);  // Persist migration
  }

  // 4a-session. Detect session change — reset iteration state for new planning session
  if (iterationState && iterationState.sessionId && iterationState.sessionId !== sessionId) {
    logInfo(HOOK, `Session changed (${iterationState.sessionId} → ${sessionId}), resetting iteration state`);
    iterationState = null;  // Force fresh state creation below
  }

  // 4a-init. Initialize if null
  if (!iterationState) {
    iterationState = {
      current: 1, max: 1, complexity: "medium",
      history: [], graduated: [], passStreaks: {},
      lastPlanHash: "", lastPlanPath: "",
      sessionId,
    };
    saveIterationState(reviewsDir, iterationState);
  }

  // 4b. Detect plan file change — reset iteration state for new plan topic
  const lastPath = iterationState.lastPlanPath ?? "";
  if (lastPath && lastPath !== planPath) {
    logInfo(HOOK, `Plan file changed (${path.basename(lastPath)}→${path.basename(planPath)}), resetting iteration state for new plan`);
    iterationState = {
      current: 1, max: 1, complexity: "medium",
      history: [], graduated: [], passStreaks: {},
      lastPlanHash: "", lastPlanPath: "",
      sessionId,
    };
    saveIterationState(reviewsDir, iterationState);
    resetPlanQuestionsAsked(sessionId, base);
  }

  // 5. Questions gate
  if (!wasPlanQuestionsAgentAsked(sessionId, base)) {
    logInfo(HOOK, "Questions gate: plan-questions agent has not run yet, running now");
    const questionsTimeout = agentSettings.timeout ?? 120;
    const questionsResult = await runPlanQuestions(plan, aiwcliDir, questionsTimeout, undefined, sessionId);

    markQuestionsAsked(sessionId, base, "agent");

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
      return {
        action: "block",
        contextText: contextMsg,
        blockReason: "Ask the user clarifying questions before submitting the plan. Use AskUserQuestion with the questions above.",
      };
    }

    logInfo(HOOK, "Questions gate: no questions generated, proceeding to review");
  } else {
    logInfo(HOOK, "Questions gate: agent already ran, skipping");
  }

  // 6. Hash + dedup
  logDiagnostic(HOOK, "receive", `plan_size=${plan.length}, session=${sessionId.slice(0, 8)}`, {
    inputs: { plan_hash: planHash, plan_size: plan.length, session_id: sessionId.slice(0, 12) },
  });

  // Plan-hash deduplication
  logDebug(HOOK, `Plan hash: ${planHash}`);
  if (isPlanAlreadyReviewed(sessionId, planHash, base)) {
    const lastReview = getLastPlanReview(sessionId, planHash, base);

    if (wasPlanPreviouslyDenied(sessionId, planHash, base)) {
      return {
        action: "block",
        contextText: "[Plan Review] Plan content unchanged since last review which found issues.",
        blockReason: "Plan unchanged since denial. Modify the plan to address review findings, then attempt ExitPlanMode again.",
      };
    } 
      const verdict = lastReview?.iteration?.latest_verdict || "pass";
      return { action: "skip", reason: `Plan already reviewed (verdict: ${verdict}). Skipping re-review.` };
    
  }

  // 7. Iteration bounds check
  if (iterationState.current > iterationState.max) {
    return { action: "skip", reason: `Max review iterations reached (${iterationState.current - 1}/${iterationState.max}), allowing plan through.` };
  }

  // Initialize result containers
  let orchResult: OrchestratorResult | null = null;
  const agentResults: Record<string, ReviewerResult> = {};
  let detectedComplexity = "medium";

  // Preflight: validate provider+model combos before committing agents or orchestrator
  const preflightEnabled = agentSettings.preflight?.enabled ?? true;
  let preflightAvailable: Map<string, Set<string>> | undefined;

  if (preflightEnabled && agentReviewEnabled) {
    logInfo(HOOK, "=== PREFLIGHT: Checking provider availability ===");
    const preflightTimeoutMs = agentSettings.preflight?.timeoutMs;
    const modelsConfig = loadModelsConfig(settings);
    const preflightReport = await runPreflight(modelsConfig, preflightTimeoutMs);

    if (preflightReport.allFailed) {
      logWarn(HOOK, "All providers failed preflight checks");
      // Preflight failures skip review rather than block because an unavailable
      // reviewer is worse than no reviewer. A permanently broken config will
      // silently pass all plans — mitigated by the log warnings above.
      eprint("[plan-review] All AI providers unavailable. Skipping review.");
      return { action: "skip", reason: "No AI providers passed preflight. Check CLI, API keys, model access, and quota." };
    }

    preflightAvailable = preflightReport.available;
  }

  // 7. PHASE 1: Orchestrator
  const graduatedSet = new Set(iterationState.graduated);
  if (graduatedSet.size > 0) {
    logInfo(HOOK, `Graduated agents from previous iterations: ${[...graduatedSet].sort().join(", ")}`);
  }

  const agentLibrary = agentReviewEnabled ? loadAgentLibrary(aiwcliDir, agentSettings) : [];
  const originalAgentCount = agentLibrary.length;
  const enabledAgents = agentLibrary.filter(a => !graduatedSet.has(a.name));
  const timeout = agentSettings.timeout ?? 120;
  const legacyMode = agentSettings.legacyMode === true;

  const orchSettings = agentSettings.orchestrator ?? DEFAULT_ORCHESTRATOR;
  const orchestratorConfig: OrchestratorConfig = {
    enabled: (orchSettings.enabled ?? true) && agentReviewEnabled,
    model: orchSettings.model ?? "haiku",
    provider: orchSettings.provider,
    timeout: orchSettings.timeout ?? 30,
  };

  const mandatoryConfig = agentSettings.mandatoryAgents ?? ["handoff-readiness", "clarity-auditor", "skeptic"];
  const alwaysMandatory = resolveMandatoryAgents(mandatoryConfig, "simple");

  logDebug(HOOK, `Agent library: ${agentLibrary.map(a => a.name)}`);
  logDebug(HOOK, `Mandatory agents: ${[...alwaysMandatory].sort()}`);
  logDebug(HOOK, `Orchestrator enabled: ${orchestratorConfig.enabled}`);

  const phase1Promises: Array<{ name: string; promise: Promise<ReviewerResult | OrchestratorResult> }> = [];

  if (orchestratorConfig.enabled && enabledAgents.length > 0 && !legacyMode) {
    // Guard orchestrator against preflight failures (always uses claude provider)
    const orchProvider = orchestratorConfig.provider ?? "claude";
    const orchModel = orchestratorConfig.model;
    const orchPassed = !preflightAvailable ||
      (preflightAvailable.has(orchProvider) && preflightAvailable.get(orchProvider)!.has(orchModel));

    if (!orchPassed) {
      logWarn(HOOK, `Orchestrator model ${orchProvider}:${orchModel} failed preflight, skipping`);
    } else {
      phase1Promises.push({
        name: "orchestrator",
        promise: runOrchestrator(plan, enabledAgents, orchestratorConfig, agentSettings, alwaysMandatory),
      });
    }
  }

  logInfo(HOOK, `=== PHASE 1: Running ${phase1Promises.length} tasks in parallel ===`);

  if (phase1Promises.length > 0) {
    const results = await Promise.allSettled(
      phase1Promises.map(async ({ name, promise }) => {
        const result = await promise;
        return { name, result };
      }),
    );
    for (const [i, r] of results.entries()) {
      if (r.status === "fulfilled") {
        if (r.value.name === "orchestrator") orchResult = r.value.result as OrchestratorResult;
        logInfo(HOOK, `${r.value.name} completed`);
      } else {
        const failedName = phase1Promises[i]?.name ?? "unknown";
        logError(HOOK, `${failedName} failed: ${r.reason}`);
      }
    }
  }

  // 8. PHASE 2: Agent Selection
  let selectedAgents: AgentConfig[] = [];
  let mandatoryNames = alwaysMandatory;

  if (agentReviewEnabled) {
    logInfo(HOOK, "=== PHASE 2: Agent Selection ===");

    const selectionResult = selectAgents({
      enabledAgents,
      orchResult,
      mandatoryConfig,
      agentSettings,
      legacyMode,
    });

    selectedAgents = selectionResult.selectedAgents;
    mandatoryNames = selectionResult.mandatoryNames;
    detectedComplexity = selectionResult.detectedComplexity;

    logDiagnostic(HOOK, "decide", `Selected ${selectedAgents.length} agents, complexity=${detectedComplexity}`, {
      decision: "agents_selected",
      reasoning: `orchestrator=${orchResult !== null}, legacy=${legacyMode}`,
      inputs: {
        agents: selectedAgents.map(a => a.name),
        complexity: detectedComplexity,
        mandatory_count: selectedAgents.filter(a => mandatoryNames.has(a.name)).length,
      },
    });

    // Update iteration state with complexity/max
    const reviewIterations: Record<string, number> = {
      ...DEFAULT_REVIEW_ITERATIONS,
      ...agentSettings.reviewIterations,
    };
    iterationState.complexity = detectedComplexity;
    iterationState.max = reviewIterations[detectedComplexity] ?? iterationState.max;
    logDebug(HOOK, `Iteration state: ${iterationState.current}/${iterationState.max} (${detectedComplexity})`);

    // Assign providers + models (filtered by preflight results if available)
    const modelsConfig = loadModelsConfig(settings);
    selectedAgents = assignModelsToAgents(selectedAgents, modelsConfig, preflightAvailable);
    logInfo(HOOK, `Model assignments: ${selectedAgents.map(a => `${a.name}→${a.provider}:${a.model}`).join(", ")}`);

    // 9. PHASE 3: Run agents
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

  // 10. Issue truncation + verdict override
  const maxIssuesPerAgent = agentSettings.maxIssuesPerAgent ?? 3;
  truncateAgentIssues(agentResults, maxIssuesPerAgent);

  const passEligible = computePassEligible(agentResults);
  if (passEligible.length > 0) {
    logInfo(HOOK, `Pass-eligible agents this iteration: ${passEligible.join(", ")}`);
  }

  const highIssueThreshold = agentSettings.highIssueThreshold ?? 3;
  overrideVerdictsByThreshold(agentResults, highIssueThreshold);

  // PHASE 4: Generate Output
  logInfo(HOOK, "=== PHASE 4: Generate Output ===");

  if (Object.keys(agentResults).length === 0) {
    if (graduatedSet.size > 0 && originalAgentCount > 0) {
      return { action: "skip", reason: "All agent reviewers graduated from previous iterations — no review needed." };
    }
    return { action: "skip", reason: "All reviewers failed to produce results. Check stderr logs for details." };
  }

  // 11. Corroboration
  const corroborationResult = computeCorroboratedDecision(agentResults);
  const overall = corroborationResult.verdict;

  const combinedResult: CombinedReviewResult = {
    plan_hash: planHash,
    overall_verdict: overall,
    orchestration: orchResult,
    agents: agentResults,
    timestamp: new Date().toISOString(),
  };

  const displaySettings = {
    ...planSettings.display,
    ...agentSettings.display,
  };
  const combinedSettings = { display: displaySettings };

  const currentIteration = iterationState.current;

  // 12. Write artifacts
  const reviewFolder = getReviewFolderPath(contextId, currentIteration, base);
  fs.mkdirSync(reviewFolder, { recursive: true });
  logInfo(HOOK, `Created review folder: ${reviewFolder}`);

  const reviewFile = writeCombinedArtifacts(
    base, plan, combinedResult, payload, combinedSettings,
    undefined, reviewFolder, currentIteration, corroborationResult,
  );
  logInfo(HOOK, `Saved review: ${reviewFile}`);

  const corroborationReport = buildCorroborationReport(corroborationResult);
  const corroborationPath = path.join(reviewFolder, "corroboration.md");
  fs.writeFileSync(corroborationPath, corroborationReport, "utf-8");
  logInfo(HOOK, `Saved corroboration report: ${corroborationPath}`);

  try {
    fs.writeFileSync(path.join(reviewFolder, "plan.md"), plan, "utf-8");
    logDebug(HOOK, `Saved plan snapshot: ${path.join(reviewFolder, "plan.md")}`);
  } catch (error) {
    logWarn(HOOK, `Failed to save plan snapshot: ${error}`);
  }

  // Build high-issues document
  const highIssuesDoc = buildHighIssuesDocument(combinedResult, corroborationResult);
  const highIssuesPath = path.join(reviewFolder, "high-issues.md");
  fs.writeFileSync(highIssuesPath, highIssuesDoc, "utf-8");

  // 15. Build output
  const shouldDeny = corroborationResult.blocking.length > 0;
  const reviewScore = shouldDeny ? 1 : 0;
  const denyReason = shouldDeny ? "corroborated_issues" : "no_corroboration";

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

  // 13. Advance iteration
  const advancement = advanceIterationState(
    iterationState, planHash, planPath, overall, shouldDeny, passEligible, agentResults,
  );
  iterationState = advancement.updatedState;
  if (advancement.newGraduates.length > 0) {
    logInfo(HOOK, `Newly graduated (2 consecutive passes): ${advancement.newGraduates.join(", ")}`);
  }

  // 14. Save iteration state
  saveIterationState(reviewsDir, iterationState);

  // Write review tracker
  const ccNativeReviewsDir = path.dirname(reviewFolder);
  const trackerDecision = shouldDeny ? "blocked" : "allow";
  const topIssuesList = extractTopIssuesForTracker(combinedResult, 5);
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

  // Build final output
  const output = buildReviewOutput({
    combinedResult,
    corroborationResult,
    iterationState: { ...iterationState, current: currentIteration },
    reviewFile,
    highIssuesPath,
  });

  // Mark plan reviewed
  const disposition = shouldDeny
    ? `hook_deny_iter_${currentIteration}`
    : `hook_allow_iter_${currentIteration}`;
  markPlanReviewed(sessionId, planHash, base, HOOK, { ...iterationState, current: currentIteration }, disposition);

  return {
    action: "block",
    contextText: output.contextText,
    blockReason: output.blockReason,
  };
}
