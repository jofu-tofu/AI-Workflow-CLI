#!/usr/bin/env bun
/**
 * Resume a handoff document by reading all sections and outputting
 * a structured briefing to stdout.
 *
 * Usage:
 *   bun .aiwcli/_shared/scripts/resume_handoff.ts <handoff_folder_or_index>
 *   bun .aiwcli/_shared/scripts/resume_handoff.ts --context <context_id>
 *
 * If no args, auto-discovers the active context and finds the latest handoff.
 *
 * Outputs structured markdown to stdout in priority order,
 * ready to be consumed by the /handoff-resume command template.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { getProjectRoot } from "../lib-ts/base/constants.js";
import { getGitStatusShort } from "../lib-ts/base/git-state.js";
import { eprint } from "../lib-ts/base/utils.js";
import { findActiveContextId } from "../lib-ts/context/context-store.js";
import {
  findLatestHandoff,
  getHandoffPlanReference,
  getHandoffTimestamp,
  readHandoffSections,
} from "../lib-ts/handoff/handoff-reader.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeAge(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0) {
    if (diffHours === 0) {
      return diffMin <= 1 ? "just now" : `${diffMin} minutes ago`;
    }

    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }

  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

/**
 * Count plan completion from plan.md content.
 * Returns [completed, total] or null if no checkboxes found.
 */
function countPlanProgress(planContent: string): [number, number] | null {
  const checked = (planContent.match(/\[x\]/gi) ?? []).length;
  const unchecked = (planContent.match(/\[ \]/g) ?? []).length;
  const total = checked + unchecked;
  if (total === 0) return null;
  return [checked, total];
}

/**
 * Strip the leading H1 title line from section content if present.
 * Handoff section files typically start with "# Title\n\n..."
 */
