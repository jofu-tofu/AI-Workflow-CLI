#!/usr/bin/env bun
/**
 * TranscriptIndexer — Builds lightweight JSON indexes from Claude Code JSONL transcripts.
 *
 * Scans all project directories under ~/.claude/projects/, streams each .jsonl
 * file line-by-line, extracts metadata, and writes per-session index files to
 * ~/.claude/rlm-index/{project-slug}/{session_id}.index.json.
 *
 * Usage:
 *   bun transcript-indexer.ts --batch                    # Index all sessions
 *   bun transcript-indexer.ts --batch --limit=10         # Index first 10 unindexed
 *   bun transcript-indexer.ts --batch --project=aiwcli   # Index matching project only
 */

import { createReadStream, existsSync } from "node:fs";
import { readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { createInterface } from "node:readline";

import { logInfo, logWarn, logError } from "./logger.js";
import {
  CURRENT_SCHEMA_VERSION,
  CLAUDE_PROJECTS_DIR,
  RLM_INDEX_DIR,
  type SessionIndex,
} from "./types.js";

const HOOK_NAME = "rlm_indexer";

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isBatch = args.includes("--batch");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const projectArg = args.find((a) => a.startsWith("--project="));
const projectFilter = projectArg ? projectArg.split("=")[1] : null;

if (isBatch) {
  try {
    await runBatch();
  } catch (error) {
    logError(HOOK_NAME, `Fatal: ${error}`, { stderr: true });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

interface SessionFile {
  project: string;
  sessionId: string;
  jsonlPath: string;
}

async function discoverSessions(): Promise<SessionFile[]> {
  const sessions: SessionFile[] = [];
  let projectDirs: string[];
  try {
    projectDirs = await readdir(CLAUDE_PROJECTS_DIR);
  } catch {
    logWarn(HOOK_NAME, `Cannot read ${CLAUDE_PROJECTS_DIR} — no Claude Code sessions found`);
    return sessions;
  }

  for (const project of projectDirs) {
    if (projectFilter && !project.toLowerCase().includes(projectFilter.toLowerCase())) {
      continue;
    }
    const projectPath = join(CLAUDE_PROJECTS_DIR, project);
    let entries: string[];
    try {
      entries = await readdir(projectPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const sessionId = basename(entry, ".jsonl");
      sessions.push({
        project,
        sessionId,
        jsonlPath: join(projectPath, entry),
      });
    }
  }
  return sessions;
}

function needsIndexing(session: SessionFile, _sourceMtime: number): boolean {
  const indexPath = join(RLM_INDEX_DIR, session.project, `${session.sessionId}.index.json`);
  if (!existsSync(indexPath)) return true;
  try {
    // Fast path: Read only first 100 bytes to check schema_version
    // If version matches, skip without checking mtime (schema bumps trigger full reindex anyway)
    // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef -- dynamic fs for perf
    const nodeFs = require("node:fs");
    const fd = nodeFs.openSync(indexPath, "r");
    const buffer = Buffer.alloc(100);
    const bytesRead = nodeFs.readSync(fd, buffer, 0, 100, 0);
    nodeFs.closeSync(fd);

    const partial = buffer.toString("utf8", 0, bytesRead);
    const versionMatch = partial.match(/"schema_version"\s*:\s*(\d+)/);

    // If version matches, skip (no mtime check needed - schema version bump handles major changes)
    if (versionMatch && parseInt(versionMatch[1], 10) === CURRENT_SCHEMA_VERSION) {
      return false; // Skip - index is current
    }

    // Version mismatch or missing - needs reindex
    return true;
  } catch {
    return true;
  }
}

async function runBatch(): Promise<void> {
  const allSessions = await discoverSessions();
  const filterNote = projectFilter ? ` (filter: ${projectFilter})` : "";
  logInfo(HOOK_NAME, `Discovered ${allSessions.length} sessions${filterNote}`, { stderr: true });

  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  for (const session of allSessions) {
    if (indexed >= limit) break;

    let mtime: number;
    try {
      const st = await stat(session.jsonlPath);
      mtime = st.mtimeMs;
    } catch {
      errors++;
      continue;
    }

    if (!needsIndexing(session, mtime)) {
      skipped++;
      continue;
    }

    try {
      const index = await indexSession(session, mtime);
      if (index.user_message_count === 0 && index.assistant_message_count === 0) {
        skipped++;
        continue;
      }
      await writeIndex(session.project, session.sessionId, index);
      indexed++;
      if (indexed % 10 === 0 || indexed === 1) {
        logInfo(HOOK_NAME, `Indexing: ${indexed} indexed, ${skipped} skipped, ${errors} errors (of ${allSessions.length} total)`, { stderr: true });
      }
    } catch (error) {
      errors++;
      logError(HOOK_NAME, `Error indexing ${session.sessionId}: ${error}`);
    }
  }

  logInfo(HOOK_NAME, `Done. Indexed: ${indexed}, Skipped: ${skipped}, Errors: ${errors}, Total: ${allSessions.length}`, { stderr: true });

  // Output JSON summary to stdout for programmatic consumption
  const summary = { indexed, skipped, errors, total: allSessions.length };
  process.stdout.write(JSON.stringify(summary) + "\n");
}

// ---------------------------------------------------------------------------
// Single session indexer
// ---------------------------------------------------------------------------

async function indexSession(session: SessionFile, sourceMtime: number): Promise<SessionIndex> {
  const index: SessionIndex = {
    schema_version: CURRENT_SCHEMA_VERSION,
    session_id: session.sessionId,
    project: session.project,
    date: "",
    first_timestamp: "",
    line_count: 0,
    summary: "",
    keywords: [],
    user_message_count: 0,
    assistant_message_count: 0,
    tool_calls: [],
    files_touched: [],
    commands_run: [],
    source_mtime: sourceMtime,
    skipped_lines: 0,
    segments: [],
  };

  const toolCallSet = new Set<string>();
  const fileTouchedSet = new Set<string>();
  const commandSet = new Set<string>();
  const keywordBag = new Map<string, number>();
  const userSnippets: string[] = [];

  // Segment tracking
  let currentSegmentStart = 1;
  let segmentKeywordBag = new Map<string, number>(); // per-segment, reset each boundary
  let lastUserMessage = "";
  const SEGMENT_SIZE = 50; // lines per segment

  const rl = createInterface({
    input: createReadStream(session.jsonlPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;

  try {
    for await (const line of rl) {
      lineNum++;
      if (!line.trim()) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        index.skipped_lines++;
        continue;
      }

      const type = obj.type as string | undefined;
      const timestamp = obj.timestamp as string | undefined;

      // Capture first timestamp
      if (timestamp && !index.first_timestamp) {
        index.first_timestamp = timestamp;
        index.date = timestamp.slice(0, 10); // YYYY-MM-DD
      }

      if (type === "user") {
        index.user_message_count++;
        const msg = obj.message as Record<string, unknown> | undefined;
        if (msg) {
          const {content} = msg;
          if (typeof content === "string") {
            const snippet = content.slice(0, 200);
            userSnippets.push(snippet);
            lastUserMessage = snippet;
            extractKeywords(content, keywordBag);
            extractKeywords(content, segmentKeywordBag);
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block === "object" && block !== null && "text" in block) {
                const {text} = (block as Record<string, unknown>);
                if (typeof text === "string") {
                  extractKeywords(text, keywordBag);
                  extractKeywords(text, segmentKeywordBag);
                }
              }
            }
          }
          // Extract cwd for context
          const cwd = obj.cwd as string | undefined;
          if (cwd) {
            const parts = cwd.replaceAll('\\', "/").split("/");
            const last = parts.at(-1);
            if (last) addKeyword(keywordBag, last);
          }
          // Git branch
          const branch = obj.gitBranch as string | undefined;
          if (branch && branch !== "master" && branch !== "main") {
            addKeyword(keywordBag, branch);
          }
        }
      } else if (type === "assistant") {
        index.assistant_message_count++;
        const msg = obj.message as Record<string, unknown> | undefined;
        if (msg) {
          const {content} = msg;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block !== "object" || block === null) continue;
              const b = block as Record<string, unknown>;
              if (b.type === "tool_use") {
                const toolName = b.name as string;
                if (toolName) toolCallSet.add(toolName);
                // Extract file paths and commands from tool inputs
                const input = b.input as Record<string, unknown> | undefined;
                if (input) {
                  extractToolMetadata(toolName, input, fileTouchedSet, commandSet, keywordBag);
                  extractToolMetadata(toolName, input, new Set(), new Set(), segmentKeywordBag);
                }
              }
              if (b.type === "text" && typeof b.text === "string") {
                extractKeywords(b.text, keywordBag);
                extractKeywords(b.text, segmentKeywordBag);
              }
            }
          }
        }
      }

      // Build segments every SEGMENT_SIZE lines
      if (lineNum % SEGMENT_SIZE === 0) {
        if (segmentKeywordBag.size > 0 || lastUserMessage) {
          index.segments.push({
            lines: [currentSegmentStart, lineNum],
            topic: lastUserMessage.slice(0, 100) || "continued work",
            keywords: getTopKeywords(segmentKeywordBag, 10),
          });
        }
        currentSegmentStart = lineNum + 1;
        segmentKeywordBag = new Map<string, number>();
      }
    }
  } finally {
    rl.close();
  }

  // Final segment
  if (lineNum >= currentSegmentStart) {
    index.segments.push({
      lines: [currentSegmentStart, lineNum],
      topic: lastUserMessage.slice(0, 100) || "session end",
      keywords: getTopKeywords(segmentKeywordBag, 10),
    });
  }

  index.line_count = lineNum;
  index.tool_calls = [...toolCallSet].sort();
  index.files_touched = [...fileTouchedSet].slice(0, 50);
  index.commands_run = [...commandSet].slice(0, 30);
  index.keywords = getTopKeywords(keywordBag, 30);

  // Summary: first user message or top keywords
  if (userSnippets.length > 0) {
    index.summary = userSnippets[0].slice(0, 200);
  } else {
    index.summary = index.keywords.slice(0, 5).join(", ") || "empty session";
  }

  return index;
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "all", "also", "an", "and", "are", "as",
  "at", "be", "been", "before", "being", "below", "between", "both", "but",
  "by", "can", "class", "const", "could", "default", "did", "do", "does",
  "during", "each", "either", "every", "export", "false", "few", "for", "from",
  "function", "had", "has", "have", "he", "here", "how",
  "i", "if", "import", "in", "into", "is", "it", "its", "just", "let",
  "may", "me", "might", "more", "most", "must", "my", "neither", "new",
  "no", "nor", "not", "now", "null", "of", "on", "or", "other",
  "our", "return", "shall", "she", "should", "so", "some", "such", "than",
  "that", "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "to", "too", "true", "type", "undefined", "unknown", "var", "very",
  "was", "we", "were", "what", "when", "where", "which",
  "who", "why", "will", "with", "would", "yet", "you", "your",
]);

