# Shared Infrastructure Visual Overview

## Purpose

This document provides a visual and conceptual overview of the AIW CLI shared context management infrastructure. This system solves three core problems:

1. **Context state lost across sessions** - User must manually restore context after closing terminal
2. **Code duplication** - Each template reimplements context management independently
3. **No automatic work discovery** - User forgets what they were working on between sessions

## Core Architecture Principles

### 1. Read-Only vs Writable Separation (NEW)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FOLDER PHILOSOPHY: Clean Code/Data Separation                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  READ-ONLY (Code/Templates)          WRITABLE (Data/Output)                 │
│  ─────────────────────────           ──────────────────────                 │
│  _shared/                            _output/                               │
│  _cc-native/                         _output/cc-native/                     │
│  _gsd/                               _output/gsd/                           │
│  _bmad/                              _output/bmad/                          │
│                                                                             │
│  Contains:                           Contains:                              │
│  • Python libraries                  • Context data (events.jsonl)         │
│  • Hook scripts                      • Cache files (context.json)          │
│  • Workflow definitions              • Plan outputs                         │
│  • Schemas                           • Reviews                              │
│  • Config templates                  • index.json (global cache)           │
│                                                                             │
│  After `aiw init`:                   During work:                           │
│  • Never modified                    • Appended/updated continuously       │
│  • Can be updated via CLI            • Gitignored by default               │
│                                                                             │
│  WHY THIS MATTERS:                                                          │
│  • Method folders remain pristine after installation                       │
│  • All generated data centralized in _output/                              │
│  • Clean separation for git, backups, and deployment                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Event-Sourced State (The Foundation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DATA HIERARCHY - Source of Truth                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  _output/<method>/contexts/<id>/events.jsonl                                │
│      │                                                                      │
│      │  SOURCE OF TRUTH                                                     │
│      │  • Append-only (never modified, only appended)                       │
│      │  • Contains full history of all events                               │
│      │  • Can rebuild everything from this file                             │
│      │  • Survives crashes - no state loss                                  │
│      │                                                                      │
│      ▼                                                                      │
│  _output/<method>/contexts/<id>/context.json                                │
│      │                                                                      │
│      │  DERIVED CACHE (Level 1)                                             │
│      │  • Computed from events.jsonl                                        │
│      │  • Updated in-place (atomic write for crash-safety)                  │
│      │  • Can be rebuilt by replaying events                                │
│      │  • If corrupted, just replay events                                  │
│      │                                                                      │
│      ▼                                                                      │
│  _output/index.json                                                         │
│      │                                                                      │
│      │  DERIVED CACHE (Level 2)                                             │
│      │  • Aggregates all context.json files                                 │
│      │  • Updated in-place (atomic write for crash-safety)                  │
│      │  • Can be rebuilt by scanning context folders                        │
│      │  • If corrupted, just rescan contexts                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

KEY INSIGHT: Atomic writes = crash-safety, NOT concurrency control.
- Single session per context by design (no concurrent access)
- If process crashes mid-write, temp file orphaned, original intact
- Next session rebuilds cache from events.jsonl if needed
```

**Why Event-Sourced?**
- Complete audit trail of all work
- Time-travel debugging (replay events to any point)
- Zero state loss from crashes (events always preserved)
- Easy migration and transformation (just replay events differently)

### 3. Two-State Model (Simplicity Through Constraints)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONTEXT LIFECYCLE                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌──────────────┐                                    │
│     User creates        │              │        User says "wrap up"         │
│     new context    ──▶  │   ACTIVE     │  ──▶   (explicit completion)      │
│                         │              │                                    │
│                         └──────────────┘                                    │
│                               │                                             │
│                               │ Session crashes?                            │
│                               │ Terminal closes?                            │
│                               │ Power outage?                               │
│                               │                                             │
│                               ▼                                             │
│                         Still ACTIVE!                                       │
│                         (this is correct)                                   │
│                               │                                             │
│                               │ User reopens session                        │
│                               ▼                                             │
│                         Context shown in list                               │
│                         User resumes work                                   │
│                                                                             │
│                         ┌──────────────┐                                    │
│     User completes ──▶  │  COMPLETED   │                                    │
│     explicitly          │              │                                    │
│                         └──────────────┘                                    │
│                               │                                             │
│                               │ Still queryable                             │
│                               │ Just filtered out of "active" list          │
│                               │                                             │
│                               ▼                                             │
│                         (Optional: reopen if needed)                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

NO "in_progress" or "paused" states = NO orphan problem!
```

**Why Two States?**
- **Eliminates orphan contexts**: Sessions can't leave contexts in limbo
- **Predictable behavior**: Context is either being worked on or done
- **Simple recovery**: All active contexts always visible on SessionStart
- **User-driven completion**: AI doesn't prematurely mark work as done

### 4. Per-Context Isolation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DIRECTORY STRUCTURE                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  project-root/                                                              │
│  │                                                                          │
│  ├── _output/ ◀─────────────────────── WRITABLE: All generated data        │
│  │   ├── index.json ◀──────────────── Global cache (all contexts)          │
│  │   │                                                                      │
│  │   ├── cc-native/ ◀──────────────── CC-Native method outputs             │
│  │   │   ├── contexts/ ◀───────────── Per-context isolation                │
│  │   │   │   ├── feature-auth/ ◀──── Context folder (isolated)            │
│  │   │   │   │   ├── context.json ◀─ Cache (rebuildable)                   │
│  │   │   │   │   └── events.jsonl ◀─ Source of truth                       │
│  │   │   │   └── research-db/ ◀───── Another context (isolated)           │
│  │   │   │       ├── context.json                                          │
│  │   │   │       └── events.jsonl                                          │
│  │   │   └── plans/ ◀────────────── Plan outputs                           │
│  │   │       └── 2026-01-25/                                               │
│  │   │           └── session-xxx/                                          │
│  │   │               ├── plan.md                                           │
│  │   │               └── reviews/                                          │
│  │   │                                                                      │
│  │   └── gsd/ ◀───────────────────── GSD method outputs (future)           │
│  │       └── contexts/                                                      │
│  │                                                                          │
│  ├── _shared/ ◀─────────────────────── READ-ONLY: Shared infrastructure   │
│  │   ├── lib/                                                              │
│  │   │   ├── base/                                                         │
│  │   │   │   ├── atomic_write.py ◀── Cross-platform crash-safe writes     │
│  │   │   │   ├── constants.py                                              │
│  │   │   │   └── utils.py                                                  │
│  │   │   └── context/                                                      │
│  │   │       ├── context_manager.py ◀─ Context CRUD                        │
│  │   │       ├── event_log.py ◀────── JSONL operations                     │
│  │   │       ├── discovery.py ◀────── SessionStart logic                   │
│  │   │       ├── cache.py ◀────────── Cache rebuild                        │
│  │   │       └── task_sync.py ◀───── Claude task integration (NEW)         │
│  │   ├── hooks/                                                            │
│  │   │   └── session_start.py ◀───── Auto-discover contexts                │
│  │   └── schemas/                                                          │
│  │       ├── context.json.schema                                           │
│  │       └── events.jsonl.schema                                           │
│  │                                                                          │
│  ├── _cc-native/ ◀───────────────────── READ-ONLY: CC-Native template code│
│  │   ├── lib/                                                              │
│  │   │   └── orchestrator.py ◀────── Template-specific                     │
│  │   └── hooks/                                                            │
│  │       └── cc-native-plan-review.py                                      │
│  │                                                                          │
│  └── .claude/                                                               │
│      └── settings.json ◀──────────── Hook wiring                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

KEY: Each context gets its own folder with its own event log.
     No shared state between contexts = no interference.
```

### 5. Single-Context Sessions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SESSION MODEL                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  One session works on ONE context at a time                                 │
│                                                                             │
│  ┌────────────┐                        ┌────────────┐                       │
│  │  Session   │  working on            │  Context   │                       │
│  │     A      │ ─────────────────────▶ │  feature-x │                       │
│  └────────────┘                        └────────────┘                       │
│                                                                             │
│  ┌────────────┐                        ┌────────────┐                       │
│  │  Session   │  working on            │  Context   │                       │
│  │     B      │ ─────────────────────▶ │  research-y│                       │
│  └────────────┘                        └────────────┘                       │
│                                                                             │
│  Context switching = /clear + pick different context                        │
│                                                                             │
│  NOT SUPPORTED (by design):                                                 │
│  ┌────────────┐       ✗                ┌────────────┐                       │
│  │  Session   │  ═══════════════════▶  │  Context   │                       │
│  │     A      │  ═══════════════════▶  │  feature-x │                       │
│  └────────────┘       ✗                └────────────┘                       │
│  ┌────────────┐       ✗                     ▲                               │
│  │  Session   │  ═════════════════════════  ║                               │
│  │     B      │       ✗                     ║                               │
│  └────────────┘                             ║                               │
│                   Multiple sessions on same context = NOT ALLOWED           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

WHY? Eliminates need for:
- File locking mechanisms
- Concurrent access handling
- Orphan state detection
- Merge conflict resolution

User always knows what they're working on.
```

## NEW FEATURE: Claude Native Task Integration

### The Problem

Claude Code has native `TaskCreate`, `TaskUpdate`, `TaskList` tools, but they are **ephemeral** - tasks only exist within a single session. When the session ends, Claude's task list is empty, and the user must manually recreate all tasks.

### The Solution: Bi-Directional Sync

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BI-DIRECTIONAL SYNC PATTERN                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SESSION START (Hydrate)                                                    │
│  ───────────────────────                                                    │
│  1. SessionStart hook runs                                                  │
│  2. Read events.jsonl → compute pending tasks                               │
│  3. Output instructions for Claude to recreate tasks via TaskCreate         │
│  4. Claude's native TaskList now populated with persistent state            │
│                                                                             │
│       events.jsonl ──────→ Claude TaskCreate ──────→ Claude TaskList        │
│       (persistent)         (hook output)             (session memory)       │
│                                                                             │
│  DURING SESSION (Work + Persist)                                            │
│  ───────────────────────────────                                            │
│  1. Claude uses native TaskCreate/TaskUpdate normally                       │
│  2. CLAUDE.md instructs: after TaskUpdate, also call append_event()         │
│  3. Both systems stay in sync                                               │
│                                                                             │
│       Claude TaskUpdate ──────→ append_event() ──────→ events.jsonl         │
│       (native tool)             (our API)              (persistent)         │
│                                                                             │
│  SESSION END (Nothing special)                                              │
│  ─────────────────────────────                                              │
│  events.jsonl already has everything - next session will hydrate from it    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Hydration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TASK HYDRATION ON SESSION START                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User starts session                                                     │
│     └─→ SessionStart hook: "You have active context 'auth-system'"          │
│                                                                             │
│  2. User: "Continue auth-system"                                            │
│     └─→ generate_hydration_instructions("auth-system")                      │
│                                                                             │
│  3. Hook outputs:                                                           │
│     "Please recreate these tasks using TaskCreate:                          │
│                                                                             │
│      Task: Add JWT middleware                                               │
│      TaskCreate:                                                            │
│        subject: 'Add JWT middleware'                                        │
│        description: 'Create bearer token validation...'                     │
│        metadata: {'persistent_id': 'aiw-1', 'context': 'auth-system'}       │
│                                                                             │
│      Task: Implement refresh tokens                                         │
│      TaskCreate:                                                            │
│        subject: 'Implement refresh tokens'                                  │
│        description: '...'                                                   │
│        metadata: {'persistent_id': 'aiw-2', 'context': 'auth-system'}"      │
│                                                                             │
│  4. Claude executes TaskCreate calls                                        │
│     └─→ Claude's TaskList now has pending tasks from previous session       │
│                                                                             │
│  5. Append session_started event with tasks_hydrated list                   │
│     └─→ {"event":"session_started","tasks_hydrated":["aiw-1","aiw-2"]}     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

| Without Integration | With Bi-Directional Sync |
|---------------------|--------------------------|
| Tasks disappear on session end | Tasks persist across sessions |
| User manually recreates work | Automatic task restoration |
| No connection to Claude's tools | Leverages native Claude functionality |
| Context feels disconnected | Seamless continuation |

## NEW FEATURE: Rich Task Events

### The Problem

Simple `task_completed` events lose critical context:
- What was actually done?
- Which files were changed?
- What was the git commit?

Next session sees: "✅ Task done" - but no understanding of the work.

### The Solution: Rich Context Preservation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  RICH TASK COMPLETION EVENTS                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  task_completed event includes:                                             │
│                                                                             │
│  {                                                                          │
│    "event": "task_completed",                                               │
│    "task_id": "aiw-1",                                                      │
│    "timestamp": "2026-01-20T11:00:00Z",                                     │
│                                                                             │
│    // Required                                                              │
│    "evidence": "All 12 tests passing",                                      │
│                                                                             │
│    // Optional - Rich context for cross-session understanding               │
│    "work_summary": "Created JWT middleware with bearer token validation.    │
│                     Added refresh token support. Fixed edge case where      │
│                     expired tokens caused 500 errors.",                     │
│                                                                             │
│    "files_changed": [                                                       │
│      "src/middleware/auth.ts",                                              │
│      "src/utils/token.ts",                                                  │
│      "test/auth.test.ts"                                                    │
│    ],                                                                       │
│                                                                             │
│    "commit_ref": "a1b2c3d"  // If work was committed                        │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Rich Context in Action

```
NEXT SESSION SEES:

Resuming context: JWT Authentication System

Completed Tasks:
✅ Add JWT middleware
   → Created JWT middleware with bearer token validation. Added refresh
     token support. Fixed edge case where expired tokens caused 500 errors.
   → Files: src/middleware/auth.ts, src/utils/token.ts, test/auth.test.ts
   → Commit: a1b2c3d

Pending Tasks:
⬜ Add rate limiting
```

### Why This Matters

| Field | Without It | With It |
|-------|------------|---------|
| `work_summary` | "✅ Task done" - no context | "Created middleware with validation, fixed expired token bug" |
| `files_changed` | Don't know what was touched | Can review/understand scope of changes |
| `commit_ref` | Can't trace to git history | Direct link to commit for full diff |

## User Workflows

### Workflow 1: Normal Context Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  START SESSION                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  User opens terminal                                                        │
│  └─▶ SessionStart hook runs                                                 │
│  └─▶ get_all_contexts() scans for existing work                             │
│  └─▶ Claude: "You have 2 active contexts: feature-auth, research-db.        │
│               Which would you like to continue, or start new?"              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  CREATE NEW CONTEXT                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  User: "Start new - build JWT authentication system"                        │
│  └─▶ create_context("auth-system", method="cc-native")                      │
│  └─▶ Creates folder: _output/cc-native/contexts/auth-system/                │
│  └─▶ Creates files:                                                         │
│      ├── events.jsonl ──▶ {"event":"context_created",...}                   │
│      └── context.json ──▶ {"id":"auth-system","status":"active",...}        │
│  └─▶ Updates _output/index.json (cache)                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  WORK HAPPENS (with Rich Events)                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Tasks created, completed, notes added...                                   │
│                                                                             │
│  events.jsonl (source of truth):                                            │
│    {"event":"task_added","task_id":"aiw-1","title":"Add JWT middleware"}    │
│    {"event":"task_started","task_id":"aiw-1"}                               │
│    {"event":"task_completed","task_id":"aiw-1",                             │
│     "evidence":"tests pass",                                                │
│     "work_summary":"Created middleware with bearer validation",             │
│     "files_changed":["src/middleware/auth.ts","test/auth.test.ts"]}         │
│    {"event":"note_added","content":"Need refresh token support"}            │
│    {"event":"task_added","task_id":"aiw-2","title":"Refresh tokens"}        │
│    {"event":"session_started","tasks_hydrated":["aiw-2"]}                   │
│                                                                             │
│  context.json (cache) updated after each event                              │
│  index.json (cache) updated to reflect last_active timestamp                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMPLETION (USER-DRIVEN)                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  User: "wrap up" (explicit completion)                                      │
│  └─▶ complete_context("auth-system")                                        │
│  └─▶ Appends to events.jsonl: {"event":"context_completed",...}             │
│  └─▶ Updates context.json: {"status":"completed",...}                       │
│  └─▶ Updates index.json cache                                               │
│                                                                             │
│  Context still exists and queryable!                                        │
│  Just filtered out of "active" list on next SessionStart.                   │
│                                                                             │
│  User handles git commit/push separately (not automated).                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow 2: Orphaned Context Recovery (The Magic)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DAY 1: Work in Progress                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  User creates "feature-x" context, does some work                           │
│  Context status: ACTIVE                                                     │
│  events.jsonl has several entries with rich task completion data            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            💥 CRASH / CLOSE 💥
                            (no cleanup runs)
                                    │
                                    ▼
                         Context remains: ACTIVE
                         (this is CORRECT!)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DAY 2: User Reopens Terminal                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  SessionStart hook runs                                                     │
│  └─▶ get_all_contexts(status="active")                                      │
│  └─▶ Finds "feature-x" (still active)                                       │
│  └─▶ Claude: "You have active context 'feature-x'.                          │
│               Last worked on 14 hours ago. Continue?"                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER RESUMES (with Full Context)                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  User: "Yes, continue"                                                      │
│  └─▶ Load context folder                                                    │
│  └─▶ Read events.jsonl to reconstruct full state                            │
│  └─▶ Generate task hydration instructions (includes rich work summaries)    │
│  └─▶ Claude recreates tasks via TaskCreate                                  │
│  └─▶ Append: {"event":"session_started","tasks_hydrated":[...]}             │
│  └─▶ User sees completed work with full context, continues from there       │
│                                                                             │
│  KEY INSIGHT: No "orphan" problem + Rich context preserved!                 │
│  - Context stayed "active" (correct behavior)                               │
│  - Always visible on SessionStart                                           │
│  - Work summaries and file changes preserved                                │
│  - User understands exactly what was done                                   │
└─────────────────────────────────────────────────────────────────────────────┘

OLD MODEL (with in_progress state):
  Session starts working → status = "in_progress"
  Session crashes → status stuck as "in_progress"
  Next session → context hidden (looks abandoned)
  Result: ORPHAN CONTEXT

NEW MODEL (two states only):
  Session starts working → status = "active"
  Session crashes → status remains "active"
  Next session → context visible in list
  Result: NO ORPHAN, user sees their work with full context
```

### Workflow 3: Context Switching via /clear

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CURRENT STATE                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  User working on "auth-system" context                                      │
│  Conversation has history, Claude has context loaded                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            User types: /clear
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONVERSATION CLEARED                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  Conversation history wiped                                                 │
│  Context "auth-system" remains ACTIVE (not completed)                       │
│  /clear triggers SessionStart hook again                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SESSIONSTART RE-RUNS                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  get_all_contexts() shows:                                                  │
│    1. auth-system (still active)                                            │
│    2. database-research (also active)                                       │
│                                                                             │
│  Claude: "You have 2 active contexts..."                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER PICKS DIFFERENT CONTEXT                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  User: "Continue with database-research"                                    │
│  └─▶ Load database-research context                                         │
│  └─▶ Read its events.jsonl                                                  │
│  └─▶ Generate hydration instructions (NEW)                                  │
│  └─▶ Claude recreates pending tasks                                         │
│  └─▶ Append session_started event with tasks_hydrated                       │
│  └─▶ Continue working on different context                                  │
│                                                                             │
│  NOTE: No explicit "switch_context" API needed!                             │
│  /clear + pick different context = natural switching                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow 4: Completion Detection (Suggest, Don't Auto-Complete)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROBLEM WITH AI AUTO-COMPLETION                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. AI finishes work, thinks it's done                                      │
│  2. AI marks context as "completed"                                         │
│  3. User: "Wait! You're not done! You still need to..."                     │
│  4. Context already marked completed → confusing state                      │
│                                                                             │
│  SOLUTION: User explicitly says "wrap up"                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DETECTION (READ-ONLY)                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  System CAN detect if all tasks are completed:                              │
│    └─▶ Replay events.jsonl                                                  │
│    └─▶ Check if every task_added has corresponding task_completed           │
│    └─▶ are_all_tasks_completed(context_id) → bool                           │
│                                                                             │
│  But system DOES NOT auto-complete context.                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUGGESTION (OPTIONAL)                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  Claude can suggest to user:                                                │
│    "All tasks appear to be completed. Would you like to wrap up this        │
│     context?"                                                               │
│                                                                             │
│  User decides:                                                              │
│    Option A: "Yes, wrap up" → complete_context()                            │
│    Option B: "No, I need to..." → context stays active, user adds more work │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workflow 5: Multi-Day Context Work

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MONDAY                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Morning: Create "big-refactor" context                                     │
│  Work all day, make progress                                                │
│  Evening: Close terminal (no explicit "wrap up")                            │
│  Context status: ACTIVE (correct!)                                          │
│  events.jsonl has rich task completions with work summaries                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  TUESDAY                                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Morning: Start session                                                     │
│  └─▶ SessionStart: "You have active context 'big-refactor'..."              │
│  └─▶ User: "Yes, continue"                                                  │
│  └─▶ Load context, see yesterday's work via events.jsonl                    │
│  └─▶ Generate hydration instructions showing completed work with summaries  │
│  └─▶ Claude recreates pending tasks                                         │
│  └─▶ Append session_started event with tasks_hydrated                       │
│  └─▶ Continue where left off with full context                              │
│  Work all day                                                               │
│  Evening: Close terminal again                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            (repeat for days...)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRIDAY                                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Morning: Resume "big-refactor"                                             │
│  Finish remaining work                                                      │
│  User: "wrap up"                                                            │
│  └─▶ complete_context("big-refactor")                                       │
│  └─▶ Context marked completed                                               │
│  User handles git commit/push separately                                    │
└─────────────────────────────────────────────────────────────────────────────┘

KEY INSIGHT: No explicit "pause/resume" needed.
- Context persists across days automatically
- Multiple session_started events in events.jsonl show the journey
- Rich task completion data preserves work understanding
- User just continues working when they return
```

## Edge Cases and Solutions

### Edge Case 1: Corrupted JSONL Line

```
SCENARIO: Process crashes while appending to events.jsonl

events.jsonl:
  {"event":"task_added","task_id":"aiw-1","title":"Fix bug"}
  {"event":"task_started","task_id":"aiw-1"}
  {"event":"task_complet    ← CORRUPTED (incomplete line)

SOLUTION: Skip corrupted line with warning

def read_events(events_file: Path) -> List[dict]:
    events = []
    for line_num, line in enumerate(events_file.read_text().splitlines()):
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            eprint(f"[warn] Skipping corrupted line {line_num}")
    return events

RESULT: Valid events preserved, work not lost
```

### Edge Case 2: User Forgets to "Wrap Up"

```
SCENARIO: User finishes work but doesn't say "wrap up"

IMPACT: Context stays "active" indefinitely

IS THIS A PROBLEM? No!
- Context shows up next session
- User can wrap up then
- Or just ignore it (old contexts sink to bottom of list)
- No automatic cleanup (keeps behavior predictable)

ALTERNATIVE: System could suggest "wrap up" if all tasks completed
(but never auto-complete!)
```

### Edge Case 3: Very Old Stale Contexts

```
SCENARIO: Context created 6 months ago, never completed

SOLUTION: Show ALL contexts, sorted by last_active (recent first)

get_all_contexts() returns:
  1. feature-new (2 hours ago)
  2. research-x (3 days ago)
  3. old-project (186 days ago)  ← Still shown, just at bottom

WHY NOT HIDE?
- Keeps behavior predictable
- User might actually want to resume
- No magic thresholds to tune
- User can manually complete if unwanted
```

### Edge Case 4: Corrupted Cache Files

```
SCENARIO 1: index.json corrupted or out of sync

SOLUTION: Rebuild from context folders

def rebuild_index_cache():
    """Scan all context folders, rebuild index.json"""
    for context_dir in glob("_output/*/contexts/*"):
        context_json = context_dir / "context.json"
        # Add to index

---

SCENARIO 2: context.json corrupted

SOLUTION: Rebuild from events.jsonl

def rebuild_context_cache(context_id):
    """Replay events.jsonl, rebuild context.json"""
    events = read_events(context_id)
    context = build_context_from_events(events)
    write_cache(context)

---

KEY INSIGHT: Caches are ALWAYS rebuildable from source of truth
```

### Edge Case 5: Concurrent Access (NOT SUPPORTED)

```
SCENARIO: Two terminal sessions try to work on same context

CURRENT BEHAVIOR: Undefined (file conflicts, lost updates)

WHY NOT SUPPORTED?
- Single session per context is the design constraint
- Eliminates need for locking mechanisms
- User controls what they're working on via /clear

IF USER TRIES THIS:
- They'll see file conflicts
- This is acceptable (edge case that shouldn't happen)
- User should /clear and pick different context in second session
```

## API Surface

### Context Manager

```python
from _shared.lib.context.context_manager import (
    get_all_contexts,
    get_context,
    create_context,
    update_context,
    complete_context,
    reopen_context
)

# Discovery
contexts = get_all_contexts(status="active")  # Returns recent-first
context = get_context("feature-auth")

# Lifecycle
ctx = create_context(
    context_id="auth-system",
    method="cc-native",
    summary="JWT authentication",
    parent_plan="_output/cc-native/plans/2026-01-20/auth/plan.md",
    tags=["auth", "security"]
)

update_context("auth-system", summary="Updated summary")
complete_context("auth-system")  # User-driven
reopen_context("auth-system")    # Rare, manual operation
```

### Event Log

```python
from _shared.lib.context.event_log import (
    append_event,
    read_events,
    get_current_state,
    are_all_tasks_completed
)

# Append events (source of truth) with rich context
append_event("auth-system", {
    "event": "task_completed",
    "task_id": "aiw-1",
    "evidence": "All tests passing",
    "work_summary": "Created auth middleware with bearer validation...",
    "files_changed": ["src/auth.ts", "test/auth.test.ts"],
    "commit_ref": "a1b2c3d"
})

# Read full history
events = read_events("auth-system")

# Compute current state (from events)
state = get_current_state("auth-system")
# state.tasks, state.notes, state.task_count, etc.

# Suggest completion (don't auto-complete!)
if are_all_tasks_completed("auth-system"):
    print("All tasks done. Wrap up?")
```

### Task Sync (NEW)

```python
from _shared.lib.context.task_sync import (
    generate_hydration_instructions,
    generate_persist_reminder
)

# Called by SessionStart when user selects a context
instructions = generate_hydration_instructions("auth-system")
# Returns formatted output for Claude to recreate tasks

# Returns CLAUDE.md content reminding Claude to persist task changes
reminder = generate_persist_reminder()
```

### Discovery (SessionStart)

```python
from _shared.lib.context.discovery import (
    discover_contexts_for_session,
    format_context_list
)

# Called by SessionStart hook
contexts = discover_contexts_for_session()
message = format_context_list(contexts)
# "You have 2 active contexts: feature-auth (2h ago), research-db (3d ago)"
```

### Cache Rebuild

```python
from _shared.lib.context.cache import (
    rebuild_context_cache,
    rebuild_index_cache,
    rebuild_all
)

# Disaster recovery
rebuild_context_cache("auth-system")  # events.jsonl → context.json
rebuild_index_cache()                 # all context.json → index.json
rebuild_all()                         # Full rebuild from events
```

## Data Schemas

### events.jsonl (Source of Truth)

```jsonl
{"event":"context_created","timestamp":"2026-01-20T10:00:00Z","summary":"JWT auth"}
{"event":"task_added","task_id":"aiw-1","title":"Add JWT middleware","timestamp":"2026-01-20T10:05:00Z"}
{"event":"task_started","task_id":"aiw-1","timestamp":"2026-01-20T10:10:00Z"}
{"event":"task_completed","task_id":"aiw-1","evidence":"tests pass","work_summary":"Created middleware with bearer validation","files_changed":["src/auth.ts","test/auth.test.ts"],"commit_ref":"a1b2c3d","timestamp":"2026-01-20T11:00:00Z"}
{"event":"note_added","content":"Need refresh tokens too","timestamp":"2026-01-20T11:05:00Z"}
{"event":"session_started","timestamp":"2026-01-21T09:00:00Z","tasks_hydrated":["aiw-2"]}
{"event":"context_completed","timestamp":"2026-01-25T17:00:00Z"}
```

**Event Types:**

| Event | Fields | Purpose |
|-------|--------|---------|
| `context_created` | `summary` | Initial context creation |
| `context_completed` | - | User explicitly completed |
| `context_reopened` | - | User reopened completed context |
| `task_added` | `task_id`, `title`, `description?` | New task |
| `task_started` | `task_id` | Work began |
| `task_completed` | `task_id`, `evidence?`, `work_summary?`, `files_changed?`, `commit_ref?` | Task finished with rich context (NEW) |
| `task_blocked` | `task_id`, `reason` | Task blocked |
| `note_added` | `content` | Freeform note |
| `session_started` | `tasks_hydrated?` | User resumed in new session (NEW field) |
| `metadata_updated` | `summary?`, `tags?` | Context metadata changed |

**Note:** `session_ended` removed - unreliable (crashes don't trigger it) and unnecessary with orphan-proof design.

### context.json (Cache)

```json
{
  "id": "feature-auth",
  "method": "cc-native",
  "status": "active",
  "summary": "JWT authentication system",
  "created_at": "2026-01-20T10:00:00Z",
  "last_active": "2026-01-25T09:00:00Z",
  "parent_plan": "_output/cc-native/plans/2026-01-20/auth/plan.md",
  "tags": ["auth", "security"]
}
```

**Note:** `task_count` and `completed_task_count` are NOT stored. These are computed on-demand by replaying events.jsonl.

### index.json (Global Cache)

```json
{
  "version": "2.0",
  "updated_at": "2026-01-25T10:00:00Z",
  "methods": {
    "cc-native": {
      "context_dir": "_output/cc-native/contexts"
    },
    "gsd": {
      "context_dir": "_output/gsd/contexts"
    }
  },
  "contexts": {
    "feature-auth": {
      "id": "feature-auth",
      "status": "active",
      "method": "cc-native",
      "created_at": "2026-01-20T10:00:00Z",
      "last_active": "2026-01-25T09:00:00Z",
      "folder": "_output/cc-native/contexts/feature-auth",
      "summary": "JWT authentication system"
    }
  }
}
```

## Implementation Phases

### Phase 1: Core Infrastructure

**Create:**
- `_shared/lib/base/atomic_write.py` (from cc-native)
- `_shared/lib/base/utils.py` (from cc-native)
- `_shared/lib/context/context_manager.py`
- `_shared/lib/context/event_log.py`
- `_shared/lib/context/cache.py`

**Verification:**
```bash
python -c "
from _shared.lib.context.context_manager import create_context
ctx = create_context('test', 'cc-native', 'Test')
print(f'Created: {ctx.folder}')
"

ls _output/cc-native/contexts/test/
# Should show: context.json, events.jsonl

cat _output/cc-native/contexts/test/events.jsonl
# Should show: {"event":"context_created",...}
```

### Phase 2: SessionStart Discovery + Task Hydration

**Create:**
- `_shared/lib/context/discovery.py`
- `_shared/lib/context/task_sync.py` (NEW)
- `_shared/hooks/session_start.py`

**Hook Registration** (`.claude/settings.json`):
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "python _shared/hooks/session_start.py"
      }]
    }]
  }
}
```

**Verification:**
Create a context with tasks, close session, reopen. Should see:
- "You have active context..."
- Task hydration instructions
- Claude recreates tasks via TaskCreate

### Phase 3: Event Logging Integration + Rich Task Events

**Update:**
- CC-Native uses `event_log.append_event()` for task tracking
- Plan completion appends `task_completed` events with `work_summary`, `files_changed`, `commit_ref`
- Session resume appends `session_started` event with `tasks_hydrated` list
- CLAUDE.md documents task persistence requirements

**Verification:**
```bash
cat _output/cc-native/contexts/test/events.jsonl
# Should show task events with work_summary and files_changed
# Should show session_started events with tasks_hydrated
```

### Phase 4: Completion Flow

**Integration:**
- Detect "wrap up" / "done" / "finish" intent
- Call `complete_context()`
- Context marked as completed (git operations are user's responsibility)

**Verification:**
Say "wrap up" → context marked completed → next session: not in active list

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Read-only vs Writable separation** | Clean separation, method folders pristine after `aiw init`, centralized data |
| **Event-sourced state** | Complete audit trail, zero state loss, easy migration, time-travel debugging |
| **Two-state model** | Eliminates orphan problem entirely, predictable behavior, simple recovery |
| **Append-only JSONL** | Crash-safe, no corruption risk, immutable history |
| **Derived caches** | Fast queries without replaying events, rebuildable if corrupted |
| **Single session per context** | No locking needed, no concurrent access complexity, user knows what they're working on |
| **User-driven completion** | Prevents premature context closure, user retains control |
| **No stale filtering** | Predictable behavior, no magic thresholds, user sees all their work |
| **Git-agnostic** | User controls git workflow, system stays lightweight |
| **No session_ended event** | Unreliable (crashes don't trigger), unnecessary with orphan-proof design |
| **Computed task counts** | Not stored in cache (computed from events when needed), reduces cache updates |
| **Rich task events** | Preserves work context across sessions, not just completion status |
| **Claude task integration** | Leverages native tools, seamless user experience, persistent task state |

## Benefits Summary

### For Users
- ✅ Never lose context when session crashes
- ✅ Automatic work discovery on session start
- ✅ Multi-day work persists effortlessly
- ✅ Clear context switching via /clear
- ✅ User controls completion (not AI)
- ✅ Git workflow remains separate and flexible
- ✅ **NEW**: Tasks automatically restored to Claude's TaskList
- ✅ **NEW**: Full work context preserved (what was done, files changed, commits)

### For Developers
- ✅ No code duplication across templates
- ✅ Shared infrastructure in `_shared/`
- ✅ Event-sourced architecture (audit trail)
- ✅ Crash-safe with atomic writes
- ✅ No locking complexity (single session per context)
- ✅ Rebuildable caches (disaster recovery)
- ✅ **NEW**: Clean read-only/writable separation
- ✅ **NEW**: Rich task data for cross-session understanding

### For System Reliability
- ✅ Zero state loss (events preserved)
- ✅ No orphan contexts (two-state model)
- ✅ Graceful degradation (skip corrupted lines)
- ✅ Cache corruption recoverable (rebuild from events)
- ✅ Predictable behavior (no hidden state)
- ✅ **NEW**: Integration with Claude's native tools (bi-directional sync)

## Visual Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SHARED INFRASTRUCTURE: THE BIG PICTURE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER SESSIONS                 CONTEXT SYSTEM               DATA LAYER      │
│                                                                             │
│  ┌──────────┐                  ┌──────────────┐            ┌────────────┐  │
│  │ Session  │                  │   ACTIVE     │            │events.jsonl│  │
│  │  Start   │────discover──────▶  Contexts    │◀──replay───│  (truth)   │  │
│  └──────────┘    (hydrate       └──────────────┘            └────────────┘  │
│       │           tasks)                │                           │         │
│       │                                 │                           │         │
│  ┌──────────┐                  ┌──────────────┐            ┌────────────┐  │
│  │   Work   │                  │   Context    │            │context.json│  │
│  │ Happens  │────append────────▶    Events    │────cache───│  (cache)   │  │
│  └──────────┘    (rich          └──────────────┘            └────────────┘  │
│       │           context)              │                           │         │
│       │                                 │                           │         │
│  ┌──────────┐                  ┌──────────────┐            ┌────────────┐  │
│  │ Wrap Up  │                  │  COMPLETED   │            │ index.json │  │
│  │(explicit)│────complete──────▶   Context    │────cache───│  (cache)   │  │
│  └──────────┘                  └──────────────┘            └────────────┘  │
│                                                                             │
│  CRASH? ──▶ Context stays ACTIVE ──▶ Visible on next session ──▶ Resume    │
│             Tasks hydrated with full work history                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

CORE PRINCIPLES:
1. Read-Only/Writable Separation = Clean code/data boundaries
2. Events = Source of Truth (append-only, crash-safe)
3. Caches = Performance (rebuildable from events)
4. Two States = No Orphans (active or completed, nothing in between)
5. User Driven = No Surprises (user explicitly completes work)
6. Single Session = No Conflicts (one session per context)
7. Rich Task Events = Context Preserved (work summaries, files, commits)
8. Claude Integration = Seamless Experience (native tools + persistence)
```

---

*This document provides the conceptual foundation for the shared context management infrastructure. For implementation details, see the full plan document.*
