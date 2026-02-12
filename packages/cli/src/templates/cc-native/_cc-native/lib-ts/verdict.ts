/**
 * Pure verdict aggregation logic.
 * See cc-native-plan-review-spec.md §4.2
 */

import type { ReviewDecisionResult, Verdict } from "./types.js";

/**
 * Return the worst verdict from a list.
 * Order: pass < warn < fail. skip→pass, error→warn.
 */
export function worstVerdict(verdicts: Verdict[]): Verdict {
  const order: Record<Verdict, number> = {
    pass: 0,
    warn: 1,
    fail: 2,
    skip: 0,
    error: 1,
  };

  let worst: Verdict = "pass";
  for (const v of verdicts) {
    if ((order[v] ?? 1) > (order[worst] ?? 0)) {
      worst = v;
    }
  }

  // Normalize error → warn
  if (worst === "error") return "warn";
  return worst;
}

/**
 * Verdict aggregation: fail veto triggers a block.
 *
 * Priority order:
 * 1. Fail Veto: Any fail → deny (ISO 61508 zero-tolerance)
 * 2. Acceptable: warns are informational only
 *
 * Error exclusion: Detectors that produce no signal (error/skip) are excluded
 * from the denominator.
 *
 * @param allVerdicts - List of verdict strings from all reviewers
 * @param warnThreshold - Kept for backward compatibility. No longer used for blocking.
 * @returns ReviewDecisionResult with should_deny, reason, and score
 */
export function computeReviewDecision(
  allVerdicts: Verdict[],
  _warnThreshold = 0.5,
): ReviewDecisionResult {
  // Exclude non-signal verdicts
  const signalVerdicts = allVerdicts.filter(
    (v) => v === "pass" || v === "warn" || v === "fail",
  );

  if (signalVerdicts.length === 0) {
    return { should_deny: false, reason: "no_signal", score: 0 };
  }

  // Fail blocks unconditionally
  const failCount = signalVerdicts.filter((v) => v === "fail").length;
  if (failCount > 0) {
    return { should_deny: true, reason: "fail_veto", score: 1 };
  }

  // Warn ratio still computed for logging/visibility, but does NOT block
  const warnCount = signalVerdicts.filter((v) => v === "warn").length;
  const warnRatio = warnCount / signalVerdicts.length;
  return { should_deny: false, reason: "acceptable", score: warnRatio };
}
