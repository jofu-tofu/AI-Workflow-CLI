/**
 * RLM — Recursive Language Model session transcript memory.
 *
 * Public API re-exports for programmatic use from hooks/agents.
 */

export {
  CURRENT_SCHEMA_VERSION,
  CLAUDE_PROJECTS_DIR,
  RLM_INDEX_DIR,
  RLM_VECTOR_DB_PATH,
  OLLAMA_BASE_URL,
  OLLAMA_EMBED_MODEL,
  EMBED_DIMENSIONS,
  VECTOR_TOP_K,
  MAX_LOADER_CHARS,
  MAX_PARALLEL_SUMMARIZERS,
  TOP_N_HEAP,
  WEIGHT,
  type SessionIndex,
  type SearchResult,
  type LoadedSegment,
  type IndexSegment,
  type VectorSearchResult,
  type ChunkSummary,
  type RankedSession,
  type RetrievalResult,
} from "./types.js";

export {
  discoverSessions,
  indexSession,
  writeIndex,
  needsIndexing,
  runBatch,
} from "./transcript-indexer.js";

export { search, scoreIndex, tokenize, type SearchOptions } from "./transcript-searcher.js";

export { loadTranscript } from "./transcript-loader.js";

export { checkOllamaHealth, embed, embedOne, type OllamaConfig } from "./ollama-client.js";

export {
  openVectorDb,
  insertChunks,
  markSessionEmbedded,
  isSessionEmbedded,
  deleteSessionChunks,
  searchKnn,
  getStats,
  type ChunkRow,
  type VectorStats,
} from "./vector-store.js";
