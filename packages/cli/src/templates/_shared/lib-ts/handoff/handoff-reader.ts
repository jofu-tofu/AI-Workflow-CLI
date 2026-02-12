/**
 * Handoff reader utilities for programmatic resume.
 *
 * Provides functions to find, read, and parse handoff folders
 * created by save_handoff.ts. Used by resume_handoff.ts script
 * and potentially by session_start hooks.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getContextHandoffsDir } from "../base/constants.js";
import { getContext } from "../context/context-store.js";
import type { HandoffSections } from "../types.js";

/**
 * Find the most recent handoff folder for a context.
 * Lists subdirectories in the handoffs dir, sorts by name
 * (YYYY-MM-DD-HHMM format ensures lexicographic = chronological).
 * Returns full path to most recent folder, or null.
 */
export function findLatestHandoff(contextId: string, projectRoot?: string): string | null {
  const handoffsDir = getContextHandoffsDir(contextId, projectRoot);

  try {
    if (!fs.existsSync(handoffsDir)) return null;
    const entries = fs.readdirSync(handoffsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();

    if (entries.length === 0) return null;
    return path.join(handoffsDir, entries[entries.length - 1]!);
  } catch {
    return null;
  }
}

/**
 * Read all section files from a handoff folder, structured by priority.
 * Returns content for each file (null if missing/unreadable).
 */
export function readHandoffSections(handoffFolder: string): HandoffSections {
  const fileMap: Record<keyof HandoffSections, string> = {
    index: "index.md",
    deadEnds: "dead-ends.md",
    pending: "pending.md",
    plan: "plan.md",
    decisions: "decisions.md",
    completedWork: "completed-work.md",
    context: "context.md",
  };

  const sections: HandoffSections = {
    index: null,
    deadEnds: null,
    pending: null,
    plan: null,
    decisions: null,
    completedWork: null,
    context: null,
  };

  for (const [key, filename] of Object.entries(fileMap)) {
    const filePath = path.join(handoffFolder, filename);
    try {
      if (fs.existsSync(filePath)) {
        sections[key as keyof HandoffSections] = fs.readFileSync(filePath, "utf-8");
      }
    } catch {
      // graceful — leave as null
    }
  }

  return sections;
}

/**
 * Parse the handoff folder name to extract creation timestamp.
 * Expects YYYY-MM-DD-HHMM format (with optional -N suffix for collisions).
 */
export function getHandoffTimestamp(handoffFolder: string): Date | null {
  const basename = path.basename(handoffFolder);
  // Match YYYY-MM-DD-HHMM with optional collision suffix
  const match = basename.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    parseInt(year!, 10),
    parseInt(month!, 10) - 1,
    parseInt(day!, 10),
    parseInt(hour!, 10),
    parseInt(minute!, 10),
  );

  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get the plan path referenced by a handoff.
 * First checks plan.md frontmatter for plan_path, then falls back
 * to the context state's plan_path.
 */
export function getHandoffPlanReference(
  handoffFolder: string,
  contextId: string,
  projectRoot?: string,
): string | null {
  // Try plan.md frontmatter
  const planMdPath = path.join(handoffFolder, "plan.md");
  try {
    if (fs.existsSync(planMdPath)) {
      const content = fs.readFileSync(planMdPath, "utf-8");
      const frontmatter = parseFrontmatter(content);
      if (frontmatter["plan_path"]) {
        const pp = frontmatter["plan_path"];
        if (fs.existsSync(pp)) return pp;
      }
    }
  } catch {
    // fall through to context state
  }

  // Fall back to context state
  try {
    const context = getContext(contextId, projectRoot);
    if (context?.plan_path && fs.existsSync(context.plan_path)) {
      return context.plan_path;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Parse YAML-style frontmatter from markdown content.
 * Returns key-value pairs from the --- block.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const frontmatter: Record<string, string> = {};
  if (!content.startsWith("---")) return frontmatter;

  const parts = content.split("---", 3);
  if (parts.length < 3) return frontmatter;

  for (const line of parts[1]!.trim().split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}
