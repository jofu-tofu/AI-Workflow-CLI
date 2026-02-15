#!/usr/bin/env bun
/**
 * SessionEnd hook: Save session state, assign plan fields (fallback),
 * stage has_plan/has_handoff for next session.
 */
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as path from "node:path";
import {
  loadHookInput, runHook, logDebug, logInfo, logWarn, logError, logDiagnostic,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot, getContextDir } from "../lib-ts/base/constants.js";
import { nowIso } from "../lib-ts/base/utils.js";
import { getContextBySessionId, saveState, determineArtifactType } from "../lib-ts/context/context-store.js";
import {
  findLatestPlan, normalizePlanContent, generatePlanId, extractPlanAnchors,
} from "../lib-ts/context/plan-manager.js";
import { getGitState } from "../lib-ts/base/git-state.js";

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
  } catch (e) {
    logError("session_end", `Failed to copy transcript: ${e}`);
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
    } catch (e) {
      logError("session_end", `Transcript archival failed: ${e}`);
    }
  }

  // CRITICAL ORDER: New plan detection FIRST, then fallback assignment
  // This prevents plan fallback from resurrecting old plan and clearing newer handoff

  // New plan detection (reset consumed flag if hash changed)
  // Handles both hash change AND first plan creation (plan_hash_consumed null)
  if (
    state.plan_hash &&
    (!state.plan_hash_consumed || state.plan_hash !== state.plan_hash_consumed)
  ) {
    logInfo("session_end", `New plan detected: hash=${state.plan_hash}`);
    state.work_consumed = false; // CHANGED: unified flag
    state.next_artifact_type = "plan";

    // Latest artifact wins: clear handoff if it exists
    if (state.handoff_path) {
      logInfo("session_end", "New plan replaces existing handoff (latest wins)");
      state.handoff_path = null;
    }
  }

  // Plan fallback assignment AFTER new plan check
  // Guard: Only assign fallback if no plan AND no handoff AND no next_artifact_type
  // (don't overwrite handoff, don't run after new plan detection just set artifact type)
  // Note: Removed permissionMode guard - fallback now runs in plan mode to fix staging bug
  if (
    !state.plan_hash &&
    !state.handoff_path &&
    !state.next_artifact_type
  ) {
    const latestPlanPath = findLatestPlan(state.id, projectRoot);
    if (latestPlanPath) {
      try {
        const content = fs.readFileSync(latestPlanPath, "utf-8");
        const normalized = normalizePlanContent(content);
        const planHash = crypto
          .createHash("sha256")
          .update(normalized, "utf-8")
          .digest("hex")
          .slice(0, 12);

        state.plan_hash = planHash;
        state.plan_path = latestPlanPath;
        state.plan_signature = content.slice(0, 200);
        state.plan_id = generatePlanId();
        state.plan_anchors = extractPlanAnchors(content);
        state.work_consumed = state.work_consumed ?? false; // CHANGED: unified flag

        logInfo("session_end", `Assigned plan fallback: hash=${planHash}`);
      } catch (e) {
        logError("session_end", `Failed to read plan: ${e}`);
      }
    }
  }

  // Unified staging logic (replaces separate plan/handoff checks)
  const artifactType = determineArtifactType(state);
  // Allow staging from active mode OR when session ends in plan mode (fixes plan mode staging bug)
  const canStage = state.mode === "active" || permissionMode === "plan";
  if (artifactType && canStage && !state.work_consumed) {
    state.mode = "has_staged_work"; // CHANGED: unified mode
    state.next_artifact_type = artifactType;
    logInfo("session_end", `Staged ${state.id}: ${state.mode} → has_staged_work (${artifactType})`);
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
