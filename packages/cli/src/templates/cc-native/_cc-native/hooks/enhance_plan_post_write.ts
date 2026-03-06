#!/usr/bin/env bun
/**
 * PostToolUse:Write Hook: Plan Quality Review Context
 *
 * Fires after Write tool completes. Detects writes to ~/.claude/plans/*.md files
 * and emits plan quality review guidance as context.
 *
 * Design:
 * - Never blocks (all paths exit 0)
 * - Uses normalized path comparison (cross-platform)
 * - Shares prompt logic with SubagentStop hook via plan-enhancement.ts
 * - Emits context via emitContext() — no file mutation
 */

import * as os from "node:os";
import * as path from "node:path";

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

  const toolInput = payload.tool_input;
  if (!toolInput || typeof toolInput !== "object") return;

  const filePath = toolInput.file_path as string | undefined;
  if (!filePath) return;

  // Normalize paths for cross-platform comparison
  const normalizedPath = path.normalize(path.resolve(filePath));
  const plansDir = path.normalize(path.join(os.homedir(), ".claude", "plans"));

  // Check if file is a markdown file in the plans directory
  if (!normalizedPath.startsWith(plansDir) || !normalizedPath.endsWith(".md")) {
    return;
  }

  logInfo("enhance_plan_write", `Detected plan file write: ${filePath}`);
  emitContext(getPlanQualityReviewContext());
}

runHook(main, "enhance_plan_post_write");