function extractKeywords(text: string, bag: Map<string, number>): void {
  // Extract meaningful words (3+ chars, not stop words)
  const words = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g);
  if (!words) return;
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    if (w.length > 40) continue; // skip hashes/encoded strings
    addKeyword(bag, w);
  }
}

function addKeyword(bag: Map<string, number>, word: string): void {
  bag.set(word, (bag.get(word) || 0) + 1);
}

function getTopKeywords(bag: Map<string, number>, n: number): string[] {
  return [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word]) => word);
}

// ---------------------------------------------------------------------------
// Tool metadata extraction
// ---------------------------------------------------------------------------

function extractToolMetadata(
  toolName: string,
  input: Record<string, unknown>,
  files: Set<string>,
  commands: Set<string>,
  keywords: Map<string, number>,
): void {
  // File paths from Read, Edit, Write, Glob
  const filePath = input.file_path as string | undefined;
  if (filePath) {
    const normalized = filePath.replaceAll('\\', "/");
    const parts = normalized.split("/");
    const fileName = parts.at(-1);
    if (fileName) {
      files.add(fileName);
      addKeyword(keywords, fileName.replace(/\.[^.]+$/, "")); // stem
    }
  }

  // Glob patterns
  const pattern = input.pattern as string | undefined;
  if (pattern && toolName === "Glob") {
    extractKeywords(pattern, keywords);
  }

  // Grep patterns
  if (toolName === "Grep") {
    const grepPattern = input.pattern as string | undefined;
    if (grepPattern) extractKeywords(grepPattern, keywords);
  }

  // Bash commands
  const command = input.command as string | undefined;
  if (command && toolName === "Bash") {
    // Keep first 100 chars of command
    commands.add(command.slice(0, 100));
    extractKeywords(command, keywords);
  }

  // Task/subagent descriptions
  const description = input.description as string | undefined;
  if (description) extractKeywords(description, keywords);

  const prompt = input.prompt as string | undefined;
  if (prompt) extractKeywords(prompt.slice(0, 500), keywords);
}

// ---------------------------------------------------------------------------
// Index I/O
// ---------------------------------------------------------------------------

async function writeIndex(project: string, sessionId: string, index: SessionIndex): Promise<void> {
  const dir = join(RLM_INDEX_DIR, project);
  await mkdir(dir, { recursive: true });
  const indexPath = join(dir, `${sessionId}.index.json`);
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Exports for programmatic use
// ---------------------------------------------------------------------------

export { discoverSessions, indexSession, needsIndexing, runBatch, writeIndex };


