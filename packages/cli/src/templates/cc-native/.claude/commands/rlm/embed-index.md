---
description: Build/refresh the vector embedding index for semantic search
---
# RLM Embed Index — Build Vector Embeddings

Builds or refreshes the sqlite-vec vector index from existing JSON session indexes. Requires Ollama running locally with the nomic-embed-text model.

## Prerequisites

- Ollama running (`ollama serve`)
- nomic-embed-text model pulled (`ollama pull nomic-embed-text`)
- JSON indexes built (`/rlm:index`)

## Workflow

Run the embedding indexer:

```bash
bun .aiwcli/_cc-native/lib-ts/rlm/embedding-indexer.ts --batch $ARGUMENTS
```

Parse the JSON output and report:
- **embedded**: Number of sessions newly embedded
- **skipped**: Number of sessions already up-to-date
- **errors**: Number of sessions that failed
- **total**: Total sessions scanned

If errors > 0, warn the user and suggest checking Ollama health.

To show current index statistics:
```bash
bun .aiwcli/_cc-native/lib-ts/rlm/embedding-indexer.ts --stats
```

## Options

Pass through `$ARGUMENTS` which may include:
- `--limit=N` — Only embed first N unindexed sessions
- `--project=name` — Only embed sessions for a specific project
- `--stats` — Show index statistics instead of building
