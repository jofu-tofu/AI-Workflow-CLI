---
description: Build/refresh the RLM transcript index across all Claude Code sessions
---
# RLM Index — Build Transcript Index

Run the TranscriptIndexer to scan all Claude Code session transcripts and build searchable indexes.

## Steps

1. Run the indexer:
```bash
bun .aiwcli/_cc-native/lib-ts/rlm/transcript-indexer.ts --batch $ARGUMENTS
```

The indexer accepts optional flags:
- `--limit=N` — Index only the first N unindexed sessions
- `--project=<name>` — Only index sessions for projects matching this name (partial match)

2. Report the results from the JSON output (indexed count, skipped, errors, total).

3. If this is the first run, suggest: "Index is ready. Try `/rlm:search <query>` or `/rlm:recall <question>` to search your session history."
