---
description: Answer a question using past session transcripts
---
# RLM Ask — Intelligent Q&A About Past Work

Ask any question about past Claude Code sessions. Auto-selects the best search method (semantic or keyword) based on available indexes.

## Input

A natural language question. Examples:
- "How did we implement the plan review system?"
- "What approach did we use for hook error handling?"
- "When did we last work on the bridge app?"

## Workflow

### Step 1: Auto-Index Check
Check if indexes exist, build if missing (one-time setup):
```bash
INDEX_DIR="$HOME/.claude/rlm-index"
if [ ! -d "$INDEX_DIR" ] || [ -z "$(ls -A $INDEX_DIR 2>/dev/null)" ]; then
  echo "🔄 Building indexes (one-time setup, ~10-30s)..."

  # Run indexer with explicit error handling
  if ! bun .aiwcli/_cc-native/lib-ts/rlm/transcript-indexer.ts --batch; then
    echo ""
    echo "❌ Index build failed"
    echo ""
    echo "Troubleshooting:"
    echo "- Check file permissions in ~/.claude/projects/"
    echo "- Look for corrupted .jsonl files"
    echo "- Try manual rebuild: /rlm:index"
    echo ""
    exit 1
  fi

  echo "✅ Indexes built successfully"
fi
```

### Step 2: Search Strategy Selection
Auto-detect best search method with auto-model-pull:

```bash
VECTOR_DB="$HOME/.claude/rlm-vectors.db"
OLLAMA_RUNNING=false
MODEL_PRESENT=false

# Check if Ollama is running
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  OLLAMA_RUNNING=true

  # Check if nomic-embed-text model is installed
  if ollama list | grep -q "nomic-embed-text"; then
    MODEL_PRESENT=true
  else
    echo "📥 Ollama running but nomic-embed-text model missing"
    echo "🔄 Downloading model (~400MB, this may take 1-2 minutes)..."

    # Auto-pull model with error handling
    if ollama pull nomic-embed-text; then
      echo "✅ Model downloaded successfully"
      MODEL_PRESENT=true
    else
      echo "⚠️  Model download failed, falling back to keyword search"
      OLLAMA_RUNNING=false
    fi
  fi
fi

# Use semantic search if vector DB + Ollama + model available
if [ -f "$VECTOR_DB" ] && [ "$OLLAMA_RUNNING" = true ] && [ "$MODEL_PRESENT" = true ]; then
  echo "Using semantic search (vector similarity)..."
  SEARCH_RESULTS=$(bun .aiwcli/_cc-native/lib-ts/rlm/retrieval-pipeline.ts "$ARGUMENTS")
else
  echo "Using keyword search (weighted scoring)..."
  SEARCH_RESULTS=$(bun .aiwcli/_cc-native/lib-ts/rlm/transcript-searcher.ts "$ARGUMENTS" --top=10)
fi
```

If zero results, tell the user and suggest refining the query or running `/rlm:index`.

### Step 3: Load Transcript Segments
Parse search results and load top N segments (N = result count, capped at 5):

For each of the top 1-5 results, load the relevant transcript segments:

```bash
bun .aiwcli/_cc-native/lib-ts/rlm/transcript-loader.ts "<source_path>" --lines=<start>-<end>
```

Use the `matching_segments` from search results to target specific line ranges. If no segments matched, load the first 200 lines.

### Step 4: Parallel Analysis
Spawn N parallel sub-agents (Task tool, subagent_type=general-purpose) where N = min(result_count, 5):
- 1 result → 1 agent
- 3 results → 3 agents
- 10 results → 5 agents (capped)

Each agent analyzes one segment:

> Given this session transcript segment, extract all information relevant to: **{user's question}**
>
> Include: specific details, code snippets, decisions made, exact quotes, and file paths mentioned.
> Cite line numbers where possible.
>
> Transcript:
> {loaded segment content}

### Step 5: Synthesis
Combine findings into a coherent answer:
1. Group findings by theme/topic
2. Add citations: "In session {date} (project: {project}): {finding}"
3. Note contradictions or evolution across sessions
4. Highlight most recent/relevant information

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

## Notes

- **First run:** Auto-builds indexes (10-30s delay)
- **Semantic search:** Uses vector similarity (higher quality, requires Ollama)
- **Keyword search:** Uses weighted scoring (faster, always available)
- **Graceful fallback:** No Ollama? Automatically uses keyword search
