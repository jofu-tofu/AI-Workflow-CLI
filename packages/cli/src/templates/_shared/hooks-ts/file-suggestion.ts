#!/usr/bin/env bun
/**
 * fileSuggestion hook: Suggest context-relevant files for Claude's file inclusion.
 * Outputs a plain JSON array (NOT hookSpecificOutput).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { getContextFilePath, getContextHandoffsDir, getContextPlansDir, getContextReviewsDir, getProjectRoot } from "../lib-ts/base/constants.js";
import { loadHookInput, logDebug, logError, runHook } from "../lib-ts/base/hook-utils.js";
import { getAllContexts, getContextBySessionId } from "../lib-ts/context/context-store.js";
import type { ContextState } from "../lib-ts/types.js";

/** Get .md files sorted by mtime descending */
function getMdFilesByMtime(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const mdFiles = entries
      .filter(e => e.isFile() && e.name.endsWith(".md"))
      .map(e => {
        const fullPath = path.join(dir, e.name);
        const stat = fs.statSync(fullPath);
        return { path: fullPath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    return mdFiles.map(f => f.path);
  } catch {
    return [];
  }
}

/** Find latest folder-based document (subdirectory with index.md) */
function getLatestFolderDoc(dir: string): null | string {
  try {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const subdirs = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const indexPath = path.join(dir, e.name, "index.md");
        if (fs.existsSync(indexPath)) {
          const stat = fs.statSync(indexPath);
          return { path: indexPath, mtime: stat.mtimeMs };
        }

        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.mtime - a.mtime);
    return subdirs.length > 0 ? subdirs[0].path : null;
  } catch {
    return null;
  }
}

function main(): void {
  const payload = loadHookInput();
  if (!payload) {
    console.log("[]");
    return;
  }

  try {
    const projectRoot = getProjectRoot(payload.cwd);
    const sessionId = payload.session_id;

    // Find active context
    let ctx: ContextState | null = null;

    if (sessionId) {
      ctx = getContextBySessionId(sessionId, projectRoot);
    }

    // Fallback: single active (non-idle) context
    if (!ctx) {
      const all = getAllContexts("active", projectRoot);
      const active = all.filter(c => c.status === "active" && c.mode !== "idle");
      if (active.length === 1) {
        ctx = active[0];
      } else {
        logDebug("file-suggestion", `Ambiguous: ${active.length} active non-idle contexts`);
        console.log("[]");
        return;
      }
    }

    const suggestions: string[] = [];

    // Context file
    const ctxFile = getContextFilePath(ctx.id, projectRoot);
    if (fs.existsSync(ctxFile)) suggestions.push(ctxFile);

    // Plan files (most recent first)
    const plansDir = getContextPlansDir(ctx.id, projectRoot);
    suggestions.push(...getMdFilesByMtime(plansDir));

    // Handoff files (prefer folder-based)
    const handoffsDir = getContextHandoffsDir(ctx.id, projectRoot);
    const latestHandoff = getLatestFolderDoc(handoffsDir);
    if (latestHandoff) {
      suggestions.push(latestHandoff);
    } else {
      // Legacy: only most recent flat .md file
      const legacyHandoffs = getMdFilesByMtime(handoffsDir);
      if (legacyHandoffs.length > 0) suggestions.push(legacyHandoffs[0]);
    }

    // Review files (prefer folder-based under cc-native/)
    const reviewsDir = getContextReviewsDir(ctx.id, projectRoot);
    const ccNativeReviews = path.join(reviewsDir, "cc-native");
    const latestReview = getLatestFolderDoc(ccNativeReviews);
    if (latestReview) {
      suggestions.push(latestReview);
    } else {
      // Fallback to flat review.md files
      suggestions.push(...getMdFilesByMtime(reviewsDir));
    }

    // Limit to 10
    const limited = suggestions.slice(0, 10);
    console.log(JSON.stringify(limited));
  } catch (error) {
    // Must output valid JSON array even on error — Claude Code expects it
    logError("file-suggestion", `Error: ${error}`);
    console.log("[]");
  }
}

runHook(main, "file-suggestion");
