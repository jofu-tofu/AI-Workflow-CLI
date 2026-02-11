#!/usr/bin/env bun
/**
 * PostToolUse:* hook: Monitor context window usage, trigger mode transitions,
 * inject handoff warnings when context runs low.
 */
import {
  loadHookInput, emitContext, runHook,
  getContextPercentRemaining,
  logDebug, logInfo, logWarn, logDiagnostic, hookLog,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import { nowIso } from "../lib-ts/base/utils.js";
import { getContextBySessionId, maybeActivate, saveState } from "../lib-ts/context/context-store.js";
import type { ContextState } from "../lib-ts/types.js";

const WRITE_TOOLS = new Set(["Edit", "Write", "Bash", "NotebookEdit"]);

// Thresholds matching Python context_monitor.py
const SAVE_STATE_THRESHOLD = 60;
const HANDOFF_SUGGEST_THRESHOLD = 30;
const HANDOFF_PREPARE_THRESHOLD = 20;
const CRITICAL_CONTEXT_THRESHOLD = 10;

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

/** Generate context warning with <system-reminder> tags matching Python format. */
function getContextWarning(
  pctRemaining: number,
  tokensUsed: number | null,
  maxTokens: number | null,
  contextId: string | null,
  toolName: string,
): string | null {
  if (pctRemaining > HANDOFF_SUGGEST_THRESHOLD) return null;

  const usageLine = (tokensUsed !== null && maxTokens !== null)
    ? `**Estimated usage**: ~${Math.floor(tokensUsed / 1000)}k / ${Math.floor(maxTokens / 1000)}k tokens`
    : `**Estimated usage**: ~${pctRemaining}% remaining`;

  const contextLine = contextId ? `\nContext ID: \`${contextId}\`` : "";

  if (pctRemaining <= CRITICAL_CONTEXT_THRESHOLD) {
    return `<system-reminder>
## CRITICAL CONTEXT WARNING (${pctRemaining}% remaining)

${usageLine}
**Triggered by**: ${toolName} tool completion

**CRITICAL: Run \`/handoff\` now before context is compacted.**
${contextLine}

You are about to lose context. Stop all other work and run \`/handoff\` immediately.
</system-reminder>`;
  }

  if (pctRemaining <= HANDOFF_PREPARE_THRESHOLD) {
    return `<system-reminder>
## LOW CONTEXT WARNING (${pctRemaining}% remaining)

${usageLine}
**Triggered by**: ${toolName} tool completion

**Context is getting low. Please finish your current task and run \`/handoff\`.**
${contextLine}

**Actions:**
1. Complete your current atomic task (if 1-2 steps away)
2. Do NOT start new multi-step work
3. Run \`/handoff\` to generate a handoff document
</system-reminder>`;
  }

  // 21-30%
  return `<system-reminder>
## CONTEXT NOTICE (${pctRemaining}% remaining)

${usageLine}
**Triggered by**: ${toolName} tool completion

**Consider preparing a handoff soon. When ready, run \`/handoff\` to generate a handoff document.**
${contextLine}

Continue your current work, but avoid starting large new tasks.
</system-reminder>`;
}

/** Save state snapshot at SAVE_STATE_THRESHOLD. */
function progressiveSave(
  state: ContextState,
  sessionId: string,
  projectRoot: string,
): void {
  // Save state snapshot
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
  // maybeActivate writes state to disk, so reload after to avoid stale data
  checkAndTransitionMode(state, toolName, permissionMode, projectRoot);

  // Phase 2: Context window check
  const [pctRemaining, tokensUsed, maxTokens] = getContextPercentRemaining(payload);

  logDiagnostic("context_monitor", "receive", `tool=${toolName ?? "Unknown"}, pct_remaining=${pctRemaining}`);

  if (pctRemaining === null) {
    logDebug("context_monitor", "No context window data available");
    return;
  }

  if (pctRemaining > SAVE_STATE_THRESHOLD) return;

  // Reload state after maybeActivate may have mutated it on disk
  state = getContextBySessionId(sessionId, projectRoot) ?? state;

  if (pctRemaining > HANDOFF_SUGGEST_THRESHOLD) {
    progressiveSave(state, sessionId, projectRoot);
    return;
  }

  // ≤ 30% — generate warning (stderr: false to avoid Claude Code showing "hook error")
  if (tokensUsed !== null && maxTokens !== null) {
    hookLog("info", "context_monitor", `Context: ${pctRemaining}% remaining (~${Math.floor(tokensUsed / 1000)}k/${Math.floor(maxTokens / 1000)}k tokens)`, { stderr: false });
  } else {
    hookLog("info", "context_monitor", `Context: ~${pctRemaining}% remaining (from context.json)`, { stderr: false });
  }

  const warning = getContextWarning(pctRemaining, tokensUsed, maxTokens, state.id, toolName ?? "Unknown");
  if (warning) {
    hookLog("warn", "context_monitor", `Context at ${pctRemaining}%, emitting warning`, { stderr: false });
    emitContext(warning);
  }
}

runHook(main, "context_monitor");
