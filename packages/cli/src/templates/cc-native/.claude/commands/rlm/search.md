---
description: Search session transcripts by keyword or regex
---
# RLM Search — Keyword Search Across Session Transcripts

Search all indexed Claude Code session transcripts for matching content.

## Steps

1. Run the searcher with the user's query:
```bash
RLM_LIB_MODE=1 bun -e "import {search} from './.aiwcli/_cc-native/lib-ts/rlm/transcript-searcher.js'; search('$ARGUMENTS', {topN:10}).then(r=>console.log(JSON.stringify(r,null,2)))"
```

If the above doesn't work, use the CLI mode:
```bash
bun .aiwcli/_cc-native/lib-ts/rlm/transcript-searcher.ts $ARGUMENTS
```

2. Parse the JSON results and present them in a readable format:
   - For each result: **Date** | **Project** | **Summary** | **Score**
   - Include matching segments with line ranges if available

3. If results mention "No indexes found", tell the user to run `/rlm:index` first.

4. If the user wants to dig deeper into a specific session, suggest `/rlm:recall` for the full RLM retrieval workflow.
