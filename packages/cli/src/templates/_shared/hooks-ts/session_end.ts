#!/usr/bin/env bun
/**
 * SessionEnd hook: Save session state, assign plan fields (fallback),
 * stage has_plan/has_handoff for next session.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";

import { getProjectRoot } from "../lib-ts/base/constants.js";
import { getGitState } from "../lib-ts/base/git-state.js";
import {
  loadHookInput, logDebug, logDiagnostic, logError, logInfo, logWarn as _logWarn, runHook,
} from "../lib-ts/base/hook-utils.js";
import { nowIso } from "../lib-ts/base/utils.js";
import { getContextBySessionId, saveState } from "../lib-ts/context/context-store.js";
import {
  extractPlanAnchors, findLatestPlan, generatePlanId, normalizePlanContent,
} from "../lib-ts/context/plan-manager.js";

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;

  const sessionId = payload.session_id;
  if (!sessionId) {
    logDebug("session_end", "No session_id, skipping");
    return;
  }

  const projectRoot = getProjectRoot(payload.cwd);
  const source = payload.source ?? "unknown";
  const permissionMode = payload.permission_mode ?? "";

  const state = getContextBySessionId(sessionId, projectRoot);
  if (!state) {
    logDebug("session_end", `No context bound to session ${sessionId}`);
    return;
  }

  // Capture git state
  const gitState = getGitState(projectRoot);

  // Save session metadata
  state.last_session = {
    session_id: sessionId,
    save_reason: source,
    saved_at: nowIso(),
    transcript_path: payload.transcript_path ?? undefined,
    git_state: gitState,
  };
  state.last_active = nowIso();

  // Plan fallback assignment (skip in plan mode — rejected plans shouldn't stage)
  if (permissionMode !== "plan") {
    // Step 1: Assign plan fields if missing
    if (!state.plan_hash) {
      const latestPlanPath = findLatestPlan(state.id, projectRoot);
      if (latestPlanPath) {
        try {
          const content = fs.readFileSync(latestPlanPath, "utf8");
          const normalized = normalizePlanContent(content);
          const planHash = crypto.createHash("sha256")
            .update(normalized, "utf-8")
            .digest("hex")
            .slice(0, 12);

          state.plan_hash = planHash;
          state.plan_path = latestPlanPath;
          state.plan_signature = content.slice(0, 200);
          state.plan_id = generatePlanId();
          state.plan_anchors = extractPlanAnchors(content);
          // Preserve plan_consumed if already true (plan was implemented) —
          // resetting it would re-stage the plan and block handoff staging.
          // Only set to false when no prior consumption has occurred.
          state.plan_consumed = state.plan_consumed || false;

          logInfo("session_end", `Assigned plan fallback: hash=${planHash}, path=${latestPlanPath}`);
        } catch (error) {
          logError("session_end", `Failed to read plan: ${error}`);
        }
      }
    }

    // Step 2: Stage has_plan if conditions met
    if (state.plan_hash && state.mode === "active" && !state.plan_consumed) {
      state.mode = "has_plan";
      logInfo("session_end", `Staged ${state.id}: active → has_plan`);
    }
    // If plan_consumed, skip — already consumed, don't re-stage
  }

  // Handoff staging (only if mode is still "active" — plan check may have changed it)
  if (state.handoff_path && state.mode === "active" && !state.handoff_consumed) {
    state.mode = "has_handoff";
    logInfo("session_end", `Staged ${state.id}: active → has_handoff`);
  }

  // Save final state
  const [ok, err] = saveState(state.id, state, projectRoot);
  if (ok) {
    logDiagnostic("session_end", "saved", `${state.id} mode=${state.mode}`);
  } else {
    logError("session_end", `Failed to save state: ${err}`);
  }
}

runHook(main, "session_end");
