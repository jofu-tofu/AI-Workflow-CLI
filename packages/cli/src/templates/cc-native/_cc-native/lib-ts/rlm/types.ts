/**
 * RLM (Recursive Language Model) — Session Transcript Memory
 *
 * Type definitions and constants for indexing, searching, and loading
 * Claude Code session transcripts across all projects.
 */

import { homedir } from "node:os";
import { join } from "node:path";

import { getProjectRoot } from "../../../_shared/lib-ts/runtime/constants.js";
import { loadConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bump when index fields change. Search skips indexes with older versions. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Root of all Claude Code project transcripts. */
export const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

/** Root of the RLM index cache. */
export const RLM_INDEX_DIR = join(homedir(), ".claude", "rlm-index");

/** Max chars returned by TranscriptLoader for a single segment. */
export const MAX_LOADER_CHARS = 50_000;

/** How many top results TranscriptSearcher keeps during scoring. */
export const TOP_N_HEAP = 50;

// ---------------------------------------------------------------------------
// Search scoring weights
// ---------------------------------------------------------------------------

export const WEIGHT = {
  summary: 3,
  segmentTopic: 3,
  keywords: 2,
  filesTouched: 2,
  commandsRun: 1.5,
  toolCalls: 1,
} as const;

// ---------------------------------------------------------------------------
// Index types
// ---------------------------------------------------------------------------

export interface IndexSegment {
  lines: [start: number, end: number];
  topic: string;
  keywords: string[];
}

export interface SessionIndex {
  schema_version: number;
  session_id: string;
  project: string;
  date: string; // YYYY-MM-DD
  first_timestamp: string; // ISO 8601
  line_count: number;
  summary: string;
  keywords: string[];
  user_message_count: number;
  assistant_message_count: number;
  tool_calls: string[];
  files_touched: string[];
  commands_run: string[];
  source_mtime: number; // ms since epoch
  skipped_lines: number;
  segments: IndexSegment[];
}

// ---------------------------------------------------------------------------
// Search types
// ---------------------------------------------------------------------------

export interface SearchResult {
  session_id: string;
  project: string;
  date: string;
  summary: string;
  score: number;
  matching_segments: IndexSegment[];
  source_path: string; // path to original .jsonl
  source_exists: boolean; // whether the original .jsonl still exists
  index_path: string; // path to .index.json
}

// ---------------------------------------------------------------------------
// Loader types
// ---------------------------------------------------------------------------

export interface LoadedSegment {
  session_id: string;
  project: string;
  line_range: [number, number] | null; // null = full session
  content: string; // formatted transcript text
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Vector / Embedding constants
// ---------------------------------------------------------------------------

export const RLM_VECTOR_DB_PATH = join(homedir(), ".claude", "rlm-vectors.db");
export const OLLAMA_BASE_URL = "http://localhost:11434";
export const OLLAMA_EMBED_MODEL = "nomic-embed-text";
export const EMBED_DIMENSIONS = 768;
export const VECTOR_TOP_K = 20;
export const MAX_PARALLEL_SUMMARIZERS = 6;

// ---------------------------------------------------------------------------
// HyDE Configuration
// ---------------------------------------------------------------------------

// Load HyDE config from CC-native config file
const _ccNativeConfig = (() => {
  try {
    const projectRoot = getProjectRoot();
    const config = loadConfig(join(projectRoot, ".aiwcli"));
    return (config as unknown)?.rlm?.hyde ?? {};
  } catch {
    return {}; // Graceful fallback if config loading fails
  }
})();

/** Enable HyDE (Hypothetical Document Embeddings) for improved recall. Default: false (opt-in). */
export const HYDE_ENABLED = _ccNativeConfig.enabled ?? false;

/** LLM provider for HyDE generation. Options: "ollama" (local, free) or "claude" (API, costs). */
export const HYDE_PROVIDER = _ccNativeConfig.provider === "claude" ? "claude" : "ollama";

/** Ollama model for HyDE generation. Recommended: qwen2.5:1.5b (fast) or llama3.1:8b (quality). */
export const HYDE_OLLAMA_MODEL = _ccNativeConfig.ollamaModel ?? "qwen2.5:1.5b";

/** Number of hypothetical responses to generate and average. Research standard: 5. */
export const HYDE_NUM_RESPONSES = _ccNativeConfig.numResponses ?? 5;

/** Max tokens per hypothetical response. 200 tokens ≈ 150 words ≈ 2-3 sentences. */
export const HYDE_MAX_TOKENS = _ccNativeConfig.maxTokens ?? 200;

/** Per-response generation timeout in milliseconds. Local models usually respond in 500-1500ms. */
export const HYDE_TIMEOUT_MS = _ccNativeConfig.timeoutMs ?? 10_000;

/** Fallback to direct query embedding if HyDE fails? true = graceful degradation (recommended). */
export const HYDE_FALLBACK_TO_QUERY = _ccNativeConfig.fallbackToQuery ?? true;

/** Fallback to Claude API if Ollama unavailable? false = no cost fallback (recommended). */
export const HYDE_FALLBACK_TO_CLAUDE = _ccNativeConfig.fallbackToClaude ?? false;

// ---------------------------------------------------------------------------
// Vector / Embedding types
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  chunk_id: number;
  session_id: string;
  project: string;
  segment_index: number;
  line_start: number;
  line_end: number;
  topic: string;
  date: string;
  source_path: string;
  distance: number;
}

export interface ChunkSummary {
  session_id: string;
  project: string;
  date: string;
  segment_lines: [number, number];
  summary: string;
  source_path: string;
}

export interface RankedSession {
  session_id: string;
  project: string;
  date: string;
  relevant: boolean;
  confidence: number;
  topics: string[];
  key_findings: string[];
}

export interface RetrievalResult {
  query: string;
  synthesis: string;
  sources: RankedSession[];
  stage_timings: {
    hyde_ms?: number; // Only present if HyDE was used
    embed_query_ms: number;
    vector_search_ms: number;
    summarize_ms: number;
    rank_ms: number;
    synthesize_ms: number;
    total_ms: number;
  };
}