function stripTitle(content: string): string {
  const lines = content.split("\n");
  if (lines[0]?.startsWith("# ")) {
    // Remove title and leading blank lines
    let i = 1;
    while (i < lines.length && lines[i]!.trim() === "") i++;
    return lines.slice(i).join("\n").trim();
  }

  return content.trim();
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function resolveHandoffFolder(args: string[]): [string, null | string] {
  const projectRoot = getProjectRoot(process.cwd());

  // --context <id>
  const ctxIdx = args.indexOf("--context");
  if (ctxIdx !== -1 && args[ctxIdx + 1]) {
    const contextId = args[ctxIdx + 1]!;
    const folder = findLatestHandoff(contextId, projectRoot);
    if (!folder) {
      eprint(`No handoff folders found for context: ${contextId}`);
      process.exit(1);
    }

    return [folder, contextId];
  }

  // Direct path argument
  if (args.length > 0 && !args[0]!.startsWith("--")) {
    let target = args[0]!;

    // If it's a file (e.g., index.md), use the parent folder
    try {
      const stat = fs.statSync(target);
      if (stat.isFile()) {
        target = path.dirname(target);
      }
    } catch {
      eprint(`Path not found: ${target}`);
      process.exit(1);
    }

    // Verify it looks like a handoff folder (has index.md)
    if (!fs.existsSync(path.join(target, "index.md"))) {
      eprint(`Not a handoff folder (no index.md): ${target}`);
      process.exit(1);
    }

    return [target, null];
  }

  // Auto-discover active context
  const discoveredId = findActiveContextId(projectRoot);
  if (discoveredId) {
    const folder = findLatestHandoff(discoveredId, projectRoot);
    if (!folder) {
      eprint(`No handoff folders found for context: ${discoveredId} (auto-discovered)`);
      process.exit(1);
    }

    return [folder, discoveredId];
  }

  eprint(
    "No active context found.\n\n" +
    "Usage: bun resume_handoff.ts <handoff_folder_or_index>\n" +
    "       bun resume_handoff.ts --context <context_id>",
  );
  process.exit(1);
  return ["", null]; // unreachable
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const [handoffFolder, contextId] = resolveHandoffFolder(args);
  const projectRoot = getProjectRoot(process.cwd());

  // Staleness check
  const timestamp = getHandoffTimestamp(handoffFolder);
  let ageStr = "unknown age";
  let staleWarning = "";
  if (timestamp) {
    ageStr = formatRelativeAge(timestamp);
    const diffDays = Math.floor((Date.now() - timestamp.getTime()) / 86_400_000);
    if (diffDays > 7) {
      staleWarning = `\n> **WARNING:** This handoff is ${diffDays} days old. Git state may have diverged significantly.\n`;
    }
  }

  // Read all sections
  const sections = readHandoffSections(handoffFolder);

  // Plan status
  let planStatus = "No plan document";
  const resolvedContextId = contextId ?? extractContextIdFromIndex(sections.index);
  if (sections.plan) {
    const progress = countPlanProgress(sections.plan);
    if (progress) {
      const [done, total] = progress;
      const pct = Math.round((done / total) * 100);
      planStatus = `${done}/${total} complete (${pct}%)`;
    } else {
      planStatus = "Plan present (no checkboxes)";
    }
  } else if (resolvedContextId) {
    // Check for plan reference in context state
    const planRef = getHandoffPlanReference(handoffFolder, resolvedContextId, projectRoot);
    if (planRef) {
      try {
        const planContent = fs.readFileSync(planRef, "utf8");
        const progress = countPlanProgress(planContent);
        if (progress) {
          const [done, total] = progress;
          const pct = Math.round((done / total) * 100);
          planStatus = `${done}/${total} complete (${pct}%) — from ${path.basename(planRef)}`;
        } else {
          planStatus = `Plan at ${planRef} (no checkboxes)`;
        }
      } catch {
        planStatus = `Plan referenced at ${planRef} (unreadable)`;
      }
    }
  }

  // Git delta
  const currentGit = getGitStatusShort(projectRoot);

  // Build output
  const out: string[] = [];

  out.push(`## Session Resumed from Handoff`, "");
  out.push(`**Source:** \`${path.basename(handoffFolder)}\` (${ageStr})`);
  if (resolvedContextId) out.push(`**Context:** ${resolvedContextId}`);
  out.push(`**Plan Status:** ${planStatus}`);
  if (staleWarning) out.push(staleWarning);
  out.push("", "---", "", "### Dead Ends — Do Not Retry", "");
  if (sections.deadEnds) {
    const content = stripTitle(sections.deadEnds);
    if (content && content !== "(No content for this section)") {
      out.push(content);
    } else {
      out.push("(No dead ends recorded)");
    }
  } else {
    out.push("(No dead-ends.md found)");
  }

  out.push("", "### Pending Items", "");
  if (sections.pending) {
    const content = stripTitle(sections.pending);
    if (content && content !== "(No content for this section)") {
      out.push(content);
    } else {
      out.push("(No pending items)");
    }
  } else {
    out.push("(No pending.md found)");
  }

  out.push("");

  // Priority 3: Plan remaining items (from plan.md in handoff)
  if (sections.plan) {
    const planContent = stripTitle(sections.plan);
    // Extract unchecked items
    const remaining = planContent
      .split("\n")
      .filter(line => /\[ \]/.test(line))
      .map(line => line.trim());
    if (remaining.length > 0) {
      out.push("### Plan — Remaining Items", "");
      for (const item of remaining) {
        out.push(item);
      }

      out.push("");
    }
  }

  // Priority 4: Decisions
  out.push("### Settled Decisions", "");
  if (sections.decisions) {
    const content = stripTitle(sections.decisions);
    if (content && content !== "(No content for this section)") {
      out.push(content);
    } else {
      out.push("(No decisions recorded)");
    }
  } else {
    out.push("(No decisions.md found)");
  }

  out.push("", "### Git Delta Since Handoff", "", "**Current git status:**", "```", currentGit, "```", "", "### Completed Work", "");
  if (sections.completedWork) {
    const content = stripTitle(sections.completedWork);
    if (content && content !== "(No content for this section)") {
      out.push(content);
    } else {
      out.push("(No completed work recorded)");
    }
  } else {
    out.push("(No completed-work.md found)");
  }

  out.push("", "### Context Notes", "");
  if (sections.context) {
    const content = stripTitle(sections.context);
    if (content && content !== "(No content for this section)") {
      out.push(content);
    } else {
      out.push("None");
    }
  } else {
    out.push("None");
  }

  out.push("", "---", "", "**Create ISC tasks** from the pending items and remaining plan items above using TaskCreate. Each task should be ~8 words, state a desired end-state (not an action), and be binary testable.");

  console.log(out.join("\n"));
}

/**
 * Try to extract context_id from index.md frontmatter.
 */
function extractContextIdFromIndex(indexContent: null | string): null | string {
  if (!indexContent) return null;
  if (!indexContent.startsWith("---")) return null;

  const parts = indexContent.split("---", 3);
  if (parts.length < 3) return null;

  for (const line of parts[1]!.trim().split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      if (key === "context_id") {
        return line.slice(colonIdx + 1).trim();
      }
    }
  }

  return null;
}

main();
