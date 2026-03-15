#!/usr/bin/env bun
/**
 * PreCompact hook: Save state.json snapshot before context compaction.
 * Captures git state and session metadata for recovery.
 */
import { saveState } from "../lib-ts/context/context-store.js";
import {
  logError, logInfo, requireBoundSession, runHook,
} from "../lib-ts/hooks/hook-utils.js";
import { getGitState } from "../lib-ts/runtime/git-state.js";
import { nowIso } from "../lib-ts/runtime/utils.js";

function main(): void {
  const bound = requireBoundSession("pre_compact");
  if (!bound) return;
  const { sessionId, projectRoot, state } = bound;

  const gitState = getGitState(projectRoot);

  state.last_session = {
    ...state.last_session,
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
