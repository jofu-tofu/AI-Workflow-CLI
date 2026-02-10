#!/usr/bin/env bun
/**
 * Save a handoff document with folder-based sharding.
 *
 * Usage:
 *   bun .aiwcli/_shared/scripts/save_handoff.ts <context_id> <<'EOF'
 *   # Your handoff markdown content here (with <!-- SECTION: name --> markers)
 *   EOF
 *
 * Or with a file:
 *   bun .aiwcli/_shared/scripts/save_handoff.ts <context_id> < handoff.md
 *
 * This script:
 * 1. Parses sections from incoming markdown using <!-- SECTION: name --> markers
 * 2. Creates a timestamped folder at _output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/
 * 3. Writes sharded files:
 *    - index.md (main entry point with navigation)
 *    - completed-work.md, dead-ends.md, decisions.md, pending.md, context.md
 *    - plan.md (copy of original plan if it exists)
 * 4. Sets handoff_path and handoff_consumed=false in state.json
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { getContext, saveState } from "../lib-ts/context/context-store.js";
import { getHandoffFolderPath, getProjectRoot } from "../lib-ts/base/constants.js";
import { atomicWrite } from "../lib-ts/base/atomic-write.js";
import { logInfo, logWarn, logError } from "../lib-ts/base/logger.js";
import { getGitStatusShort } from "../lib-ts/base/git-state.js";
import { eprint } from "../lib-ts/base/utils.js";

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): [Record<string, string>, string] {
  const frontmatter: Record<string, string> = {};
  let remaining = content;

  if (content.startsWith("---")) {
    const parts = content.split("---", 3);
    if (parts.length >= 3) {
      for (const line of parts[1]!.trim().split("\n")) {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          frontmatter[key] = value;
        }
      }
      remaining = parts[2]!.trim();
    }
  }

  return [frontmatter, remaining];
}

function parseHandoffSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let currentSection: string | null = null;
  const currentContent: string[] = [];

  for (const line of content.split("\n")) {
    const marker = line.trim().match(/<!-- SECTION:\s*(\S+)\s*-->/);
    if (marker) {
      if (currentSection) {
        sections[currentSection] = currentContent.join("\n").trim();
      }
      currentSection = marker[1]!;
      currentContent.length = 0;
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Plan helper
// ---------------------------------------------------------------------------

function getPlanPathFromContext(contextId: string, projectRoot: string): string | null {
  const context = getContext(contextId, projectRoot);
  if (!context?.plan_path) return null;
  try {
    if (fs.existsSync(context.plan_path)) return context.plan_path;
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// File generation
// ---------------------------------------------------------------------------

function generateIndex(
  frontmatter: Record<string, string>,
  sections: Record<string, string>,
  gitStatus: string,
  hasPlan: boolean,
): string {
  const now = new Date();
  const isoStr = now.toISOString();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const lines: string[] = [
    "---",
    "type: handoff",
    `context_id: ${frontmatter["context_id"] ?? "unknown"}`,
    `created_at: ${isoStr}`,
    `session_id: ${frontmatter["session_id"] ?? "unknown"}`,
    `project: ${frontmatter["project"] ?? "unknown"}`,
    `plan_path: ${frontmatter["plan_document"] ?? "none"}`,
    "---",
    "",
    `# Session Handoff - ${dateStr}`,
    "",
  ];

  // Summary
  const summary = (sections["summary"] ?? "").trim();
  if (summary) {
    const summaryText = summary
      .split("\n")
      .filter(l => !l.trim().startsWith("##"))
      .join("\n")
      .trim();
    lines.push("## Summary", summaryText, "");
  }

  // Navigation
  lines.push(
    "## Quick Navigation",
    "",
    "| Document | Purpose | Priority |",
    "|----------|---------|----------|",
    "| [Dead Ends](./dead-ends.md) | Failed approaches - DO NOT RETRY | Read First |",
    "| [Pending](./pending.md) | Next steps and blockers | Action Items |",
    "| [Completed Work](./completed-work.md) | Tasks finished this session | Reference |",
    "| [Decisions](./decisions.md) | Technical choices and rationale | Reference |",
  );

  if (hasPlan) {
    lines.push("| [Plan](./plan.md) | Original plan being implemented | Reference |");
  }

  lines.push(
    "| [Context](./context.md) | External requirements and notes | Reference |",
    "",
    "## Continuation Instructions",
    "",
    "To continue this work in a new session:",
    "1. This index document provides the overview",
    "2. **Read [Dead Ends](./dead-ends.md) first** to avoid repeating failed approaches",
    "3. Check [Pending](./pending.md) for immediate next steps",
    "4. Reference other documents as needed",
    "",
    "## Git Status at Handoff",
    "```",
    gitStatus,
    "```",
    "",
  );

  return lines.join("\n");
}

function writeSectionFile(folder: string, filename: string, title: string, content: string): boolean {
  const text = `# ${title}\n\n${content || "(No content for this section)"}\n`;
  const filePath = path.join(folder, filename);
  const [success, error] = atomicWrite(filePath, text);
  if (!success) {
    logWarn("save_handoff", `Failed to write ${filename}: ${error}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  if (process.argv.length < 3) {
    eprint(
      "Usage: bun save_handoff.ts <context_id> < content.md\n" +
      "       bun save_handoff.ts <context_id> <<'EOF'\n" +
      "       ... markdown content with <!-- SECTION: name --> markers ...\n" +
      "       EOF",
    );
    process.exit(1);
  }

  const contextId = process.argv[2]!;

  // Read content from stdin
  let content: string;
  try {
    content = fs.readFileSync(0, "utf-8");
  } catch {
    logError("save_handoff", "Failed to read from stdin");
    process.exit(1);
    return; // unreachable but makes TS happy
  }

  if (!content.trim()) {
    logError("save_handoff", "No content provided via stdin");
    process.exit(1);
  }

  // Project root via shared utility (checks CLAUDE_PROJECT_DIR, falls back to cwd)
  const projectRoot = getProjectRoot(process.cwd());

  // Verify context exists
  const context = getContext(contextId, projectRoot);
  if (!context) {
    logError("save_handoff", `Context not found: ${contextId}`);
    process.exit(1);
  }

  // Parse frontmatter and sections
  const [frontmatter, body] = parseFrontmatter(content);
  const sections = parseHandoffSections(body);

  logInfo("save_handoff", `Parsed ${Object.keys(sections).length} sections: ${Object.keys(sections).join(", ")}`);

  // Create handoff folder
  const handoffFolder = getHandoffFolderPath(contextId, projectRoot);
  fs.mkdirSync(handoffFolder, { recursive: true });
  logInfo("save_handoff", `Created folder: ${handoffFolder}`);

  // Git status
  const gitStatus = getGitStatusShort(projectRoot);

  // Check for plan
  const planPath = getPlanPathFromContext(contextId, projectRoot);
  const hasPlan = planPath !== null;

  // Copy plan if exists
  if (planPath) {
    try {
      const planContent = fs.readFileSync(planPath, "utf-8");
      const [success, error] = atomicWrite(path.join(handoffFolder, "plan.md"), planContent);
      if (success) {
        logInfo("save_handoff", `Copied plan from ${planPath}`);
      } else {
        logWarn("save_handoff", `Failed to copy plan: ${error}`);
      }
    } catch (e) {
      logWarn("save_handoff", `Failed to read plan: ${e}`);
    }
  }

  // Write index.md
  const indexContent = generateIndex(frontmatter, sections, gitStatus, hasPlan);
  const indexPath = path.join(handoffFolder, "index.md");
  {
    const [success, error] = atomicWrite(indexPath, indexContent);
    if (!success) {
      logError("save_handoff", `Failed to write index.md: ${error}`);
      process.exit(1);
    }
  }

  // Write section files
  const sectionMapping: Record<string, [string, string | null]> = {
    completed: ["completed-work.md", "Work Completed"],
    "dead-ends": ["dead-ends.md", "Dead Ends - Do Not Retry"],
    decisions: ["decisions.md", "Key Decisions"],
    pending: ["pending.md", "Pending Issues"],
    "next-steps": ["pending.md", null],        // Append to pending.md
    files: ["completed-work.md", null],         // Append to completed-work.md
    context: ["context.md", "Context for Future Sessions"],
  };

  // Track accumulated content per file
  const fileContents: Record<string, string[]> = {};

  for (const [sectionName, [filename, title]] of Object.entries(sectionMapping)) {
    const sectionContent = sections[sectionName];
    if (!sectionContent) continue;

    if (title === null) {
      // Append mode
      if (!fileContents[filename]) fileContents[filename] = [];
      fileContents[filename]!.push(sectionContent);
    } else {
      // Write mode with title
      if (!fileContents[filename]) {
        fileContents[filename] = [`# ${title}`, "", sectionContent];
      } else {
        fileContents[filename] = [`# ${title}`, "", ...fileContents[filename]!, "", sectionContent];
      }
    }
  }

  // Write all accumulated content
  for (const [filename, parts] of Object.entries(fileContents)) {
    const filePath = path.join(handoffFolder, filename);
    const [success, error] = atomicWrite(filePath, parts.join("\n") + "\n");
    if (!success) {
      logWarn("save_handoff", `Failed to write ${filename}: ${error}`);
    }
  }

  // Ensure all expected files exist (even if empty)
  const expectedFiles: Record<string, string> = {
    "completed-work.md": "Work Completed",
    "dead-ends.md": "Dead Ends - Do Not Retry",
    "decisions.md": "Key Decisions",
    "pending.md": "Pending Issues & Next Steps",
    "context.md": "Context for Future Sessions",
  };

  for (const [filename, title] of Object.entries(expectedFiles)) {
    const filePath = path.join(handoffFolder, filename);
    if (!fs.existsSync(filePath)) {
      writeSectionFile(handoffFolder, filename, title, "");
    }
  }

  // Set handoff_path and handoff_consumed=false in state.json
  try {
    const indexPathStr = path.join(handoffFolder, "index.md");
    const state = getContext(contextId, projectRoot);
    if (state) {
      state.handoff_path = indexPathStr;
      state.handoff_consumed = false;
      const [ok, err] = saveState(contextId, state, projectRoot);
      if (ok) {
        logInfo("save_handoff", `Set handoff_path: ${indexPathStr}`);
      } else {
        logWarn("save_handoff", `Failed to save state: ${err}`);
      }
    } else {
      logWarn("save_handoff", `Could not load context state for ${contextId}`);
    }
  } catch (e) {
    logWarn("save_handoff", `Handoff saved but auto-resume won't work (context update failed): ${e}`);
  }

  // Output success message
  console.log(`[OK] Created handoff folder: ${handoffFolder}`);
  console.log("  - index.md (entry point with navigation)");

  const filesCreated = fs.readdirSync(handoffFolder)
    .filter(f => f !== "index.md" && fs.statSync(path.join(handoffFolder, f)).isFile())
    .sort();
  console.log(`  - ${filesCreated.join(", ")}`);

  console.log("");
  console.log("Handoff document saved. Use this folder for context in the next session.");
}

main();
