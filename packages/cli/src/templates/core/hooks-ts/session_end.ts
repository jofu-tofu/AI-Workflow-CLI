#!/usr/bin/env bun
/**
 * SessionEnd hook: Save session state, assign plan fields (fallback),
 * stage has_staged_work for next session.
 */
import * as fs from "node:fs";
import path from "node:path";

import { saveState, determineArtifactType } from "../lib-ts/context/context-store.js";
import {
  findLatestPlan,
} from "../lib-ts/context/plan-manager.js";
import {
  requireBoundSession, runHook, logDebug, logInfo, logError, logDiagnostic,
} from "../lib-ts/hooks/hook-utils.js";
import {
  buildSessionMetadata,
  computePlanFallback,
  generateArchiveFilename,
  shouldStage,
} from "../lib-ts/hooks/session-end-logic.js";
import { getContextDir } from "../lib-ts/runtime/constants.js";
import { getGitState } from "../lib-ts/runtime/git-state.js";
import { nowIso } from "../lib-ts/runtime/utils.js";

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

  // 3. Generate archive filename with collision handling
  const existingNames = new Set(fs.readdirSync(transcriptsDir));
  const archiveName = generateArchiveFilename(sessionId, new Date(), existingNames);
  const archivePath = path.join(transcriptsDir, archiveName);

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
  const bound = requireBoundSession("session_end");
  if (!bound) return;

  const { payload, sessionId, projectRoot, state } = bound;
  const source = payload.source ?? "unknown";
  const permissionMode = payload.permission_mode ?? "";

  // Capture git state
  const gitState = getGitState(projectRoot);

  // Save session metadata
  state.last_session = buildSessionMetadata(
    sessionId,
    source,
    payload.transcript_path ?? undefined,
    gitState,
  );
  state.last_active = nowIso();

  // Archive transcript
  if (payload.transcript_path) {
    try {
      const archived = archiveTranscript(
        payload.transcript_path,
        state.id,
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
        const content = fs.readFileSync(latestPlanPath, "utf8");
        const fallback = computePlanFallback(state, content);
        Object.assign(state, fallback, { plan_path: latestPlanPath });
        if (fallback.plan_hash) {
          logInfo("session_end", `Assigned plan fallback: hash=${fallback.plan_hash}`);
        }
      } catch (error) {
        logError("session_end", `Failed to read plan: ${error}`);
      }
    }
  }

  // Unified staging logic (replaces separate plan/handoff checks)
  const artifactType = determineArtifactType(state);
  if (artifactType && shouldStage(state, permissionMode)) {
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


