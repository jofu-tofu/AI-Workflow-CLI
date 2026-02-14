#!/usr/bin/env bun
/**
 * SessionStart hook: Restore context after /clear (plan/handoff) or compaction.
 * Routes by source field to appropriate handler.
 */
import {
  loadHookInput, emitContext, runHook, runHookAsync,
  logDebug, logInfo, logError, logDiagnostic,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import {
  getContextBySessionId, getAllContexts, bindSession, updateMode,
} from "../lib-ts/context/context-store.js";
import {
  buildRestoreSections, formatHandoffContinuation, getModeDisplay,
} from "../lib-ts/context/context-formatter.js";
import type { ContextState } from "../lib-ts/types.js";

/**
 * Handle post-compaction restore: re-inject context that was lost during compaction.
 * Plan content is inlined because Claude doesn't auto-paste after compact.
 */
function handleCompactRestore(sessionId: string, projectRoot: string): void {
  const state = getContextBySessionId(sessionId, projectRoot);
  if (!state) {
    logDebug("session_start", `No context for session ${sessionId} (compact)`);
    return;
  }

  const sections: string[] = [
    `## Resuming Context After Compaction: ${state.id}`,
    "",
    `**Summary:** ${state.summary}`,
    `**Mode:** ${getModeDisplay(state.mode) || state.mode}`,
    "",
  ];

  // Inline plan = true (plan not auto-pasted after compact)
  const restore = buildRestoreSections(state, projectRoot, true);
  if (restore) sections.push(restore);

  sections.push(
    "",
    "---",
    "*Context was compacted to free up space. The above restores your working state.*",
  );

  emitContext(sections.join("\n"));
  logInfo("session_start", `Compact restore for ${state.id}`);
}

/**
 * Handle post-clear restore: find staged has_plan or has_handoff context,
 * bind session, transition to active, inject context.
 */
async function handleClearRestore(sessionId: string, projectRoot: string): Promise<void> {
  const allContexts = getAllContexts("active", projectRoot);

  // Priority 1: has_plan contexts
  const hasPlan = allContexts.filter(c => c.mode === "has_plan");
  if (hasPlan.length > 0) {
    // Pick most recently active (getAllContexts sorts by last_active desc)
    const ctx = hasPlan[0]!;

    bindSession(ctx.id, sessionId, projectRoot);
    updateMode(ctx.id, "active", projectRoot, { plan_consumed: true });

    logInfo("session_start", `Clear restore: ${ctx.id} has_plan → active (plan_consumed=true)`);

    const sections: string[] = [
      `## Resuming Context After Plan Clear: ${ctx.id}`,
      "",
      `**Summary:** ${ctx.summary}`,
      `**Mode:** Active (Plan Restored)`,
      "",
    ];

    // inline_plan=false — Claude auto-pastes plan content after /clear
    const restore = buildRestoreSections(ctx, projectRoot, false);
    if (restore) sections.push(restore);

    sections.push(
      "",
      "---",
      "*Plan has been accepted. The plan content was auto-pasted above. Implement according to the plan.*",
    );

    emitContext(sections.join("\n"));
    return;
  }

  // Priority 2: has_handoff contexts
  const hasHandoff = allContexts.filter(c => c.mode === "has_handoff");
  if (hasHandoff.length > 0) {
    const ctx = hasHandoff[0]!;

    bindSession(ctx.id, sessionId, projectRoot);
    updateMode(ctx.id, "active", projectRoot, { handoff_consumed: true });

    logInfo("session_start", `Clear restore: ${ctx.id} has_handoff → active (handoff_consumed=true)`);

    const handoffContent = formatHandoffContinuation(ctx, projectRoot);
    emitContext(handoffContent);
    return;
  }

  // Nothing to restore
  logDebug("session_start", "No has_plan or has_handoff contexts found");
}

async function main(): Promise<void> {
  const payload = loadHookInput();
  if (!payload) return;

  const sessionId = payload.session_id;
  if (!sessionId) {
    logDebug("session_start", "No session_id");
    return;
  }

  const projectRoot = getProjectRoot(payload.cwd);
  const source = payload.source ?? "";

  logDiagnostic("session_start", "entry", `source=${source}, session=${sessionId}`);

  switch (source) {
    case "compact":
      handleCompactRestore(sessionId, projectRoot);
      break;
    case "clear":
      await handleClearRestore(sessionId, projectRoot);
      break;
    default:
      logDebug("session_start", `Unhandled source: ${source}`);
      break;
  }
}

runHookAsync(main, "session_start");
