/**
 * Output construction: issue truncation, verdict override, message building.
 * Extracted from cc-native-plan-review.ts.
 */

import { logInfo } from "../../_shared/lib-ts/base/logger.js";

import type {
  ReviewerResult,
  CombinedReviewResult,
  CorroborationResult,
  IterationState,
} from "./types.js";
import {
  buildInlineReviewSummary,
  extractTopIssuesText,
} from "./artifacts/format.js";
import { extractTopIssuesForTracker } from "./graduation.js";

const HOOK = "output-builder";

const REVIEWER_CAVEAT = "Reviewers have limited context compared to your full session — use your judgment to adopt valid points and dismiss genuine false positives. However, treat false positives as a clarity signal: if a reviewer misunderstood your plan, an agent executing it will likely hit the same confusion. Revise those sections to be unambiguous so no future reader — human or AI — makes the same mistake.";
const RESUBMIT_INSTRUCTION = "IMPORTANT: After revising the plan file, you MUST call ExitPlanMode again to trigger re-review. Do not end your turn or ask the user without calling ExitPlanMode.";

// ---------------------------------------------------------------------------
// Issue Truncation
// ---------------------------------------------------------------------------

/**
 * Truncate per-agent issues to top N by severity.
 * @mutates agentResults[name].data.issues in place.
 */
export function truncateAgentIssues(
  agentResults: Record<string, ReviewerResult>,
  maxPerAgent: number,
): void {
  for (const r of Object.values(agentResults)) {
    if (!Array.isArray(r.data?.issues)) continue;
    const issues = r.data.issues as Array<{ severity?: string }>;
    if (issues.length <= maxPerAgent) continue;
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    issues.sort((a, b) => (severityOrder[a.severity ?? "low"] ?? 2) - (severityOrder[b.severity ?? "low"] ?? 2));
    const originalCount = issues.length;
    r.data.issues = issues.slice(0, maxPerAgent);
    logInfo(HOOK, `${r.name}: truncated issues ${originalCount} → ${maxPerAgent}`);
  }
}

// ---------------------------------------------------------------------------
// Verdict Override
// ---------------------------------------------------------------------------

/**
 * Override verdict to "fail" for agents exceeding high-issue threshold.
 * @mutates agentResults[name].verdict in place.
 */
export function overrideVerdictsByThreshold(
  agentResults: Record<string, ReviewerResult>,
  threshold: number,
): void {
  for (const r of Object.values(agentResults)) {
    if (!r.verdict || r.verdict === "skip" || r.verdict === "error") continue;
    const issues = Array.isArray(r.data?.issues) ? r.data.issues as Array<{ severity?: string }> : [];
    const agentHigh = issues.filter(i => i.severity === "high").length;
    if (agentHigh >= threshold) {
      logInfo(HOOK, `${r.name}: verdict overridden to 'fail' (${agentHigh} high issues >= ${threshold})`);
      r.verdict = "fail";
    }
  }
}

// ---------------------------------------------------------------------------
// Output Building
// ---------------------------------------------------------------------------

export interface ReviewOutputParams {
  combinedResult: CombinedReviewResult;
  corroborationResult: CorroborationResult;
  iterationState: IterationState;
  reviewFile: string;
  highIssuesPath: string;
}

export interface ReviewOutput {
  contextText: string;
  blockReason: string;
  shouldDeny: boolean;
}

/**
 * Build the final review output: context text and block reason.
 */
export function buildReviewOutput(params: ReviewOutputParams): ReviewOutput {
  const { combinedResult, corroborationResult, iterationState } = params;

  const shouldDeny = corroborationResult.blocking.length > 0;
  const reviewScore = shouldDeny ? 1.0 : 0.0;
  const overall = corroborationResult.verdict;

  // Build inline summary
  const inlineSummary = buildInlineReviewSummary(combinedResult, 5, 800, corroborationResult);
  const contextParts = [inlineSummary];

  // Top issues
  const topIssuesList = extractTopIssuesForTracker(combinedResult, 5);
  if (topIssuesList.length > 0) {
    contextParts.push(`\nTop high-severity issues:\n${topIssuesList.map(i => `- ${i}`).join("\n")}`);
  }
  contextParts.push(`\nFull review: \`${params.reviewFile}\`\n`);

  const contextText = contextParts.join("");
  const iterInfo = ` (iteration ${iterationState.current}/${iterationState.max}, score=${reviewScore.toFixed(2)})`;

  let blockReason: string;
  if (shouldDeny) {
    const topIssuesText = extractTopIssuesText(combinedResult, 3, "high");
    blockReason = `Plan review FAILED${iterInfo}. ` +
      `Critical issues: ${topIssuesText}. ` +
      `IMPORTANT: Read \`${params.highIssuesPath}\` for ALL high-severity issues — ` +
      `this file contains only the most critical findings, no noise. ` +
      `${REVIEWER_CAVEAT} ` +
      `Revise the plan to address these issues, then call ExitPlanMode again. ` +
      RESUBMIT_INSTRUCTION;
  } else {
    blockReason = `Plan review ${overall.toUpperCase()}${iterInfo}. Review complete. ${REVIEWER_CAVEAT}`;
  }

  return { contextText, blockReason, shouldDeny };
}

