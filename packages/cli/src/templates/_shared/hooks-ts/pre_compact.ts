#!/usr/bin/env bun
/**
 * PreCompact hook: Save state.json snapshot before context compaction.
 * Captures git state and session metadata for recovery.
 */
import {
  loadHookInput, runHook, logDebug, logInfo, logError,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import { nowIso } from "../lib-ts/base/utils.js";
import { getContextBySessionId, saveState } from "../lib-ts/context/context-store.js";
import { getGitState } from "../lib-ts/base/git-state.js";

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;

  const sessionId = payload.session_id;
  if (!sessionId) {
    logDebug("pre_compact", "No session_id, skipping");
    return;
  }

  const projectRoot = getProjectRoot(payload.cwd);
  const state = getContextBySessionId(sessionId, projectRoot);
  if (!state) {
    logDebug("pre_compact", `No context bound to session ${sessionId}`);
    return;
  }

  const gitState = getGitState(projectRoot);

  state.last_session = {
    ...(state.last_session ?? {}),
    session_id: sessionId,
    saved_at: nowIso(),
    save_reason: "pre_compact",
    git_state: gitState,
  };

  const [ok, err] = saveState(state.id, state, projectRoot);
  if (ok) {
    logInfo("pre_compact", `Saved pre-compact snapshot for ${state.id}`);
  } else {
    logError("pre_compact", `Failed to save state: ${err}`);
  }
}

runHook(main, "pre_compact");
