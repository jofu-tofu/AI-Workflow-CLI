#!/usr/bin/env bun
/**
 * TranscriptSearcher — Keyword/regex search over RLM session indexes.
 *
 * Reads cached index files one-at-a-time from ~/.claude/rlm-index/,
 * scores each against query terms, and returns ranked results.
 *
 * Usage:
 *   bun transcript-searcher.ts "plan review"
 *   bun transcript-searcher.ts "plan review" --top=20
 *   bun transcript-searcher.ts "plan review" --project=aiwcli
 */

import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { logInfo, logWarn, logError, logDebug } from "./logger.js";

const HOOK_NAME = "rlm_searcher";
import {
  CURRENT_SCHEMA_VERSION,
  CLAUDE_PROJECTS_DIR,
  RLM_INDEX_DIR,
  TOP_N_HEAP,
  WEIGHT,
  type SessionIndex,
  type SearchResult,
  type IndexSegment,
} from "./types.js";

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith("--"));
const topArg = args.find((a) => a.startsWith("--top="));
const topN = topArg ? parseInt(topArg.split("=")[1], 10) : 10;
const projectArg = args.find((a) => a.startsWith("--project="));
const projectFilter = projectArg ? projectArg.split("=")[1] : null;

if (query && !process.env.RLM_LIB_MODE) {
  search(query, { topN, projectFilter })
    .then((results) => {
      if (typeof results === "string") {
        logWarn(HOOK_NAME, results, { stderr: true });
        process.exitCode = 1;
      } else {
        logInfo(HOOK_NAME, `Search returned ${results.length} results`);
        process.stdout.write(JSON.stringify(results, null, 2) + "\n");
      }
    })
    .catch((e) => {
      logError(HOOK_NAME, `Search failed: ${e}`, { stderr: true });
      process.exitCode = 1;
    });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface SearchOptions {
  topN?: number;
  projectFilter?: string | null;
}

async function search(
  queryStr: string,
  opts: SearchOptions = {},
): Promise<SearchResult[] | string> {
  const { topN = 10, projectFilter = null } = opts;

  if (!existsSync(RLM_INDEX_DIR)) {
    return "No indexes found. Run `/rlm:index` first to build the transcript index.";
  }

  const queryTerms = tokenize(queryStr);
  if (queryTerms.length === 0) {
    return "Query is empty after tokenization.";
  }

  // Build optional regex from query
  let queryRegex: RegExp | null = null;
  try {
    queryRegex = new RegExp(queryStr, "i");
  } catch {
    // Not a valid regex — fall back to keyword-only matching
  }

  const heap: SearchResult[] = [];
  let indexCount = 0;

  let projectDirs: string[];
  try {
    projectDirs = await readdir(RLM_INDEX_DIR);
  } catch {
    return "Cannot read index directory.";
  }

  for (const project of projectDirs) {
    if (projectFilter && !project.toLowerCase().includes(projectFilter.toLowerCase())) {
      continue;
    }

    const projectPath = join(RLM_INDEX_DIR, project);
    let files: string[];
    try {
      files = await readdir(projectPath);
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.endsWith(".index.json")) continue;

      let idx: SessionIndex;
      try {
        const raw = await readFile(join(projectPath, file), "utf-8");
        idx = JSON.parse(raw) as SessionIndex;
      } catch {
        continue;
      }

      // Skip stale schema
      if (idx.schema_version !== CURRENT_SCHEMA_VERSION) continue;

      indexCount++;
      const { score, matchingSegments } = scoreIndex(idx, queryTerms, queryRegex);

      if (score > 0) {
        const sessionId = file.replace(".index.json", "");
        const sourcePath = join(CLAUDE_PROJECTS_DIR, project, `${sessionId}.jsonl`);
        const result: SearchResult = {
          session_id: idx.session_id || sessionId,
          project: idx.project || project,
          date: idx.date,
          summary: idx.summary,
          score,
          matching_segments: matchingSegments,
          source_path: sourcePath,
          source_exists: existsSync(sourcePath),
          index_path: join(projectPath, file),
        };

        insertSorted(heap, result, TOP_N_HEAP);
      }
    }
  }

  if (indexCount === 0) {
    return "No indexes found. Run `/rlm:index` first to build the transcript index.";
  }

  return heap.slice(0, topN);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Max segment score contribution per query term to prevent inflation. */
const MAX_SEGMENT_HITS_PER_TERM = 2;

function scoreIndex(
  idx: SessionIndex,
  queryTerms: string[],
  queryRegex: RegExp | null,
): { score: number; matchingSegments: IndexSegment[] } {
  let score = 0;
  const matchingSegments: IndexSegment[] = [];

  for (const term of queryTerms) {
    // Summary
    if (idx.summary.toLowerCase().includes(term)) {
      score += WEIGHT.summary;
    }

    // Keywords
    for (const kw of idx.keywords) {
      if (kw.includes(term)) {
        score += WEIGHT.keywords;
        break;
      }
    }

    // Files touched
    for (const f of idx.files_touched) {
      if (f.toLowerCase().includes(term)) {
        score += WEIGHT.filesTouched;
        break;
      }
    }

    // Commands
    for (const cmd of idx.commands_run) {
      if (cmd.toLowerCase().includes(term)) {
        score += WEIGHT.commandsRun;
        break;
      }
    }

    // Tool calls
    for (const tool of idx.tool_calls) {
      if (tool.toLowerCase().includes(term)) {
        score += WEIGHT.toolCalls;
        break;
      }
    }

    // Segments — score and collect matching, capped per term
    let segHits = 0;
    for (const seg of idx.segments) {
      if (segHits >= MAX_SEGMENT_HITS_PER_TERM) break;
      const segMatch =
        seg.topic.toLowerCase().includes(term) ||
        seg.keywords.some((k) => k.includes(term));
      if (segMatch) {
        score += WEIGHT.segmentTopic;
        segHits++;
        if (!matchingSegments.includes(seg)) {
          matchingSegments.push(seg);
        }
      }
    }
  }

  // Regex bonus on summary
  if (queryRegex && queryRegex.test(idx.summary)) {
    score += WEIGHT.summary * 0.5;
  }

  // Recency boost: sessions from last 7 days get 1.5x, last 30 days 1.2x
  if (idx.first_timestamp) {
    const ageMs = Date.now() - new Date(idx.first_timestamp).getTime();
    if (!isNaN(ageMs)) {
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays < 7) score *= 1.5;
      else if (ageDays < 30) score *= 1.2;
    }
  }

  return { score, matchingSegments: matchingSegments.slice(0, 5) };
}

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9_-]/g, ""))
    .filter((t) => t.length >= 2);
}

// ---------------------------------------------------------------------------
// Sorted insertion (descending by score, capped at maxSize)
// ---------------------------------------------------------------------------

function insertSorted(arr: SearchResult[], item: SearchResult, maxSize: number): void {
  // Find insertion point (descending order)
  let i = 0;
  while (i < arr.length && arr[i].score >= item.score) i++;
  arr.splice(i, 0, item);
  if (arr.length > maxSize) arr.pop();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { search, scoreIndex, tokenize, type SearchOptions };
