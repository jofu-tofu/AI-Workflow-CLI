#!/usr/bin/env bun
/**
 * PostToolUse:* hook: Monitor context window usage, trigger mode transitions,
 * and progressive-save state when context runs low.
 */
import { getContextBySessionId, saveState } from "../lib-ts/context/context-store.js";
import { selectWarningMessage } from "../lib-ts/hooks/context-monitor-logic.js";
import {
  emitContext, getContextPercentRemaining, hookLog,
  requireBoundSession, logDebug, logDiagnostic, logInfo, runHook, safeMaybeActivate,
} from "../lib-ts/hooks/hook-utils.js";
import { nowIso } from "../lib-ts/runtime/utils.js";
import type { ContextState } from "../lib-ts/types.js";

const WRITE_TOOLS = new Set(["Bash", "Edit", "NotebookEdit", "Write"]);

const SAVE_STATE_THRESHOLD = 60;

/** Transition idle/has_staged_work → active when implementation tools are used. */
function checkAndTransitionMode(
  stateId: string,
  toolName: string | undefined,
  permissionMode: string,
  projectRoot: string,
): void {
  if (!toolName || !WRITE_TOOLS.has(toolName)) return;
  safeMaybeActivate(stateId, permissionMode, projectRoot, "context_monitor");
}

/** Save state snapshot at SAVE_STATE_THRESHOLD. */
function progressiveSave(
  state: ContextState,
  sessionId: string,
  projectRoot: string,
): void {
  state.last_session = {
    ...state.last_session,
    session_id: sessionId,
    saved_at: nowIso(),
    save_reason: "progressive_save",
  };
  state.last_active = nowIso();

  const [ok] = saveState(state.id, state, projectRoot);
  if (ok) {
    logInfo("context_monitor", `Progressive save for ${state.id}`);
  }
}

/** Emit context-low nudge if a new threshold is crossed. Fires at most once per threshold per session. */
function checkContextWarnings(
  state: ContextState,
  pctRemaining: number,
  projectRoot: string,
): void {
  if (!state.last_session) {
    state.last_session = {};
  }
  const fired = state.last_session.context_warnings_fired ?? [];
  const warning = selectWarningMessage(pctRemaining, fired);
  if (!warning) return;

  emitContext(warning.msg);
  state.last_session.context_warnings_fired = [...fired, warning.pct];
  saveState(state.id, state, projectRoot);
  logInfo(
    "context_monitor",
    `Context warning emitted at ${warning.pct}% threshold`,
  );
}

function main(): void {
  const bound = requireBoundSession("context_monitor");
  if (!bound) return;

  const { payload, sessionId, projectRoot } = bound;
  const permissionMode = payload.permission_mode ?? "";
  const toolName = payload.tool_name;

  // Initial context lookup
  let state = bound.state;

  // Phase 1: Mode transition for write tools
  checkAndTransitionMode(state.id, toolName, permissionMode, projectRoot);

  // Phase 2: Context window check (log only, no warnings emitted)
  const [pctRemaining, tokensUsed, maxTokens] = getContextPercentRemaining(payload);

  logDiagnostic("context_monitor", "receive", `tool=${toolName ?? "Unknown"}, pct_remaining=${pctRemaining}`);

  if (pctRemaining === null) {
    logDebug("context_monitor", "No context window data available");
    return;
  }

  if (pctRemaining > SAVE_STATE_THRESHOLD) return;

  // Reload state after maybeActivate may have mutated it on disk
  state = getContextBySessionId(sessionId, projectRoot) ?? state;

  // Progressive save for ≤ 60%
  progressiveSave(state, sessionId, projectRoot);

  // Context-low warnings (independent of save threshold)
  checkContextWarnings(state, pctRemaining, projectRoot);

  // Log context level (file only)
  if (tokensUsed !== null && maxTokens !== null) {
    hookLog("info", "context_monitor", `Context: ${pctRemaining}% remaining (~${Math.floor(tokensUsed / 1000)}k/${Math.floor(maxTokens / 1000)}k tokens)`, { stderr: false });
  } else {
    hookLog("info", "context_monitor", `Context: ~${pctRemaining}% remaining (from context.json)`, { stderr: false });
  }
}

runHook(main, "context_monitor");
