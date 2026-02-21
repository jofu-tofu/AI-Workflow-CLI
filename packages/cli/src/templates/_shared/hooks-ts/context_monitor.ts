#!/usr/bin/env bun
/**
 * PostToolUse:* hook: Monitor context window usage, trigger mode transitions,
 * and progressive-save state when context runs low.
 */
import { getProjectRoot } from "../lib-ts/base/constants.js";
import {
  emitContext, getContextPercentRemaining, hookLog,
  loadHookInput,
  logDebug, logDiagnostic, logInfo, logWarn, runHook,
} from "../lib-ts/base/hook-utils.js";
import { nowIso } from "../lib-ts/base/utils.js";
import { getContextBySessionId, maybeActivate, saveState } from "../lib-ts/context/context-store.js";
import type { ContextState } from "../lib-ts/types.js";

const WRITE_TOOLS = new Set(["Bash", "Edit", "NotebookEdit", "Write"]);

const SAVE_STATE_THRESHOLD = 60;

const CONTEXT_WARNING_30 = "## Context Window: ~30% Remaining\n\n" +
  "This session is approaching its context limit. Consider:\n\n" +
  "- Completing your current task, then pausing for the user to decide next steps\n" +
  "- If significant work remains, mention that `/aiwcli-shared:handoff` can capture progress " +
  "for a fresh session\n\n" +
  "Do not rush or cut corners — finish the current task properly. " +
  "Just be aware that starting large new tasks may not complete before context runs out.";

const CONTEXT_WARNING_15 = "## Context Window: ~15% Remaining — Wrap Up Now\n\n" +
  "Context is critically low. After completing your current step:\n\n" +
  "1. **Stop taking on new work**\n" +
  "2. Summarize what was accomplished and what remains\n" +
  "3. Offer to run `/aiwcli-shared:handoff` so progress transfers to a fresh session\n\n" +
  "Do not start new multi-step tasks. Focus on clean closure.";

const WARNING_THRESHOLDS = [
  { pct: 15, msg: CONTEXT_WARNING_15 },  // Most urgent first
  { pct: 30, msg: CONTEXT_WARNING_30 },
];

/** Transition idle/has_plan → active when implementation tools are used. */
function checkAndTransitionMode(
  state: ContextState,
  toolName: string | undefined,
  permissionMode: string,
  projectRoot: string,
): void {
  if (!toolName || !WRITE_TOOLS.has(toolName)) return;
  try {
    maybeActivate(state.id, permissionMode, projectRoot, "context_monitor");
  } catch (error) {
    logWarn("context_monitor", `maybeActivate failed (non-critical): ${error}`);
  }
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

  for (const { pct, msg } of WARNING_THRESHOLDS) {
    if (pctRemaining <= pct && !fired.includes(pct)) {
      emitContext(msg);
      state.last_session.context_warnings_fired = [...fired, pct];
      saveState(state.id, state, projectRoot);
      logInfo("context_monitor", `Context warning emitted at ${pct}% threshold`);
      return; // One warning per tool call — most urgent fires first
    }
  }
}

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;

  const sessionId = payload.session_id;
  if (!sessionId) return;

  const projectRoot = getProjectRoot(payload.cwd);
  const permissionMode = payload.permission_mode ?? "";
  const toolName = payload.tool_name;

  // Initial context lookup
  let state = getContextBySessionId(sessionId, projectRoot);
  if (!state) {
    logDebug("context_monitor", `No context for session ${sessionId}`);
    return;
  }

  // Phase 1: Mode transition for write tools
  checkAndTransitionMode(state, toolName, permissionMode, projectRoot);

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
