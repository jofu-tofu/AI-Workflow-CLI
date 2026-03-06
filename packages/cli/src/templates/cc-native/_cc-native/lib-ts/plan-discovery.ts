/**
 * Plan file discovery: find, read, and hash the plan file.
 * Extracted from cc-native-plan-review.ts.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { DiscoveredPlan } from "./types.js";
import { logInfo, logDebug } from "../../_core/lib-ts/runtime/logger.js";
import { findPlanPathInTranscript } from "../../_core/lib-ts/context/plan-manager.js";


const HOOK = "plan-discovery";

/**
 * Find the most recently modified plan file in ~/.claude/plans/.
 */
export function findPlanFile(): string | null {
  const plansDir = path.join(os.homedir(), ".claude", "plans");
  if (!fs.existsSync(plansDir)) return null;
  const files = fs.readdirSync(plansDir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const p = path.join(plansDir, f);
      return { path: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0]!.path : null;
}

/**
 * Compute a short SHA-256 hash of plan content.
 */
export function computePlanHash(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex").slice(0, 16);
}

/**
 * Discover the plan file, read its content, and compute its hash.
 * Prefers transcript-based discovery (session-accurate), falls back to mtime scan.
 */
export function discoverPlan(transcriptPath?: string): DiscoveredPlan | null {
  let planPath: string | null = null;

  if (transcriptPath) {
    planPath = findPlanPathInTranscript(transcriptPath);
    if (planPath) {
      logInfo(HOOK, `Found plan via transcript: ${planPath}`);
    } else {
      logDebug(HOOK, "No plan Write found in transcript, falling back to mtime scan");
    }
  }

  if (!planPath) {
    planPath = findPlanFile();
  }

  if (!planPath) return null;

  let content: string;
  try {
    content = fs.readFileSync(planPath, "utf-8").trim();
  } catch {
    return null;
  }

  if (!content) return null;

  logInfo(HOOK, `Found plan at: ${planPath}`);
  logDebug(HOOK, `Plan length: ${content.length} chars`);

  return {
    path: planPath,
    content,
    hash: computePlanHash(content),
  };
}
