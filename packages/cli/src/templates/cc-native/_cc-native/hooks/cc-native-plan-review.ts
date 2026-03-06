#!/usr/bin/env bun
/**
 * CC-Native Plan Review Hook (Thin Coordinator)
 *
 * Claude Code PreToolUse hook that intercepts ExitPlanMode and delegates
 * to the review pipeline for plan quality review.
 *
 * Trigger: ExitPlanMode tool use (PreToolUse)
 * Configuration: _cc-native/cc-native.config.json
 * Output: _output/cc-native/plans/{YYYY-MM-DD}/{slug}/reviews/
 */

import { getProjectRoot, getAiwcliDir } from "../../_core/lib-ts/runtime/constants.js";
import {
  loadHookInput,
  runHookAsync,
  logDebug,
  logInfo,
  logWarn,
  emitContext,
  emitContextAndBlock,
} from "../../_core/lib-ts/hooks/hook-utils.js";
import { isInternalCall } from "../../_core/lib-ts/runtime/subprocess-utils.js";
import type { PipelineResult } from "../lib-ts/types.js";
import { runReviewPipeline } from "../plan-review/lib/review-pipeline.js";

const HOOK = "cc-native-plan-review";

async function main(): Promise<void> {
  logInfo(HOOK, "Unified hook started (PreToolUse)");

  if (isInternalCall()) {
    logDebug(HOOK, "Skipping: internal subprocess call");
    return;
  }

  const payload = loadHookInput();
  if (!payload) {
    logInfo(HOOK, "Skipping: Invalid JSON input");
    emitContext("[Plan Review Skipped] Invalid JSON input");
    return;
  }

  if (payload.tool_name !== "ExitPlanMode") {
    logDebug(HOOK, "Skipping: not ExitPlanMode");
    return;
  }

  const sessionId = String(payload.session_id ?? "unknown");
  const base = getProjectRoot(payload.cwd);
  const aiwcliDir = getAiwcliDir(base);

  const result: PipelineResult = await runReviewPipeline({
    sessionId,
    base,
    aiwcliDir,
    transcriptPath: payload.transcript_path as string | undefined,
    payload: payload as Record<string, unknown>,
  });

  switch (result.action) {
    case "block": {
      emitContextAndBlock(result.contextText, result.blockReason);
      break;
    }
    case "skip": {
      logInfo(HOOK, `Skipping: ${result.reason}`);
      emitContext(`[Plan Review Skipped] ${result.reason}`);
      break;
    }
    default: {
      const _exhaustive: never = result;
      logWarn(HOOK, `Unhandled pipeline action: ${(_exhaustive as { action: string }).action}`);
    }
  }
}

runHookAsync(main, "cc_native_plan_review");
