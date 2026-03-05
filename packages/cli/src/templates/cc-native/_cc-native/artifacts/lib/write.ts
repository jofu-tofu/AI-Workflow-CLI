/**
 * File I/O for review artifacts.
 * Extracted from artifacts.ts.
 */

import * as fs from "node:fs";
import path from "node:path";

import {
  formatCombinedMarkdown,
  buildCombinedJson,
  generateReviewIndex,
} from "./format.js";
import { atomicWrite } from "../../../_core/lib-ts/runtime/atomic-write.js";
import { sanitizeFilename } from "../../../_core/lib-ts/runtime/constants.js";
import { logDebug, logWarn, logError } from "../../../_core/lib-ts/runtime/logger.js";
import { ENABLE_ROBUST_PLAN_WRITES } from "../../lib-ts/constants.js";
import type { CombinedReviewResult, CorroborationResult } from "../../lib-ts/types.js";

// ---------------------------------------------------------------------------
// Artifact Writing
// ---------------------------------------------------------------------------

/**
 * Write combined review artifacts to context reviews folder.
 * Uses atomic writes for critical files when ENABLE_ROBUST_PLAN_WRITES is true.
 */
export function writeCombinedArtifacts(
  base: string,
  plan: string,
  result: CombinedReviewResult,
  payload: Record<string, unknown>,
  settings?: Record<string, unknown>,
  contextReviewsDir?: string,
  reviewFolder?: string,
  iteration?: number,
  corroboration?: CorroborationResult,
): string {
  const outDir = reviewFolder ?? contextReviewsDir;
  if (!outDir) {
    throw new Error("Either contextReviewsDir or reviewFolder is required");
  }

  logDebug("utils", `Using review folder: ${outDir}`);

  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (error: unknown) {
    logError("utils", `Cannot create directory ${outDir}: ${error}`);
    throw error;
  }

  // JSON write
  const jsonPath = path.join(outDir, "review.json");
  const jsonData = buildCombinedJson(result);
  writeFile(jsonPath, JSON.stringify(jsonData, null, 2));

  // Markdown write
  const mdPath = path.join(outDir, "review.md");
  const mdContent = formatCombinedMarkdown(result, settings, corroboration);
  writeFile(mdPath, mdContent);

  // Individual reviewer writes (non-critical)
  const reviewerOutputDir = path.join(outDir, "reviewer-output");
  try {
    fs.mkdirSync(reviewerOutputDir, { recursive: true });
  } catch (error) {
    logWarn("artifacts", `Failed to create reviewer-output dir: ${error}`);
  }
  for (const [name, r] of Object.entries(result.agents)) {
    if (r.data) {
      writeFileNonCritical(
        path.join(reviewerOutputDir, `${sanitizeFilename(name)}.json`),
        JSON.stringify(r.data, null, 2),
      );
    }
  }

  // Generate index.md for folder-based reviews
  if (reviewFolder) {
    const indexContent = generateReviewIndex(result, iteration, settings);
    writeFileNonCritical(path.join(outDir, "index.md"), indexContent);
    return path.join(outDir, "index.md");
  }

  return mdPath;
}

// ---------------------------------------------------------------------------
// File Write Helpers
// ---------------------------------------------------------------------------

export function writeFile(filePath: string, content: string): void {
  try {
    if (ENABLE_ROBUST_PLAN_WRITES) {
      const [success, error] = atomicWrite(filePath, content);
      if (!success) throw new Error(`Atomic write failed: ${error}`);
    } else {
      fs.writeFileSync(filePath, content, "utf8");
    }
  } catch (error: unknown) {
    logError("utils", `Failed to write ${path.basename(filePath)}: ${error}`);
    throw error;
  }
}

export function writeFileNonCritical(filePath: string, content: string): void {
  try {
    if (ENABLE_ROBUST_PLAN_WRITES) {
      const [success, error] = atomicWrite(filePath, content);
      if (!success) {
        logWarn("utils", `Failed to write ${path.basename(filePath)}: ${error}`);
      }
    } else {
      fs.writeFileSync(filePath, content, "utf8");
    }
  } catch (error: unknown) {
    logWarn("utils", `Failed to write ${path.basename(filePath)}: ${error}`);
  }
}


