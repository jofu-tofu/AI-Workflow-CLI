#!/usr/bin/env bun
/**
 * SubagentStop Hook: Plan Quality Review Context
 *
 * Fires after Plan subagent completes. Emits plan quality review guidance
 * as context for the main agent to review the plan before ExitPlanMode.
 *
 * Design:
 * - Never blocks (all errors exit 0)
 * - Emits context via emitContext() — no file mutation
 * - Only fires for Plan subagents
 */

import {
  loadHookInput,
  runHook,
  logInfo,
  emitContext,
} from "../../_shared/lib-ts/base/hook-utils.js";
import { isInternalCall } from "../../_shared/lib-ts/base/subprocess-utils.js";
import { getPlanQualityReviewContext } from "../lib-ts/plan-enhancement.js";

function main(): void {
  if (isInternalCall()) return;

  const payload = loadHookInput();
  if (!payload) return;

  const agentType = payload.agent_type;
  if (agentType !== "Plan") {
    return; // Only emit for Plan agents
  }

  logInfo("enhance_plan", "Emitting plan quality review context");
  emitContext(getPlanQualityReviewContext());
}

runHook(main, "enhance_plan_post_subagent");
