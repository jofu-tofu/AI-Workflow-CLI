/**
 * CC-native state accessor for context state.json.
 * Deduplicates state access patterns from utils.py and suggest-fresh-perspective.py.
 * See cc-native-plan-review-spec.md §4.5
 */

import { getContextBySessionId, saveState } from "../../../_shared/lib-ts/context/context-store.js";
import { logInfo, logWarn } from "../../../_shared/lib-ts/base/logger.js";
import { nowIso } from "../../../_shared/lib-ts/base/utils.js";
import type {
  CcNativeState,
  PlanReviewState,
  QuestionsAskedState,
  StuckDetectionState,
} from "./types.js";

// ---------------------------------------------------------------------------
// Core State Access
// ---------------------------------------------------------------------------

/**
 * Get cc_native state from context state.json.
 * Returns the cc_native dict or null if not found.
 */
export function getCcNativeState(
  sessionId: string,
  projectRoot: string,
): CcNativeState | null {
  try {
    const state = getContextBySessionId(sessionId, projectRoot);
    if (state) {
      const raw = state as Record<string, any>;
      if (raw.cc_native && typeof raw.cc_native === "object") {
        return raw.cc_native as CcNativeState;
      }
    }
  } catch {
    // Fail-safe: return null
  }
  return null;
}

/**
 * Save cc_native state to context state.json.
 * Returns true on success, false on failure.
 */
export function saveCcNativeState(
  sessionId: string,
  projectRoot: string,
  ccNativeData: CcNativeState,
): boolean {
  try {
    const state = getContextBySessionId(sessionId, projectRoot);
    if (state) {
      (state as Record<string, any>).cc_native = ccNativeData;
      saveState(state, projectRoot);
      return true;
    }
  } catch (e: any) {
    logWarn("utils", `Failed to save cc_native state: ${e}`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Plan Review State
// ---------------------------------------------------------------------------

/**
 * Check if this exact plan has already been reviewed in this session.
 */
export function isPlanAlreadyReviewed(
  sessionId: string,
  planHash: string,
  projectRoot: string,
): boolean {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  if (!ccNative) return false;
  const reviewState = ccNative.plan_review;
  return reviewState?.plan_hash === planHash;
}

/**
 * Check if this plan hash was previously reviewed and denied.
 * Matches any deny variant: "deny", "hook_deny_iteration", "hook_deny_final".
 */
export function wasPlanPreviouslyDenied(
  sessionId: string,
  planHash: string,
  projectRoot: string,
): boolean {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  if (!ccNative) return false;
  const reviewState = ccNative.plan_review;
  if (reviewState?.plan_hash !== planHash) return false;
  const decision = reviewState.decision ?? "";
  return decision === "deny" || decision.startsWith("hook_deny");
}

/**
 * Mark this plan as reviewed (stores hash and decision in state.json).
 */
export function markPlanReviewed(
  sessionId: string,
  planHash: string,
  projectRoot: string,
  hookName = "cc-native",
  iterationState?: Record<string, any>,
  decision = "allow",
): void {
  try {
    const ccNative = getCcNativeState(sessionId, projectRoot) ?? {};

    const reviewData: PlanReviewState = {
      plan_hash: planHash,
      reviewed_at: nowIso(),
      decision,
    };

    if (iterationState) {
      reviewData.iteration = {
        current: (iterationState.current as number) ?? 1,
        max: (iterationState.max as number) ?? 1,
        complexity: (iterationState.complexity as string) ?? "unknown",
      };
      const history = iterationState.history as Array<Record<string, any>> | undefined;
      if (history && history.length > 0) {
        const lastEntry = history[history.length - 1];
        if (lastEntry) {
          reviewData.iteration.latest_verdict =
            (lastEntry.verdict as string) ?? "unknown";
        }
      }
    }

    ccNative.plan_review = reviewData;

    if (saveCcNativeState(sessionId, projectRoot, ccNative)) {
      const iterInfo = iterationState
        ? ` (iteration ${reviewData.iteration?.current ?? "?"}/${reviewData.iteration?.max ?? "?"})`
        : "";
      logInfo(hookName, `Saved plan review state (hash: ${planHash})${iterInfo}`);
    } else {
      logWarn(
        hookName,
        `Failed to save plan review state for session ${sessionId}`,
      );
    }
  } catch (e: any) {
    logWarn(hookName, `Failed to mark plan reviewed: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Questions Asked State
// ---------------------------------------------------------------------------

/**
 * Check if AskUserQuestion was called this session.
 * Returns false on any error (fail-safe: allow feature to work).
 */
export function wasQuestionsAsked(
  sessionId: string,
  projectRoot: string,
): boolean {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  if (!ccNative) return false;
  return ccNative.questions_asked?.asked === true;
}

/**
 * Mark that AskUserQuestion was called. Returns true on success.
 * Only stores timestamp, no user data.
 */
export function markQuestionsAsked(
  sessionId: string,
  projectRoot: string,
): boolean {
  try {
    const ccNative = getCcNativeState(sessionId, projectRoot) ?? {};

    ccNative.questions_asked = {
      asked: true,
      asked_at: nowIso(),
    };

    return saveCcNativeState(sessionId, projectRoot, ccNative);
  } catch (e: any) {
    logWarn("utils", `Failed to mark questions asked: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Stuck Detection State
// ---------------------------------------------------------------------------

/**
 * Get stuck detection state from cc_native.
 */
export function getStuckDetectionState(
  sessionId: string,
  projectRoot: string,
): StuckDetectionState | null {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  return ccNative?.stuck_detection ?? null;
}

/**
 * Update stuck detection state.
 */
export function updateStuckDetectionState(
  sessionId: string,
  projectRoot: string,
  stuckState: StuckDetectionState,
): boolean {
  try {
    const ccNative = getCcNativeState(sessionId, projectRoot) ?? {};
    ccNative.stuck_detection = stuckState;
    return saveCcNativeState(sessionId, projectRoot, ccNative);
  } catch (e: any) {
    logWarn("utils", `Failed to update stuck detection state: ${e}`);
    return false;
  }
}
