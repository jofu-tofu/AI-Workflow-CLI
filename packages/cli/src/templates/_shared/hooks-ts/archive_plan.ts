#!/usr/bin/env bun
/**
 * PermissionRequest:ExitPlanMode hook: Archive plan file to context's plans/ folder.
 * Runs before user accepts/rejects. Silent output.
 * Uses top-level await because archivePlan is async.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

import {
  archivePlan, extractPlanPathFromResult, findPlanPathInTranscript,
} from "../lib-ts/context/plan-manager.js";
import {
  loadHookInput, logDebug, logError, logInfo, logWarn, requireBoundSession, runHookAsync,
} from "../lib-ts/hooks/hook-utils.js";
import { getContextDir } from "../lib-ts/runtime/constants.js";

/** Find the most recent .md file in a directory */
function mostRecentMd(dir: string): null | string {
  try {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let best: null | { mtime: number; path: string; } = null;
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".md")) continue;
      const fullPath = path.join(dir, e.name);
      const stat = fs.statSync(fullPath);
      if (!best || stat.mtimeMs > best.mtime) {
        best = { path: fullPath, mtime: stat.mtimeMs };
      }
    }

    return best?.path ?? null;
  } catch {
    return null;
  }
}

/** Multi-strategy plan path discovery */
function findPlanPath(payload: Record<string, unknown>, projectRoot: string): null | string {
  const toolResult = payload.tool_result as string | undefined;
  const toolInput = (payload.tool_input ?? {}) as Record<string, unknown>;
  const transcriptPath = payload.transcript_path as string | undefined;

  // Strategy 1: Extract from tool result
  if (toolResult) {
    const fromResult = extractPlanPathFromResult(toolResult);
    if (fromResult) {
      logDebug("archive_plan", `Found plan path in tool_result: ${fromResult}`);
      return fromResult;
    }
  }

  // Strategy 2: Check tool_input fields
  const inputPath = (toolInput.plan_path ?? toolInput.planPath) as string | undefined;
  if (inputPath) {
    logDebug("archive_plan", `Found plan path in tool_input: ${inputPath}`);
    return inputPath;
  }

  // Strategy 3: Parse transcript for most recent Write to .claude/plans/
  if (transcriptPath) {
    const fromTranscript = findPlanPathInTranscript(transcriptPath);
    if (fromTranscript) return fromTranscript;
  }

  // Strategy 4: Most recent .md in ~/.claude/plans/
  const claudePlansDir = path.join(os.homedir(), ".claude", "plans");
  const recentPlan = mostRecentMd(claudePlansDir);
  if (recentPlan) {
    logDebug("archive_plan", `Found plan in ~/.claude/plans/: ${recentPlan}`);
    return recentPlan;
  }

  // Strategy 5: Fallback paths
  const fallbacks = [
    path.join(projectRoot, "_output", "cc-native", "plans", "current-plan.md"),
    path.join(projectRoot, "_output", "plans", "current-plan.md"),
    path.join(projectRoot, "plan.md"),
  ];
  for (const fb of fallbacks) {
    if (fs.existsSync(fb)) {
      logDebug("archive_plan", `Found plan at fallback: ${fb}`);
      return fb;
    }
  }

  return null;
}

async function asyncMain(): Promise<void> {
  const payload = loadHookInput();
  if (!payload) return;

  // Validate event
  if (payload.hook_event_name !== "PermissionRequest" || payload.tool_name !== "ExitPlanMode") {
    return;
  }

  // Check stop flag
  if ((payload as unknown).stop_hook_active) {
    logDebug("archive_plan", "stop_hook_active set, skipping");
    return;
  }

  const bound = requireBoundSession("archive_plan", payload);
  if (!bound) return;
  const { projectRoot, state } = bound;

  // Find plan path
  let planPath = findPlanPath(payload as Record<string, unknown>, projectRoot);
  if (!planPath) {
    logWarn("archive_plan", "Could not locate plan file");
    return;
  }

  // Resolve to absolute
  if (!path.isAbsolute(planPath)) {
    planPath = path.resolve(projectRoot, planPath);
  }

  // Verify exists
  if (!fs.existsSync(planPath)) {
    logWarn("archive_plan", `Plan file not found: ${planPath}`);
    return;
  }

  // Archive the plan (async — uses AI for slug generation)
  const [archivedPath, planHash, _planSignature] = await archivePlan(planPath, state.id, projectRoot);

  if (archivedPath) {
    // Clean up debug logs (best effort, matches Python behavior)
    try {
      const ctxDir = getContextDir(state.id, projectRoot);
      const debugDir = path.join(ctxDir, "debug");
      if (fs.existsSync(debugDir)) {
        fs.rmSync(debugDir, { recursive: true, force: true });
      }
    } catch { /* best effort */ }

    logInfo("archive_plan", `Archived plan to ${archivedPath} (hash=${planHash})`);
  } else {
    logError("archive_plan", "archivePlan returned null");
  }
}

runHookAsync(asyncMain, "archive_plan");


