#!/usr/bin/env bun
/**
 * SessionStart hook: Restore context after /clear (plan/handoff) or compaction.
 * Routes by source field to appropriate handler.
 */
import {
  loadHookInput, emitContext, runHook, runHookAsync,
  logDebug, logInfo, logWarn, logError, logDiagnostic,
} from "../lib-ts/base/hook-utils.js";
import { getProjectRoot } from "../lib-ts/base/constants.js";
import {
  getContextBySessionId, getAllContexts, bindSession, updateMode, determineArtifactType,
} from "../lib-ts/context/context-store.js";
import {
  buildRestoreSections, formatHandoffContinuation, getModeDisplay,
  buildContextInventory,
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
    `**Session ID:** ${sessionId}`,
    "",
  ];

  // Inline plan = true (plan not auto-pasted after compact)
  const restore = buildRestoreSections(state, projectRoot, true);
  if (restore) sections.push(restore);

  const inventory = buildContextInventory(state, projectRoot);
  if (inventory) sections.push("", inventory);

  sections.push(
    "",
    "---",
    "*Context was compacted to free up space. The above restores your working state.*",
  );

  emitContext(sections.join("\n"));
  logInfo("session_start", `Compact restore for ${state.id}`);
}

/**
 * Handle post-clear restore: find staged has_staged_work context,
 * bind session, transition to active, inject context.
 */
async function handleClearRestore(
  sessionId: string,
  projectRoot: string,
): Promise<void> {
  const allContexts = getAllContexts("active", projectRoot);

  // Find staged contexts (CHANGED: unified mode search)
  const staged = allContexts.filter((c) => c.mode === "has_staged_work");
  if (staged.length === 0) {
    logDebug("session_start", "No has_staged_work contexts found");
    return;
  }

  // Pick most recent (getAllContexts sorts by last_active desc)
  const ctx = staged[0]!;
  const artifactType = determineArtifactType(ctx);

  // Edge case: has_staged_work mode but no artifacts (corrupted state)
  // Graceful degradation: Reset mode to idle, log warning, skip restoration
  if (!artifactType) {
    logWarn(
      "session_start",
      `has_staged_work context ${ctx.id} has no artifacts - corrupted state, resetting to idle`,
    );
    updateMode(ctx.id, "idle", projectRoot);
    return;
  }

  // Bind and consume (CHANGED: unified flag)
  bindSession(ctx.id, sessionId, projectRoot);
  updateMode(ctx.id, "active", projectRoot, {
    work_consumed: true, // CHANGED: unified flag
    plan_hash_consumed: artifactType === "plan" ? ctx.plan_hash : undefined,
  });

  logInfo(
    "session_start",
    `Restored ${ctx.id}: has_staged_work → active (${artifactType})`,
  );

  // Build context sections (dispatch by artifact type)
  const sections: string[] = [
    `## Resuming Context After ${artifactType === "plan" ? "Plan" : "Handoff"} Clear: ${ctx.id}`,
    "",
    `**Summary:** ${ctx.summary}`,
    `**Mode:** Active (${artifactType === "plan" ? "Plan" : "Handoff"} Restored)`,
    `**Session ID:** ${sessionId}`,
    "",
  ];

  if (artifactType === "plan") {
    // Plan restoration (inline_plan=false, Claude auto-pastes)
    const restore = buildRestoreSections(ctx, projectRoot, false);
    if (restore) sections.push(restore);
  } else {
    // Handoff restoration (inject content via hook)
    const handoffContent = formatHandoffContinuation(ctx, projectRoot);
    sections.push(handoffContent);
  }

  const inventory = buildContextInventory(ctx, projectRoot);
  if (inventory) sections.push("", inventory);

  sections.push(
    "",
    "---",
    artifactType === "plan"
      ? "*Plan has been accepted. The plan content was auto-pasted above. Implement according to the plan.*"
      : "*Handoff document has been loaded. Continue the work from where it was left off.*",
  );

  emitContext(sections.join("\n"));
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
