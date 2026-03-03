#!/usr/bin/env bun
/**
 * Save a handoff document with folder-based sharding.
 *
 * Usage:
 *   bun .aiwcli/_shared/skills/handoff-system/scripts/save_handoff.ts <<'EOF'
 *   # Your handoff markdown content here (with <!-- SECTION: name --> markers)
 *   EOF
 *
 * Or with a file:
 *   bun .aiwcli/_shared/skills/handoff-system/scripts/save_handoff.ts < handoff.md
 *
 * This script:
 * 1. Auto-resolves the active context ID
 * 2. Parses sections from incoming markdown using <!-- SECTION: name --> markers
 * 3. Creates a timestamped folder at _output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/
 * 4. Writes sharded files:
 *    - index.md (main entry point with navigation)
 *    - completed-work.md, dead-ends.md, decisions.md, pending.md, context.md
 *    - plan.md (copy of original plan if it exists)
 * 5. Sets handoff_path and handoff_consumed=false in state.json
 */
import * as fs from "node:fs";
import path from "node:path";

import { getContext, saveState, getContextBySessionId, getAllContexts } from "../../../lib-ts/context/context-store.js";
import { atomicWrite } from "../../../lib-ts/runtime/atomic-write.js";
import { getHandoffFolderPath, getProjectRoot } from "../../../lib-ts/runtime/constants.js";
import { getGitStatusShort } from "../../../lib-ts/runtime/git-state.js";
import { logInfo, logWarn, logError } from "../../../lib-ts/runtime/logger.js";
import { eprint } from "../../../lib-ts/runtime/utils.js";

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): [Record<string, string>, string] {
  const frontmatter: Record<string, string> = {};
  let remaining = content;

  if (content.startsWith("---")) {
    const parts = content.split("---", 3);
    if (parts.length >= 3) {
      for (const line of parts[1]!.trim().split(/\r?\n/)) {
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

  for (const line of content.split(/\r?\n/)) {
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
      .split(/\r?\n/)
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
  // Project root via shared utility (checks CLAUDE_PROJECT_DIR, falls back to cwd)
  const projectRoot = getProjectRoot(process.cwd());

  // Read content from stdin FIRST (needed to extract session_id from frontmatter)
  let content: string;
  try {
    content = fs.readFileSync(0, "utf8");
  } catch {
    logError("save_handoff", "Failed to read from stdin");
    process.exit(1);
    return; // unreachable but makes TS happy
  }

  if (!content.trim()) {
    logError("save_handoff", "No content provided via stdin");
    process.exit(1);
  }

  // Parse frontmatter to extract session_id and context_id
  const [frontmatter, body] = parseFrontmatter(content);
  const frontmatterSessionId = frontmatter["session_id"] || null;
  const frontmatterContextId = frontmatter["context_id"] || null;

  // Parse arguments
  let explicitContextId: string | null = null;
  let explicitSessionId: string | null = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--context-id" && i + 1 < args.length) {
      explicitContextId = args[i + 1];
    } else if (args[i] === "--session-id" && i + 1 < args.length) {
      explicitSessionId = args[i + 1];
    }
  }

  // Six-tier context resolution:
  // 1a. Explicit --context-id argument
  // 1b. Explicit --session-id argument
  // 2a. session_id from frontmatter (piped through handoff content)
  // 2b. context_id from frontmatter (piped through handoff content)
  // 3. CLAUDE_SESSION_ID environment variable
  // 4. Most recent active context (fallback)
  let context: ReturnType<typeof getContext> = null;
  let contextId: string;

  if (explicitContextId) {
    // Tier 1a: Explicit context ID argument
    context = getContext(explicitContextId, projectRoot);
    if (!context) {
      eprint(`Context not found: ${explicitContextId}`);
      process.exit(1);
    }
    contextId = context.id;
    logInfo("save_handoff", `Resolved context via --context-id argument: ${contextId}`);
  } else if (explicitSessionId) {
    // Tier 1b: Explicit session ID argument
    context = getContextBySessionId(explicitSessionId, projectRoot);
    if (!context) {
      eprint(`No context found for session: ${explicitSessionId} (from --session-id argument)`);
      process.exit(1);
    }
    contextId = context.id;
    logInfo("save_handoff", `Resolved context via --session-id argument: ${explicitSessionId} -> ${contextId}`);
  } else if (frontmatterSessionId) {
    // Tier 2a: Frontmatter session_id (piped data)
    context = getContextBySessionId(frontmatterSessionId, projectRoot);
    if (!context) {
      eprint(`No context found for session: ${frontmatterSessionId} (from frontmatter)`);
      process.exit(1);
    }
    contextId = context.id;
    logInfo("save_handoff", `Resolved context via frontmatter session_id: ${frontmatterSessionId} -> ${contextId}`);
  } else if (frontmatterContextId) {
    // Tier 2b: Frontmatter context_id (piped data)
    context = getContext(frontmatterContextId, projectRoot);
    if (!context) {
      eprint(`No context found for context_id: ${frontmatterContextId} (from frontmatter)`);
      process.exit(1);
    }
    contextId = context.id;
    logInfo("save_handoff", `Resolved context via frontmatter context_id: ${frontmatterContextId}`);
  } else {
    const envSessionId = process.env.CLAUDE_SESSION_ID;
    if (envSessionId) {
      // Tier 2b: Environment variable
      context = getContextBySessionId(envSessionId, projectRoot);
      if (!context) {
        eprint(`No context found for session: ${envSessionId}`);
        process.exit(1);
      }
      contextId = context.id;
      logInfo("save_handoff", `Resolved context via CLAUDE_SESSION_ID env var: ${envSessionId} -> ${contextId}`);
    } else {
      // Tier 3: Fallback to most recent active context
      const activeContexts = getAllContexts("active", projectRoot);
      if (activeContexts.length === 0) {
        eprint("No active context found. Use --context-id or --session-id to specify explicitly.");
        eprint("Example: bun save_handoff.ts --session-id abc-123-def < handoff.md");
        eprint("      or: bun save_handoff.ts --context-id 260215-1234-my-context < handoff.md");
        process.exit(1);
      }
      context = activeContexts[0]!; // getAllContexts sorts by last_active descending
      contextId = context.id;
      logInfo("save_handoff", `Resolved context via fallback (most recent active): ${contextId}`);
    }
  }

  // Parse sections from body
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

  // Write updated plan if Claude provided it
  if (sections["plan"]) {
    try {
      const updatedPlan = sections["plan"];

      // Write to original plan path if it exists
      if (planPath) {
        const [success, error] = atomicWrite(planPath, updatedPlan);
        if (success) {
          logInfo("save_handoff", `Plan updated at ${planPath}`);
        } else {
          logWarn("save_handoff", `Failed to update original plan: ${error}`);
        }
      }

      // Write to handoff folder
      const handoffPlanPath = path.join(handoffFolder, "plan.md");
      const [success, error] = atomicWrite(handoffPlanPath, updatedPlan);
      if (success) {
        logInfo("save_handoff", `Plan copied to handoff folder`);
      } else {
        logWarn("save_handoff", `Failed to copy plan to handoff: ${error}`);
      }
    } catch (error) {
      logWarn("save_handoff", `Plan update failed (non-critical): ${error}`);
    }
  } else if (planPath) {
    // Fallback: copy unchanged plan if Claude didn't provide an update
    try {
      const planContent = fs.readFileSync(planPath, "utf8");
      const [success, error] = atomicWrite(path.join(handoffFolder, "plan.md"), planContent);
      if (success) {
        logInfo("save_handoff", `Copied unchanged plan from ${planPath}`);
      } else {
        logWarn("save_handoff", `Failed to copy plan: ${error}`);
      }
    } catch (error) {
      logWarn("save_handoff", `Failed to read plan: ${error}`);
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
    } else if (!fileContents[filename]) {
      // Write mode with title — new file
      fileContents[filename] = [`# ${title}`, "", sectionContent];
    } else {
      // Write mode with title — prepend to existing
      fileContents[filename] = [`# ${title}`, "", ...fileContents[filename]!, "", sectionContent];
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

  // Set handoff_path and work_consumed=false in state.json
  // Latest artifact wins: clear plan if it exists
  try {
    const indexPathStr = path.join(handoffFolder, "index.md");
    const state = getContext(contextId, projectRoot);
    if (state) {
      // Latest artifact wins: clear plan if it exists
      if (state.plan_path || state.plan_hash) {
        logInfo("save_handoff", "Handoff replaces existing plan (latest wins)");
        state.plan_path = null;
        state.plan_hash = null;
        state.plan_signature = null;
        state.plan_id = null;
        state.plan_anchors = [];
        state.plan_hash_consumed = null;
      }

      state.handoff_path = indexPathStr;
      state.work_consumed = false; // CHANGED: unified flag
      state.next_artifact_type = "handoff";

      const [ok, err] = saveState(contextId, state, projectRoot);
      if (ok) {
        logInfo("save_handoff", `Set handoff as staged artifact`);
      } else {
        logWarn("save_handoff", `Failed to save state: ${err}`);
      }
    } else {
      logWarn("save_handoff", `Could not load context state for ${contextId}`);
    }
  } catch (error) {
    logWarn("save_handoff", `Handoff saved but auto-resume won't work: ${error}`);
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


