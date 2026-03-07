#!/usr/bin/env bun
/**
 * Embedding Indexer — Builds vector index from existing JSON session indexes.
 *
 * Reads ~/.claude/rlm-index/{project}/*.index.json (built by /rlm:index),
 * embeds each segment via Ollama nomic-embed-text, and stores vectors in
 * SQLite + sqlite-vec at ~/.claude/rlm-vectors.db.
 *
 * Usage:
 *   bun embedding-indexer.ts --batch                    # Index all sessions
 *   bun embedding-indexer.ts --batch --limit=10         # Index first 10 unindexed
 *   bun embedding-indexer.ts --batch --project=aiwcli   # Index matching project only
 *   bun embedding-indexer.ts --stats                    # Show index statistics
 */

import { readdir } from "fs/promises";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { z } from "zod";
import { RLM_INDEX_DIR, type SessionIndex } from "./types.js";
import { logInfo, logWarn, logError, logDebug } from "./logger.js";
import { checkOllamaHealth, embed } from "./ollama-client.js";
import {
  openVectorDb,
  insertChunks,
  markSessionEmbedded,
  isSessionEmbedded,
  deleteSessionChunks,
  getStats,
  type ChunkRow,
} from "./vector-store.js";
import { loadTranscript } from "./transcript-loader.js";

const HOOK_NAME = "rlm_embed_idx";
const MAX_EMBED_CHARS = 8000;

// Zod schema for SessionIndex validation
const SessionIndexSchema = z.object({
  session_id: z.string(),
  project: z.string(),
  date: z.string(),
  source_mtime: z.number(),
  segments: z.array(z.object({
    lines: z.tuple([z.number(), z.number()]),
    topic: z.string(),
    keywords: z.array(z.string()),
  })),
});
type ValidatedSessionIndex = z.infer<typeof SessionIndexSchema>;

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const isBatch = args.includes("--batch");
const isStats = args.includes("--stats");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;
const projectArg = args.find((a) => a.startsWith("--project="));
const projectFilter = projectArg ? projectArg.split("=")[1] : null;

