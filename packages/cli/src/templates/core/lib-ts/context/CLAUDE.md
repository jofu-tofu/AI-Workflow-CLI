# Context Management System

Shared library for context lifecycle management: state machine, session binding, plan tracking, and artifact routing.

## Overview

A "context" is a named work session with a state machine that tracks mode transitions, staged artifacts, and session history. Contexts persist to disk as `state.json` files under `_output/contexts/{id}/`. They are the backbone of the handoff and session-restore system.

## File Structure

```
context/
├── CLAUDE.md          ← This file
├── context-store.ts   ← Core CRUD + state machine transitions
├── context-formatter.ts ← Context → human-readable text for injection
├── context-selector.ts  ← Find active/relevant contexts by criteria
├── plan-manager.ts    ← Plan file archive, discovery, hash, path extraction
└── task-tracker.ts    ← Task progress tracking within a context
```

## State Machine

```
                      ┌─────────────┐
                      │   created   │
                      └──────┬──────┘
                             │ first user prompt / maybeActivate()
                             ▼
                      ┌─────────────┐
                  ┌──▶│   active    │◀──────────────────┐
                  │   └──────┬──────┘                   │
                  │          │ session_end + artifact    │ session_start (clear)
                  │          ▼                           │
                  │   ┌─────────────────┐               │
                  │   │ has_staged_work  │ ──────────────┘
                  │   └──────┬──────────┘
                  │          │ work_consumed = true
                  │          ▼
                  │   ┌─────────────┐
                  │   │  archived   │──▶ (terminal)
                  │   └─────────────┘
                  │
                  └─── reopenContext()
```

**Modes:**
- `created` — context initialized, not yet bound to a session
- `active` — session in progress, context is current
- `has_staged_work` — session ended with staged artifact (plan or handoff)
- `archived` — context complete and closed

## API Reference

### `context-store.ts`

| Function | Purpose |
|----------|---------|
| `createContext(id, opts)` | Create new context with initial state |
| `getContext(contextId)` | Read context by ID |
| `getAllContexts(mode?, root?)` | List all contexts, optionally filtered by mode |
| `getContextBySessionId(sessionId, root?)` | Find context that owns a session ID |
| `updateContext(contextId, patch)` | Partial state update |
| `bindSession(contextId, sessionId)` | Attach session ID to context |
| `updateMode(contextId, mode)` | Transition state machine mode |
| `maybeActivate(contextId)` | Activate if in `created` mode (idempotent) |
| `completeContext(contextId)` | Mark complete, archive |
| `archiveContext(contextId)` | Archive without completing |
| `reopenContext(contextId)` | Transition `archived` → `active` |
| `createContextFromPrompt(prompt)` | Create context from user prompt text |
| `loadState(contextId)` | Raw state.json read |
| `saveState(contextId, state)` | Raw state.json write |
| `determineArtifactType(context)` | Detect `"plan"` or `"handoff"` from staged state |

### `context-formatter.ts`

Formats context state for injection into Claude's context window.

| Function | Purpose |
|----------|---------|
| `formatContext(context)` | Full context as human-readable markdown |
| `formatContextSummary(context)` | Short one-line summary |

### `context-selector.ts`

Routes prompts to contexts. Single entry point: `determineContext()`.

| Function / Class | Purpose |
|----------|---------|
| `determineContext(prompt, sessionId, projectRoot)` | Main entry — session match, caret commands, plan/handoff fallback, or create new |
| `resolveContextByPrefix(prefix, root?)` | Resolve context by ID prefix |
| `parseChainedCaret(prompt)` | Parse `^` caret commands from prompt |
| `BlockRequest` (class) | Thrown when request should be blocked with a message |

### `plan-manager.ts`

Manages plan file lifecycle within a context.

| Function | Purpose |
|----------|---------|
| `archivePlan(contextId, planPath)` | Copy plan to context's `plans/` folder |
| `findLatestPlan(contextId)` | Find most recent archived plan |
| `generatePlanId()` | Generate unique plan ID |
| `normalizePlanContent(text)` | Strip metadata for hashing |
| `extractPlanAnchors(content)` | Extract key phrases from plan for matching |
| `findPlanPathInTranscript(transcriptPath)` | Parse plan path from JSONL transcript |
| `extractPlanPathFromResult(toolResult)` | Extract plan path from tool result JSON |

### `task-tracker.ts`

Tracks task progress (ISC criteria) within a context.

| Function | Purpose |
|----------|---------|
| `initTaskTracker(contextId)` | Create task tracker for context |
| `addTask(contextId, task)` | Add tracked task |
| `updateTask(contextId, taskId, patch)` | Update task status |
| `getTaskSummary(contextId)` | Progress summary |

## Which Hooks Use This System

| Hook | Usage |
|------|-------|
| `session_start.ts` | `getContextBySessionId()`, `bindSession()`, `updateMode()`, `getAllContexts()` |
| `session_end.ts` | `getContextBySessionId()`, `updateMode()`, `saveState()` |
| `user_prompt_submit.ts` | `getAllContexts()`, `maybeActivate()`, `determineArtifactType()` |
| `archive_plan.ts` | `getContextBySessionId()`, `archivePlan()` |
| `cc-native-plan-review.ts` | `getContextBySessionId()`, `getAllContexts()` |

## Design Decisions

- **Single state.json per context:** All state is in one file. No distributed state. Atomic writes prevent corruption.
- **No moves out of lib-ts:** Context is pure library code imported by ~8 shared hooks. Moving it would require updating all those import paths for no structural gain. The subfolder is already co-located; it just needed documentation.
- **`maybeActivate()` is idempotent:** Can be called from any hook without checking current mode — safe to call repeatedly.
- **`determineArtifactType()` drives session restore:** Returns `"plan"` or `"handoff"` to dispatch the correct restoration path in `session_start.ts`.

<!-- context-layer: last-audited=2026-03-05 | version=2 -->

