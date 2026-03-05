#!/usr/bin/env bun
/**
 * TranscriptLoader — Loads and formats transcript segments for deep reading.
 *
 * Given a session JSONL file path + optional line range, streams the file,
 * filters to human-readable content (user + assistant messages), summarizes
 * tool calls, and truncates to ~50K chars max.
 *
 * Usage:
 *   bun transcript-loader.ts <jsonl-path>
 *   bun transcript-loader.ts <jsonl-path> --lines=46-120
 */

import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";

import { logInfo, logError } from "./logger.js";
import { MAX_LOADER_CHARS, type LoadedSegment } from "./types.js";

const HOOK_NAME = "rlm_loader";

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const jsonlPath = args.find((a) => !a.startsWith("--"));
const linesArg = args.find((a) => a.startsWith("--lines="));
let lineRange: [number, number] | null = null;
if (linesArg) {
  const [start, end] = linesArg.split("=")[1].split("-").map(Number);
  if (!isNaN(start) && !isNaN(end) && start >= 1 && end >= start) {
    lineRange = [start, end];
  }
}

if (jsonlPath && !process.env.RLM_LIB_MODE) {
  try {
    const seg = await loadTranscript(jsonlPath, lineRange);
    process.stdout.write(seg.content);
    if (seg.truncated) {
      logInfo(HOOK_NAME, "Output truncated at 50K chars", { stderr: true });
    }
  } catch (error) {
    logError(HOOK_NAME, `Load failed: ${error}`, { stderr: true });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

async function loadTranscript(
  filePath: string,
  range: [number, number] | null = null,
  maxChars: number = MAX_LOADER_CHARS,
): Promise<LoadedSegment> {
  const parts: string[] = [];
  let totalChars = 0;
  let truncated = false;
  let lineNum = 0;
  let sessionId = "";
  let project = "";

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      lineNum++;

      // Skip lines outside range
      if (range) {
        if (lineNum < range[0]) continue;
        if (lineNum > range[1]) break;
      }

      if (!line.trim()) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      // Capture session metadata
      if (!sessionId && obj.sessionId) {
        sessionId = obj.sessionId as string;
      }

      const type = obj.type as string | undefined;
      const timestamp = obj.timestamp as string | undefined;

      if (type === "user") {
        const msg = obj.message as Record<string, unknown> | undefined;
        if (!msg) continue;
        const content = extractContent(msg);
        if (!content) continue;

        const formatted = formatMessage("USER", timestamp, content);
        if (totalChars + formatted.length > maxChars) {
          truncated = true;
          break;
        }
        parts.push(formatted);
        totalChars += formatted.length;
      } else if (type === "assistant") {
        const msg = obj.message as Record<string, unknown> | undefined;
        if (!msg) continue;
        const { text, toolUses } = extractAssistantContent(msg);

        if (text || toolUses.length > 0) {
          const formatted = formatAssistantMessage(timestamp, text, toolUses);
          if (totalChars + formatted.length > maxChars) {
            truncated = true;
            // Add what we can
            const remaining = maxChars - totalChars;
            if (remaining > 100) {
              parts.push(formatted.slice(0, remaining) + "\n... [truncated]");
            }
            break;
          }
          parts.push(formatted);
          totalChars += formatted.length;
        }
      }
    }
  } finally {
    rl.close();
  }

  // Derive project from path
  const pathParts = filePath.replaceAll('\\', "/").split("/");
  const projectsIdx = pathParts.indexOf("projects");
  if (projectsIdx !== -1 && projectsIdx + 1 < pathParts.length) {
    project = pathParts[projectsIdx + 1];
  }

  return {
    session_id: sessionId || basename(filePath, ".jsonl"),
    project,
    line_range: range,
    content: parts.join("\n\n"),
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

function extractContent(msg: Record<string, unknown>): string | null {
  const {content} = msg;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        texts.push(block);
      } else if (typeof block === "object" && block !== null) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          texts.push(b.text);
        }
        // tool_result blocks — include short text content
        if (b.type === "tool_result" && typeof b.content === "string") {
          texts.push(`[Tool result: ${b.content.slice(0, 200)}]`);
        }
      }
    }
    return texts.length > 0 ? texts.join("\n") : null;
  }
  return null;
}

interface ToolUse {
  name: string;
  inputSummary: string;
}

function extractAssistantContent(msg: Record<string, unknown>): {
  text: string;
  toolUses: ToolUse[];
} {
  const {content} = msg;
  let text = "";
  const toolUses: ToolUse[] = [];

  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") {
        texts.push(b.text);
      }
      if (b.type === "tool_use") {
        const name = (b.name as string) || "unknown";
        const input = b.input as Record<string, unknown> | undefined;
        toolUses.push({
          name,
          inputSummary: summarizeToolInput(name, input),
        });
      }
    }
    text = texts.join("\n");
  }

  return { text, toolUses };
}

function summarizeToolInput(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return "";
  switch (toolName) {
    case "Bash": {
      return input.command ? `${(input.command as string).slice(0, 80)}` : "";
    }
    case "Edit": {
      return input.file_path ? `${input.file_path}` : "";
    }
    case "Glob": {
      return input.pattern ? `${input.pattern}` : "";
    }
    case "Grep": {
      return input.pattern ? `/${input.pattern}/` : "";
    }
    case "Read": {
      return input.file_path ? `${input.file_path}` : "";
    }
    case "Task": {
      return input.description ? `${input.description}` : "";
    }
    case "WebFetch": {
      return input.url ? `${input.url}` : "";
    }
    case "WebSearch": {
      return input.query ? `"${input.query}"` : "";
    }
    case "Write": {
      return input.file_path ? `${input.file_path}` : "";
    }
    default: {
      return Object.keys(input).slice(0, 3).join(", ");
    }
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatMessage(role: string, timestamp: string | undefined, content: string): string {
  const ts = timestamp ? `[${timestamp}]` : "";
  return `--- ${role} ${ts} ---\n${content}`;
}

function formatAssistantMessage(
  timestamp: string | undefined,
  text: string,
  toolUses: ToolUse[],
): string {
  const ts = timestamp ? `[${timestamp}]` : "";
  const parts: string[] = [`--- ASSISTANT ${ts} ---`];

  if (text) {
    parts.push(text);
  }

  if (toolUses.length > 0) {
    const toolLines = toolUses.map(
      (t) => `  -> ${t.name}${t.inputSummary ? `: ${t.inputSummary}` : ""}`
    );
    parts.push("Tools used:\n" + toolLines.join("\n"));
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { loadTranscript };

