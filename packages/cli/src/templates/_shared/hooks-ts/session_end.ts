#!/usr/bin/env bun
/**
 * SessionEnd hook: Save session state, assign plan fields (fallback),
 * stage has_plan/has_handoff for next session.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { getProjectRoot, getContextDir } from "../lib-ts/base/constants.js";
import { getGitState } from "../lib-ts/base/git-state.js";
import {
  loadHookInput, runHook, logDebug, logInfo, logWarn, logError, logDiagnostic,
} from "../lib-ts/base/hook-utils.js";
import { nowIso } from "../lib-ts/base/utils.js";
import { getContextBySessionId, saveState } from "../lib-ts/context/context-store.js";
import {
  findLatestPlan, normalizePlanContent, generatePlanId, extractPlanAnchors,
} from "../lib-ts/context/plan-manager.js";

/**
 * Archive session transcript to context's session-transcripts/ folder.
 * Returns archived path on success, null if skipped or failed.
 */
function archiveTranscript(
  transcriptPath: string,
  contextId: string,
  sessionId: string,
  projectRoot: string,
): string | null {
  // 1. Validate inputs
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    logDebug("session_end", `Transcript not found: ${transcriptPath}`);
    return null;
  }

  // 2. Ensure session-transcripts directory exists
  const contextDir = getContextDir(contextId, projectRoot);
  const transcriptsDir = path.join(contextDir, "session-transcripts");
  fs.mkdirSync(transcriptsDir, { recursive: true });

  // 3. Generate archive filename: YYYY-MM-DD-HHMM-{session_id}.jsonl
  const now = new Date();
  // Format: 2026-02-14-1400 (year-month-day-hourminute)
  // Note: Hours and minutes are concatenated without separator (HHMM)
  const timestamp =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}-` +
    `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  // 4. Handle collisions (rare, but possible with rapid session churn)
  let archiveName = `${timestamp}-${sessionId}.jsonl`;
  let archivePath = path.join(transcriptsDir, archiveName);
  let counter = 2;
  while (fs.existsSync(archivePath)) {
    archiveName = `${timestamp}-${sessionId}-${counter}.jsonl`;
    archivePath = path.join(transcriptsDir, archiveName);
    counter++;
  }

  // 5. Copy transcript file
  try {
    fs.copyFileSync(transcriptPath, archivePath);
    return archivePath;
  } catch (error) {
    logError("session_end", `Failed to copy transcript: ${error}`);
    return null;
  }
}

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

  // Archive transcript (NEW)
  // Note: state is a ContextState object (from getContextBySessionId on line 33)
  // state.id is the context ID used to construct paths like _output/contexts/{context_id}/
  if (payload.transcript_path) {
    try {
      const archived = archiveTranscript(
        payload.transcript_path,
        state.id,  // Context ID, verified by existing code on line 98: saveState(state.id, ...)
        sessionId,
        projectRoot,
      );
      if (archived) {
        logInfo("session_end", `Archived transcript: ${path.basename(archived)}`);
      }
    } catch (error) {
      logError("session_end", `Transcript archival failed: ${error}`);
    }
  }

  // Plan fallback assignment (skip in plan mode — rejected plans shouldn't stage)
  if (permissionMode !== "plan") {
    // Step 1: Assign plan fields if missing
    if (!state.plan_hash) {
      const latestPlanPath = findLatestPlan(state.id, projectRoot);
      if (latestPlanPath) {
        try {
          const content = fs.readFileSync(latestPlanPath, "utf-8");
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
