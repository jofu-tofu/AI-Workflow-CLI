/**
 * CC-native state accessor for context state.json.
 * Deduplicates state access patterns from utils.py and suggest-fresh-perspective.py.
 * See cc-native-plan-review-spec.md §4.5
 */

import { getContextBySessionId, saveState } from "../../_shared/lib-ts/context/context-store.js";
import { logInfo, logWarn } from "../../_shared/lib-ts/base/logger.js";
import { nowIso } from "../../_shared/lib-ts/base/utils.js";
import type {
  CcNativeState,
  PlanReviewState,
  QuestionsAskedState,
  IterationState,
  StuckDetectionState,
} from "./types.js";
import type { ContextState } from "../../_shared/lib-ts/types.js";

/**
 * ContextState extended with the cc_native method-specific data.
 * ContextState doesn't include cc_native in its type definition because it's
 * a shared type. This local extension bridges the gap for cc-native code.
 */
type CcNativeContextState = ContextState & { cc_native?: CcNativeState };

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
    const state = getContextBySessionId(sessionId, projectRoot) as CcNativeContextState | null;
    if (state?.cc_native && typeof state.cc_native === "object") {
      return state.cc_native;
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
    const state = getContextBySessionId(sessionId, projectRoot) as CcNativeContextState | null;
    if (state) {
      state.cc_native = ccNativeData;
      saveState(state.id, state, projectRoot);
      return true;
    }
  } catch (e: unknown) {
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
 * Get the last plan review state for this session.
 * Returns null if no review state exists or plan hash doesn't match.
 */
export function getLastPlanReview(
  sessionId: string,
  planHash: string,
  projectRoot: string,
): PlanReviewState | null {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  if (!ccNative) return null;
  const reviewState = ccNative.plan_review;
  if (reviewState?.plan_hash !== planHash) return null;
  return reviewState;
}

/**
 * Mark this plan as reviewed (stores hash and decision in state.json).
 */
export function markPlanReviewed(
  sessionId: string,
  planHash: string,
  projectRoot: string,
  hookName = "cc-native",
  iterationState?: IterationState,
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
        current: iterationState.current ?? 1,
        max: iterationState.max ?? 1,
        complexity: iterationState.complexity ?? "unknown",
      };
      const history = iterationState.history;
      if (history && history.length > 0) {
        const lastEntry = history[history.length - 1];
        if (lastEntry) {
          reviewData.iteration.latest_verdict = lastEntry.verdict ?? "unknown";
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
  } catch (e: unknown) {
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
 * Check if early questions (Phase A: AskUserQuestion) were asked this session.
 * Returns false on any error (fail-safe: allow feature to work).
 */
export function wasEarlyQuestionsAsked(
  sessionId: string,
  projectRoot: string,
): boolean {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  if (!ccNative) return false;
  return ccNative.questions_asked?.early_questions_asked?.asked === true;
}

/**
 * Check if plan questions agent (Phase B: independent question agent) ran this session.
 * Returns false on any error (fail-safe: allow feature to work).
 */
export function wasPlanQuestionsAgentAsked(
  sessionId: string,
  projectRoot: string,
): boolean {
  const ccNative = getCcNativeState(sessionId, projectRoot);
  if (!ccNative) return false;
  return ccNative.questions_asked?.plan_questions_agent_asked?.asked === true;
}

/**
 * Mark that questions were asked in a specific phase. Returns true on success.
 * Only stores timestamp, no user data.
 * @param phase - 'early' for Phase A (AskUserQuestion), 'agent' for Phase B (independent question agent)
 */
export function markQuestionsAsked(
  sessionId: string,
  projectRoot: string,
  phase: "early" | "agent",
): boolean {
  try {
    const ccNative = getCcNativeState(sessionId, projectRoot) ?? {};
    const timestamp = nowIso();

    // Initialize questions_asked if it doesn't exist
    if (!ccNative.questions_asked) {
      ccNative.questions_asked = {
        asked: false,
        asked_at: "",
      };
    }

    // Mark phase-specific gate
    if (phase === "early") {
      ccNative.questions_asked.early_questions_asked = {
        asked: true,
        asked_at: timestamp,
      };
    } else {
      ccNative.questions_asked.plan_questions_agent_asked = {
        asked: true,
        asked_at: timestamp,
      };
    }

    // Update backward-compatible fields
    ccNative.questions_asked.asked = true;
    ccNative.questions_asked.asked_at = timestamp;

    return saveCcNativeState(sessionId, projectRoot, ccNative);
  } catch (e: unknown) {
    logWarn("utils", `Failed to mark questions asked: ${e}`);
    return false;
  }
}

/**
 * Reset plan questions agent flag so a new plan gets fresh questions.
 * Called when plan file path changes (new plan topic detected).
 */
export function resetPlanQuestionsAsked(
  sessionId: string,
  projectRoot: string,
): boolean {
  try {
    const ccNative = getCcNativeState(sessionId, projectRoot) ?? {};
    if (ccNative.questions_asked) {
      ccNative.questions_asked.plan_questions_agent_asked = {
        asked: false,
        asked_at: "",
      };
    }
    return saveCcNativeState(sessionId, projectRoot, ccNative);
  } catch (e: unknown) {
    logWarn("utils", `Failed to reset plan questions asked: ${e}`);
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
  } catch (e: unknown) {
    logWarn("utils", `Failed to update stuck detection state: ${e}`);
    return false;
  }
}

