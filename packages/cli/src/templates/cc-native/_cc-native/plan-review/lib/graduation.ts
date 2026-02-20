/**
 * Graduation logic: pass eligibility, pass streaks, graduation threshold, iteration advancement.
 * Extracted from cc-native-plan-review.ts.
 */

import type {
  IterationState,
  ReviewerResult,
  CombinedReviewResult,
  IterationAdvancement,
} from "../../lib-ts/types.js";

// ---------------------------------------------------------------------------
// Pass Eligibility
// ---------------------------------------------------------------------------

/**
 * Determine which agents are pass-eligible this iteration.
 * Criteria: verdict === "pass" OR zero high-severity issues.
 * Agents with "skip"/"error" are NOT eligible (no signal).
 */
export function computePassEligible(agentResults: Record<string, ReviewerResult>): string[] {
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
// Tracker Issue Extraction
// ---------------------------------------------------------------------------

/**
 * Extract top high-severity issues for the review tracker.
 */
export function extractTopIssuesForTracker(
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
// Iteration Advancement
// ---------------------------------------------------------------------------

const GRADUATION_THRESHOLD = 2;

/**
 * Advance iteration state after a review cycle. Returns a new state copy
 * (does not mutate input).
 *
 * - On pass/warrant: sets current past max (stop iterating)
 * - On deny: increments current toward max (safety valve)
 * - Updates pass streaks and graduates agents that reached threshold
 */
export function advanceIterationState(
  state: IterationState,
  planHash: string,
  planPath: string,
  verdict: string,
  shouldDeny: boolean,
  passEligible: string[],
  agentResults: Record<string, ReviewerResult>,
  graduationThreshold = GRADUATION_THRESHOLD,
): IterationAdvancement {
  const updated: IterationState = {
    ...state,
    history: [...state.history, { hash: planHash, verdict, timestamp: new Date().toISOString() }],
    lastPlanHash: planHash,
    lastPlanPath: planPath,
    graduated: [...state.graduated],
    passStreaks: { ...state.passStreaks },
  };

  if (!shouldDeny) {
    // Pass/warrant: stop iterating
    updated.current = updated.max + 1;
  } else {
    // Deny: advance toward max
    updated.current = state.current + 1;
  }

  // Update pass streaks — only for agents that actually ran this iteration
  const passEligibleSet = new Set(passEligible);
  const graduatedSet = new Set(updated.graduated);

  for (const name of Object.keys(agentResults)) {
    if (graduatedSet.has(name)) continue;
    if (passEligibleSet.has(name)) {
      updated.passStreaks[name] = (updated.passStreaks[name] ?? 0) + 1;
    } else {
      updated.passStreaks[name] = 0;
    }
  }

  // Graduate agents that reached threshold
  const newGraduates: string[] = [];
  for (const [name, streak] of Object.entries(updated.passStreaks)) {
    if (streak >= graduationThreshold && !graduatedSet.has(name)) {
      newGraduates.push(name);
    }
  }
  if (newGraduates.length > 0) {
    updated.graduated = [...updated.graduated, ...newGraduates];
  }

  return { updatedState: updated, newGraduates };
}
