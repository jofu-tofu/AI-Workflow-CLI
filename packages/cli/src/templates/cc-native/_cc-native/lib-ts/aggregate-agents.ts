/**
 * Agent frontmatter parser — discovers and loads agent configs from markdown files.
 * See cc-native-plan-review-spec.md §4.14
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { logDebug, logInfo, logWarn } from "../../_shared/lib-ts/base/logger.js";
import type { AgentConfig } from "./types.js";

/**
 * Extract simple YAML frontmatter from markdown content.
 * Only handles flat key: value pairs (no nested YAML).
 */
export function extractFrontmatter(
  content: string,
): Record<string, unknown> | null {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return null;

  const frontmatterLines: string[] = [];
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      endIndex = i;
      break;
    }
    const line = lines[i];
    if (line !== undefined) {
      frontmatterLines.push(line);
    }
  }

  if (endIndex === -1) return null;

  const result: Record<string, unknown> = {};
  for (const line of frontmatterLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value: unknown = line.slice(colonIdx + 1).trim();

    // Handle arrays: [item1, item2]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    // Handle booleans
    else if (value === "true") value = true;
    else if (value === "false") value = false;
    // Handle quoted strings
    else if (
      typeof value === "string" &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

/**
 * Extract markdown body after frontmatter.
 */
export function extractBody(content: string): string {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return content;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      return lines
        .slice(i + 1)
        .join("\n")
        .trim();
    }
  }

  return content;
}

/**
 * Discover and load all agent configs from a directory of markdown files.
 * Skips the plan-orchestrator agent. Defaults categories to ["code"].
 *
 * @param agentsDir - Path to agents directory (default: _cc-native/agents/)
 * @returns Array of AgentConfig objects
 */
export function aggregateAgents(agentsDir?: string): AgentConfig[] {
  const dir = agentsDir ?? path.join("_cc-native", "agents");

  if (!fs.existsSync(dir)) {
    logWarn("aggregate", `Agents directory not found: ${dir}`);
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const agents: AgentConfig[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (e: unknown) {
      logWarn("aggregate", `Failed to read ${file}: ${e}`);
      continue;
    }

    const fm = extractFrontmatter(content);
    if (!fm) {
      logDebug("aggregate", `No frontmatter in ${file}, skipping`);
      continue;
    }

    const name = (fm.name as string) ?? path.basename(file, ".md");

    // Skip the plan orchestrator — it's not a reviewer
    if (name === "plan-orchestrator") {
      logDebug("aggregate", `Skipping plan-orchestrator agent`);
      continue;
    }

    const agent: AgentConfig = {
      name,
      model: (fm.model as string) ?? "sonnet",
      focus: (fm.focus as string) ?? "",
      enabled: fm.enabled !== false,
      categories: Array.isArray(fm.categories)
        ? (fm.categories as string[])
        : ["code"],
      description: (fm.description as string) ?? "",
      system_prompt: extractBody(content),
    };

    agents.push(agent);
    logDebug("aggregate", `Loaded agent: ${agent.name} [${agent.categories.join(", ")}]`);
  }

  logInfo("aggregate", `Loaded ${agents.length} agents from ${dir}`);
  return agents;
}

