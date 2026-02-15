---
description: Semantic search across session transcripts using vector embeddings
---
# RLM Retrieve — Semantic Session Search

Runs the full retrieval pipeline: vector search → parallel summarization → AI ranking → synthesis. Returns a coherent answer grounded in past session transcripts.

## Prerequisites

- Ollama running with nomic-embed-text model
- Vector index built (`/rlm:embed-index`)

## Workflow

Run the retrieval pipeline:

```bash
bun .aiwcli/_cc-native/lib-ts/rlm/retrieval-pipeline.ts "$ARGUMENTS"
```

Parse the JSON output (`RetrievalResult`):

1. Present the `synthesis` field as the primary answer
2. Show `sources` as a table:

| Date | Project | Session | Confidence | Topics |
|------|---------|---------|------------|--------|
| {date} | {project} | {session_id} | {confidence} | {topics} |

Only show sources where `relevant = true`.

3. Show `stage_timings` as diagnostics:
   - Embed query: {embed_query_ms}ms
   - Vector search: {vector_search_ms}ms
   - Summarize: {summarize_ms}ms
   - Rank: {rank_ms}ms
   - Synthesize: {synthesize_ms}ms
   - **Total: {total_ms}ms**

## Options

`$ARGUMENTS` is the search query. May also include:
- `--top=N` — Number of chunks to retrieve (default: 20)
- `--project=name` — Filter to a specific project