if (isStats) {
  showStats();
} else if (isBatch) {
  runBatch().catch((e) => {
    logError(HOOK_NAME, `Fatal: ${e}`, { stderr: true });
    process.exitCode = 1;
  });
} else {
  process.stderr.write(
    "Usage: bun embedding-indexer.ts --batch [--limit=N] [--project=name]\n" +
    "       bun embedding-indexer.ts --stats\n",
  );
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function showStats(): void {
  const db = openVectorDb();
  const stats = getStats(db);
  const result = {
    sessions: stats.session_count,
    chunks: stats.chunk_count,
    db_path: db.filename,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  db.close();
}

// ---------------------------------------------------------------------------
// Batch runner
// ---------------------------------------------------------------------------

async function runBatch(): Promise<void> {
  // Check Ollama health first
  const health = await checkOllamaHealth();
  if (!health.ok) {
    logError(HOOK_NAME, health.error ?? "Unknown Ollama health check error", { stderr: true });
    process.exitCode = 1;
    return;
  }

  // Verify rlm-index exists
  if (!existsSync(RLM_INDEX_DIR)) {
    logError(
      HOOK_NAME,
      `No JSON indexes found at ${RLM_INDEX_DIR}. Run \`/rlm:index\` first to build keyword indexes, then re-run \`/rlm:embed-index\`.`,
      { stderr: true },
    );
    process.exitCode = 1;
    return;
  }

  const db = openVectorDb();
  let embedded = 0;
  let skipped = 0;
  let errors = 0;
  let total = 0;

  try {
    // Scan project directories
    const projectDirs = await readdir(RLM_INDEX_DIR, { withFileTypes: true });
    const projects = projectDirs
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => !projectFilter || name.includes(projectFilter));

    for (const project of projects) {
      const projectDir = join(RLM_INDEX_DIR, project);
      const files = await readdir(projectDir);
      const indexFiles = files.filter((f) => f.endsWith(".index.json"));

      for (const indexFile of indexFiles) {
        if (embedded >= limit) break;
        total++;

        const indexPath = join(projectDir, indexFile);

        try {
          const rawJson = JSON.parse(readFileSync(indexPath, "utf-8"));
          const parseResult = SessionIndexSchema.safeParse(rawJson);
          if (!parseResult.success) {
            errors++;
            logWarn(HOOK_NAME, `Invalid index format ${indexFile}: ${parseResult.error.message}`);
            continue;
          }
          const indexData = parseResult.data;

          // Skip if already embedded at same mtime
          if (
            isSessionEmbedded(db, indexData.session_id, project, indexData.source_mtime)
          ) {
            skipped++;
            continue;
          }

          // Re-index: delete old chunks if any
          deleteSessionChunks(db, indexData.session_id, project);

          // Build embedding texts for each segment
          const texts: string[] = [];
          const segmentMeta: Array<{
            index: number;
            lines: [number, number];
            topic: string;
          }> = [];

          for (let i = 0; i < indexData.segments.length; i++) {
            const seg = indexData.segments[i];

            // Load transcript content for this segment
            let content = "";
            try {
              const loaded = await loadTranscript(
                join(
                  // Derive source path from index data
                  // source_path might be stored in the index, otherwise reconstruct
                  getSourcePath(indexData, project),
                ),
                seg.lines,
                4000,
              );
              content = loaded.content;
            } catch {
              // Fall back to topic + keywords as embedding text
              content = `Topic: ${seg.topic}. Keywords: ${seg.keywords.join(", ")}`;
            }

            const embedText = `Project: ${project}. Date: ${indexData.date}. Topic: ${seg.topic}.\n${content}`;
            texts.push(embedText.slice(0, MAX_EMBED_CHARS));
            segmentMeta.push({ index: i, lines: seg.lines, topic: seg.topic });
          }

          if (texts.length === 0) {
            logWarn(HOOK_NAME, `No segments for ${indexData.session_id}, skipping`);
            skipped++;
            continue;
          }

          // Embed all segments
          const embeddings = await embed(texts);

          // Build chunk rows
          const chunks: ChunkRow[] = embeddings.map((emb, i) => ({
            session_id: indexData.session_id,
            project,
            date: indexData.date,
            segment_index: segmentMeta[i].index,
            line_start: segmentMeta[i].lines[0],
            line_end: segmentMeta[i].lines[1],
            topic: segmentMeta[i].topic,
            chunk_text: texts[i].slice(0, 2000),
            source_path: getSourcePath(indexData, project),
            embedding: emb,
          }));

          insertChunks(db, chunks);
          markSessionEmbedded(
            db,
            indexData.session_id,
            project,
            indexData.source_mtime,
            chunks.length,
          );

          embedded++;
          if (embedded % 50 === 0) {
            logInfo(HOOK_NAME, `Progress: ${embedded} sessions embedded`, { stderr: true });
          }
        } catch (e) {
          errors++;
          logWarn(HOOK_NAME, `Error embedding ${indexFile}: ${e}`);
        }
      }

      if (embedded >= limit) break;
    }
  } finally {
    db.close();
  }

  const result = { embedded, skipped, errors, total };
  process.stdout.write(JSON.stringify(result) + "\n");
  logInfo(HOOK_NAME, `Done: ${JSON.stringify(result)}`, { stderr: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the source JSONL path from a ValidatedSessionIndex.
 * The index stores source_mtime but not always the full path.
 * Reconstruct from ~/.claude/projects/{project-slug}/{session_id}.jsonl
 */
function getSourcePath(index: ValidatedSessionIndex, _project: string): string {
  // SessionIndex doesn't have a source_path field, but the searcher derives it.
  // The JSONL files live under ~/.claude/projects/{encoded-project-path}/
  // We need to find the actual file. Use the index's session_id to locate it.
  const claudeProjectsDir = join(homedir(), ".claude", "projects");

  // Search for the session file across all project dirs
  try {
    const projectDirs = readdirSync(claudeProjectsDir, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const candidatePath = join(
        claudeProjectsDir,
        dir.name,
        `${index.session_id}.jsonl`,
      );
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  } catch {
    // Fall through
  }

  // Fallback: best guess
  return join(claudeProjectsDir, _project, `${index.session_id}.jsonl`);
}
