/**
 * RLM — Recursive Language Model session transcript memory.
 *
 * Public API re-exports for programmatic use from hooks/agents.
 */

export { checkOllamaHealth, embed, embedOne, type OllamaConfig } from "./ollama-client.js";

export {
  discoverSessions,
  indexSession,
  needsIndexing,
  runBatch,
  writeIndex,
} from "./transcript-indexer.js";

export { loadTranscript } from "./transcript-loader.js";

export { scoreIndex, search, type SearchOptions, tokenize } from "./transcript-searcher.js";

export {
  type ChunkSummary,
  CLAUDE_PROJECTS_DIR,
  CURRENT_SCHEMA_VERSION,
  EMBED_DIMENSIONS,
  type IndexSegment,
  type LoadedSegment,
  MAX_LOADER_CHARS,
  MAX_PARALLEL_SUMMARIZERS,
  OLLAMA_BASE_URL,
  OLLAMA_EMBED_MODEL,
  type RankedSession,
  type RetrievalResult,
  RLM_INDEX_DIR,
  RLM_VECTOR_DB_PATH,
  type SearchResult,
  type SessionIndex,
  TOP_N_HEAP,
  VECTOR_TOP_K,
  type VectorSearchResult,
  WEIGHT,
} from "./types.js";

export {
  type ChunkRow,
  deleteSessionChunks,
  getStats,
  insertChunks,
  isSessionEmbedded,
  markSessionEmbedded,
  openVectorDb,
  searchKnn,
  type VectorStats,
} from "./vector-store.js";
