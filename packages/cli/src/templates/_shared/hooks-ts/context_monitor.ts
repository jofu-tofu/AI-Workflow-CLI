#!/usr/bin/env bun
/**
 * PostToolUse:* hook: Monitor context window usage, trigger mode transitions,
 * and progressive-save state when context runs low.
 */
import {
  loadHookInput, runHook,
  getContextPercentRemaining,
  logDebug, logInfo, logWarn, logDiagnostic, hookLog,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import { nowIso } from "../lib-ts/base/utils.js";
import { getContextBySessionId, maybeActivate, saveState } from "../lib-ts/context/context-store.js";
import type { ContextState } from "../lib-ts/types.js";

const WRITE_TOOLS = new Set(["Edit", "Write", "Bash", "NotebookEdit"]);

const SAVE_STATE_THRESHOLD = 60;

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
  } catch (e) {
    logWarn("context_monitor", `maybeActivate failed (non-critical): ${e}`);
  }
}

/** Save state snapshot at SAVE_STATE_THRESHOLD. */
function progressiveSave(
  state: ContextState,
  sessionId: string,
  projectRoot: string,
): void {
  state.last_session = {
    ...(state.last_session ?? {}),
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

  // Log context level (file only, no warnings injected into conversation)
  if (tokensUsed !== null && maxTokens !== null) {
    hookLog("info", "context_monitor", `Context: ${pctRemaining}% remaining (~${Math.floor(tokensUsed / 1000)}k/${Math.floor(maxTokens / 1000)}k tokens)`, { stderr: false });
  } else {
    hookLog("info", "context_monitor", `Context: ~${pctRemaining}% remaining (from context.json)`, { stderr: false });
  }
}

runHook(main, "context_monitor");
