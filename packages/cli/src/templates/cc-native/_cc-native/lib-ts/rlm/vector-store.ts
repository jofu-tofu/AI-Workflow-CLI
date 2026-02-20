/**
 * Vector store using SQLite + sqlite-vec for KNN embedding search.
 *
 * Single-file DB at ~/.claude/rlm-vectors.db.
 * Uses bun:sqlite with the sqlite-vec extension for vector similarity search.
 */

import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";

import { logDebug } from "./logger.js";
import { RLM_VECTOR_DB_PATH, EMBED_DIMENSIONS, type VectorSearchResult } from "./types.js";

const HOOK_NAME = "rlm_vector";

export interface ChunkRow {
  session_id: string;
  project: string;
  date: string;
  segment_index: number;
  line_start: number;
  line_end: number;
  topic: string;
  chunk_text: string;
  source_path: string;
  embedding: Float32Array;
}

export interface VectorStats {
  session_count: number;
  chunk_count: number;
}

/**
 * Open the vector DB, load sqlite-vec extension, create schema, set WAL mode.
 */
export function openVectorDb(path?: string): Database {
  const dbPath = path ?? RLM_VECTOR_DB_PATH;
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.run("PRAGMA journal_mode=WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS embedded_sessions (
      session_id TEXT NOT NULL,
      project TEXT NOT NULL,
      source_mtime INTEGER NOT NULL,
      chunk_count INTEGER NOT NULL,
      embedded_at TEXT NOT NULL,
      PRIMARY KEY (session_id, project)
    )
  `);

  // vec0 virtual table for KNN search
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING vec0(
      embedding float[${EMBED_DIMENSIONS}],
      project text,
      date text,
      +session_id text,
      +segment_index integer,
      +line_start integer,
      +line_end integer,
      +topic text,
      +chunk_text text,
      +source_path text
    )
  `);

  logDebug(HOOK_NAME, `Opened vector DB at ${dbPath}`);
  return db;
}

/**
 * Insert chunks in a single transaction.
 */
export function insertChunks(db: Database, chunks: ChunkRow[]): void {
  if (chunks.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO chunks (
      embedding, project, date,
      session_id, segment_index, line_start, line_end,
      topic, chunk_text, source_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const chunk of chunks) {
      stmt.run(
        new Uint8Array(chunk.embedding.buffer),
        chunk.project,
        chunk.date,
        chunk.session_id,
        chunk.segment_index,
        chunk.line_start,
        chunk.line_end,
        chunk.topic,
        chunk.chunk_text,
        chunk.source_path,
      );
    }
  });

  tx();
  logDebug(HOOK_NAME, `Inserted ${chunks.length} chunks`);
}

/**
 * Mark a session as embedded (upsert).
 */
export function markSessionEmbedded(
  db: Database,
  sessionId: string,
  project: string,
  mtime: number,
  count: number,
): void {
  db.run(
    `INSERT OR REPLACE INTO embedded_sessions (session_id, project, source_mtime, chunk_count, embedded_at)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, project, mtime, count, new Date().toISOString()],
  );
}

/**
 * Check if a session is already embedded at the given mtime.
 */
export function isSessionEmbedded(
  db: Database,
  sessionId: string,
  project: string,
  mtime: number,
): boolean {
  const row = db.query(
    `SELECT 1 FROM embedded_sessions WHERE session_id = ? AND project = ? AND source_mtime = ?`,
  ).get(sessionId, project, mtime);
  return row !== null && row !== undefined;
}

/**
 * Delete all chunks for a session (for re-indexing).
 */
function isRowidResult(obj: unknown): obj is { rowid: number } {
  return typeof obj === "object" && obj !== null && "rowid" in obj && typeof (obj as { rowid: unknown }).rowid === "number";
}

export function deleteSessionChunks(
  db: Database,
  sessionId: string,
  project: string,
): void {
  // vec0 tables support DELETE with rowid ranges, but we need to find matching rowids first
  const rawRows = db.query(
    `SELECT rowid FROM chunks WHERE session_id = ? AND project = ?`,
  ).all(sessionId, project);

  const rows = (Array.isArray(rawRows) ? rawRows : []).filter((row) => isRowidResult(row));

  if (rows.length > 0) {
    const tx = db.transaction(() => {
      for (const row of rows) {
        db.run(`DELETE FROM chunks WHERE rowid = ?`, [row.rowid]);
      }
    });
    tx();
    logDebug(HOOK_NAME, `Deleted ${rows.length} chunks for ${sessionId}`);
  }

  db.run(
    `DELETE FROM embedded_sessions WHERE session_id = ? AND project = ?`,
    [sessionId, project],
  );
}

function isSearchResultRow(obj: unknown): obj is {
  rowid: number;
  distance: number;
  project: string;
  date: string;
  session_id: string;
  segment_index: number;
  line_start: number;
  line_end: number;
  topic: string;
  source_path: string;
} {
  if (typeof obj !== "object" || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r.rowid === "number" &&
    typeof r.distance === "number" &&
    typeof r.project === "string" &&
    typeof r.date === "string" &&
    typeof r.session_id === "string" &&
    typeof r.segment_index === "number" &&
    typeof r.line_start === "number" &&
    typeof r.line_end === "number" &&
    typeof r.topic === "string" &&
    typeof r.source_path === "string"
  );
}

/**
 * KNN search for the closest chunks to a query embedding.
 */
export function searchKnn(
  db: Database,
  queryEmbedding: Float32Array,
  topK: number,
  projectFilter?: string,
): VectorSearchResult[] {
  const queryBytes = new Uint8Array(queryEmbedding.buffer);

  let sql: string;
  let params: unknown[];

  if (projectFilter) {
    sql = `
      SELECT rowid, distance, project, date,
             session_id, segment_index, line_start, line_end,
             topic, source_path
      FROM chunks
      WHERE embedding MATCH ? AND k = ? AND project = ?
      ORDER BY distance
    `;
    params = [queryBytes, topK, projectFilter];
  } else {
    sql = `
      SELECT rowid, distance, project, date,
             session_id, segment_index, line_start, line_end,
             topic, source_path
      FROM chunks
      WHERE embedding MATCH ? AND k = ?
      ORDER BY distance
    `;
    params = [queryBytes, topK];
  }

  const rawRows = db.query(sql).all(...params);
  const rows = (Array.isArray(rawRows) ? rawRows : []).filter((row) => isSearchResultRow(row));

  return rows.map((r) => ({
    chunk_id: r.rowid,
    session_id: r.session_id,
    project: r.project,
    segment_index: r.segment_index,
    line_start: r.line_start,
    line_end: r.line_end,
    topic: r.topic,
    date: r.date,
    source_path: r.source_path,
    distance: r.distance,
  }));
}

function isCountResult(obj: unknown): obj is { cnt: number } {
  return typeof obj === "object" && obj !== null && "cnt" in obj && typeof (obj as { cnt: unknown }).cnt === "number";
}

/**
 * Get counts of embedded sessions and chunks.
 */
export function getStats(db: Database): VectorStats {
  const sessionsRaw = db.query(
    `SELECT COUNT(*) as cnt FROM embedded_sessions`,
  ).get();
  const chunksRaw = db.query(
    `SELECT COUNT(*) as cnt FROM chunks`,
  ).get();

  const sessionCount = isCountResult(sessionsRaw) ? sessionsRaw.cnt : 0;
  const chunkCount = isCountResult(chunksRaw) ? chunksRaw.cnt : 0;

  return {
    session_count: sessionCount,
    chunk_count: chunkCount,
  };
}
