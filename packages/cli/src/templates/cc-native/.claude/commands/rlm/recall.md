---
description: Answer a question using past session transcripts (full RLM retrieval)
---
# RLM Recall — Deep Retrieval From Session History

The full RLM-inspired workflow: search indexes, load relevant transcripts, analyze with sub-agents, and synthesize a grounded answer with citations.

## Input

The user's question about past work. Examples:
- "How did we implement the plan review system?"
- "What approach did we use for hook error handling?"
- "When did we last work on the bridge app?"

## Workflow

### Phase 1: Index Search
Run the searcher to find relevant sessions:
```bash
bun .aiwcli/_cc-native/lib-ts/rlm/transcript-searcher.ts "$ARGUMENTS" --top=10
```

If zero results, tell the user and suggest refining the query or running `/rlm:index`.

### Phase 2: Targeted Deep Read
For the top 3-5 sessions from Phase 1, load the relevant transcript segments using the TranscriptLoader:

```bash
bun .aiwcli/_cc-native/lib-ts/rlm/transcript-loader.ts "<source_path>" --lines=<start>-<end>
```

Use the `matching_segments` from search results to target specific line ranges. If no segments matched, load the first 200 lines.

Spawn up to 3 **parallel** sub-agents (Task tool, subagent_type=general-purpose) to analyze each loaded segment. Each agent's prompt:

> Given this session transcript segment, extract all information relevant to: **{user's question}**
>
> Include: specific details, code snippets, decisions made, exact quotes, and file paths mentioned.
> Cite line numbers where possible.
>
> Transcript:
> {loaded segment content}

### Phase 3: Synthesis
Combine all sub-agent findings into a coherent answer:

1. Group findings by theme/topic
2. Add citations: "In session {date} (project: {project}): {finding}"
3. Note any contradictions or evolution across sessions
4. Highlight the most recent/relevant information

### Output Format
```
## Answer: {user's question}

{Synthesized answer with inline citations}

### Sources
| Date | Project | Session | Relevance |
|------|---------|---------|-----------|
| YYYY-MM-DD | project-name | session-id | Brief match reason |
```

Always include the sources table. If findings are sparse, say so honestly rather than speculating.
