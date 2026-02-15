---
description: Summarize sessions about a topic or time range
---
# RLM Summarize — Session Summary by Topic or Time Range

Summarize what happened across multiple sessions matching a topic or time range.

## Input

A topic, project name, or time range. Examples:
- "hook development this week"
- "bridge-practice-app"
- "last 3 days"

## Workflow

### Step 1: Search
Run the searcher to find matching sessions:
```bash
bun .aiwcli/_cc-native/lib-ts/rlm/transcript-searcher.ts "$ARGUMENTS" --top=20
```

For time-range queries ("this week", "last 3 days"), search with a broad project/topic term and then filter results by date in the output.

### Step 2: Group
Group the results by:
- **Date** (if many sessions span multiple days)
- **Project** (if sessions span multiple projects)
- **Theme** (cluster by keywords/summary similarity)

### Step 3: Summarize per Group
For each group of 3+ sessions, optionally load the first 100 lines of 2-3 representative sessions:
```bash
bun .aiwcli/_cc-native/lib-ts/rlm/transcript-loader.ts "<source_path>" --lines=1-100
```

Spawn parallel sub-agents (Task tool, subagent_type=general-purpose, model=haiku) to summarize each group. Prompt:

> Summarize these session excerpts in 2-3 sentences. Focus on: what was built, what decisions were made, what problems were solved.

### Step 4: Output
Present a timeline-style summary:

```
## Session Summary: {topic/range}

### {Date or Group 1}
- {2-3 sentence summary}
- Sessions: {count} | Project: {name}

### {Date or Group 2}
- {2-3 sentence summary}
- Sessions: {count} | Project: {name}

**Total: {N} sessions across {M} projects**
```
