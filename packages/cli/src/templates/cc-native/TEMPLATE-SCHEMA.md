# CC-Native Template Schema

## Philosophy

CC-Native uses Claude Code's native tools with minimal workflow overhead. Plan review runs automatically via external CLIs (Codex/Gemini) and parallel Claude Code agents when exiting plan mode.

---

## Directory Structure

```
packages/cli/src/templates/cc-native/
├── _shared/                  # SHARED: Cross-method infrastructure (Phase 1)
│   ├── lib/
│   │   ├── base/             # Base utilities
│   │   │   ├── atomic_write.py   # Cross-platform atomic file writes
│   │   │   ├── constants.py      # Security and configuration constants
│   │   │   └── utils.py          # Common functions
│   │   └── context/          # Context management
│   │       ├── context_manager.py  # Context CRUD operations
│   │       ├── event_log.py        # JSONL append/read utilities
│   │       └── cache.py            # Cache rebuild utilities
│   └── hooks/
│       └── session_start.py      # SessionStart hook (context discovery)
├── _cc-native/               # METHOD-SPECIFIC: CC-Native template code
│   ├── workflows/*.md        # Workflow definitions
│   ├── hooks/                # Hook scripts
│   │   ├── cc-native-plan-review.py   # Unified plan review (CLI + agents)
│   │   └── archive_plan.py            # Archives approved plans
│   ├── lib/                  # CC-Native specific utilities
│   │   ├── utils.py          # Common functions for hooks
│   │   ├── atomic_write.py   # Cross-platform atomic file writes
│   │   ├── async_archive.py  # Non-blocking plan archival
│   │   └── constants.py      # Security and configuration constants
│   ├── scripts/              # Utility scripts
│   │   └── aggregate_agents.py  # Auto-detect agents from frontmatter
│   └── plan-review.config.json  # Plan review configuration
├── .claude/commands/cc-native/  # Claude Code slash commands
├── .claude/agents/cc-native/    # Agent definitions for plan review
├── .claude/settings.json     # Hook wiring
├── .windsurf/workflows/cc-native/  # Windsurf workflows
├── .gitignore                # Ignores _output/
├── CC-NATIVE-README.md       # User documentation
└── TEMPLATE-SCHEMA.md        # This file
```

---

## Native Tools Used

| Tool | Purpose |
|------|---------|
| `AskUserQuestion` | Clarify requirements before exploration |
| `Task` (Explore) | Gather codebase context via subagents |
| `Task` (general-purpose) | Execute complex subtasks |
| `EnterPlanMode` | Native planning with user approval |
| `Write` | Persist findings to scratch file (optional) |

---

## Workflows

| Workflow | Purpose |
|----------|---------|
| fix | Clarify → Explore → Plan → Execute |
| research | Clarify → Explore → Write findings |
| implement | Clarify → Explore → Plan → Execute (for new features) |

---

## Output Structure

All outputs in `_output/`:

```
_output/
├── index.json                # Global context cache
├── contexts/                 # Context folders (method-agnostic)
│   └── {context-id}/
│       ├── context.json      # Context state cache
│       ├── events.jsonl      # Event log (source of truth)
│       └── plans/            # Archived plans for this context
│           └── YYYY-MM-DD-{slug}.md
├── cc-native/                # CC-Native specific outputs
│   ├── findings.md           # Research findings (optional)
│   ├── reviews/              # Combined review artifacts (CLI + agents)
│   │   └── YYYY-MM-DD/
│   │       ├── HHMMSS-session-{id}-plan.md      # Copy of plan
│   │       ├── HHMMSS-session-{id}-review.json  # Combined JSON
│   │       └── HHMMSS-session-{id}-review.md    # Combined Markdown
│   └── scratch/              # Working notes
```

---

## Configuration (`_cc-native/plan-review.config.json`)

CC-Native settings are stored in `_cc-native/plan-review.config.json`:

```json
{
  "planReview": {
    "enabled": true,
    "reviewers": {
      "codex": { "enabled": true, "model": "", "timeout": 120 },
      "gemini": { "enabled": false, "model": "", "timeout": 120 }
    },
    "blockOnFail": false
  },
  "agentReview": {
    "enabled": true,
    "timeout": 120,
    "blockOnFail": true,
    "orchestrator": {
      "enabled": true,
      "model": "haiku",
      "timeout": 30
    },
    "agentSelection": {
      "simple": { "min": 0, "max": 0 },
      "medium": { "min": 1, "max": 2 },
      "high": { "min": 2, "max": 4 },
      "fallbackCount": 2
    }
  }
}
```

### Plan Review Settings (External CLIs)

| Setting | Purpose | Default |
|---------|---------|---------|
| `planReview.enabled` | Master switch for external CLI review | `true` |
| `planReview.reviewers.codex.enabled` | Use Codex CLI for review | `true` |
| `planReview.reviewers.gemini.enabled` | Use Gemini CLI for review | `false` |
| `planReview.reviewers.*.model` | Model override | `""` (use default) |
| `planReview.reviewers.*.timeout` | Seconds before timeout | `120` |
| `planReview.blockOnFail` | Block Claude if review fails | `false` |

### Agent Review Settings (Claude Code Agents)

| Setting | Purpose | Default |
|---------|---------|---------|
| `agentReview.enabled` | Master switch for agent review | `true` |
| `agentReview.timeout` | Seconds per agent before timeout | `120` |
| `agentReview.blockOnFail` | Block Claude if any agent fails | `true` |
| `agentReview.orchestrator.enabled` | Use orchestrator for complexity analysis | `true` |
| `agentReview.orchestrator.model` | Model for orchestrator | `haiku` |
| `agentReview.agentSelection.simple` | Agent count for simple plans | `0-0` |
| `agentReview.agentSelection.medium` | Agent count for medium plans | `1-2` |
| `agentReview.agentSelection.high` | Agent count for complex plans | `2-4` |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CC_NATIVE_ROBUST_WRITES` | Enable atomic writes and retry logic | `true` |
| `CC_NATIVE_NOTIFICATIONS` | Enable voice/visual notifications | `false` |

---

## Context Management (Phase 1 - Event Sourced)

CC-Native uses **shared infrastructure** for cross-session context persistence:

```
_output/
├── index.json                        # CACHE: Aggregates all contexts
└── contexts/                         # All contexts (method-agnostic)
    ├── feature-auth/
    │   ├── context.json              # CACHE: Derived from events
    │   ├── events.jsonl              # SOURCE OF TRUTH (append-only)
    │   └── plans/                    # Archived plans for this context
    │       └── 2026-01-25-auth.md
    └── another-context/
        ├── context.json
        └── events.jsonl
```

### Data Hierarchy

| Level | File | Role | Recovery |
|-------|------|------|----------|
| 1 (Truth) | `events.jsonl` | Append-only event log | Cannot be rebuilt |
| 2 (Cache) | `context.json` | Current state snapshot | Rebuild from events |
| 3 (Cache) | `index.json` | Global context index | Rebuild from context files |

### Context Schema

```json
{
  "id": "feature-auth",
  "status": "active",
  "summary": "JWT authentication system",
  "method": "cc-native",
  "created_at": "2026-01-20T10:00:00Z",
  "last_active": "2026-01-25T09:00:00Z",
  "in_flight": {
    "mode": "implementing",
    "artifact_path": "_output/contexts/feature-auth/plans/2026-01-25-auth.md",
    "artifact_hash": "a1b2c3d4",
    "started_at": "2026-01-25T09:00:00Z"
  }
}
```

### In-Flight Mode Values

| Mode | Meaning | SessionStart Behavior |
|------|---------|----------------------|
| `none` | Normal context | Show in context picker |
| `planning` | In plan mode | Continue planning |
| `pending_implementation` | Plan approved | Auto-continue implementation |
| `implementing` | Implementation active | Continue implementation |

### Event Types

```jsonl
{"event":"context_created","timestamp":"2026-01-20T10:00:00Z","summary":"JWT auth","method":"cc-native"}
{"event":"task_added","task_id":"aiw-1","subject":"Add JWT middleware","timestamp":"..."}
{"event":"task_completed","task_id":"aiw-1","evidence":"tests pass","timestamp":"..."}
{"event":"plan_created","path":"_output/contexts/.../plans/...","hash":"a1b2c3","timestamp":"..."}
{"event":"context_completed","timestamp":"..."}
```

### Robust Writes

When `CC_NATIVE_ROBUST_WRITES=true` (default):

1. **Atomic writes** - Uses temp file + rename (POSIX) or MoveFileExW (Windows)
2. **Retry logic** - 2 attempts with 500ms, 1s backoff (max 1.5s retry window)
3. **Crash safety** - If process dies mid-write, original file remains intact

**Why atomic writes?**
- Prevents corruption if hook killed mid-write
- Guarantees readers see complete file or nothing
- Cross-platform (Windows + POSIX)

---

## Hooks (`_cc-native/hooks/`)

Hook scripts live in `_cc-native/hooks/`. IDE-specific wiring in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "ExitPlanMode",
      "hooks": [
        { "type": "command", "command": "python _cc-native/hooks/set_plan_state.py", "timeout": 5000 },
        { "type": "command", "command": "python _cc-native/hooks/cc-native-plan-review.py", "timeout": 600000 }
      ]
    }]
  }
}
```

**Hook order matters:** Reviews run first; archive runs on Edit/Write/Bash. If a review blocks, the plan is not archived. Only plans that pass all reviews get archived.

| Hook | Trigger | Purpose |
|------|---------|---------|
| `set_plan_state.py` | ExitPlanMode | Sets plan state before review |
| `cc-native-plan-review.py` | ExitPlanMode | Unified review: CLI + orchestrator + agents |
| `archive_plan.py` | Edit/Write/Bash | Archives approved plans when implementation starts |

### Claude Feedback Mechanism

The unified review hook returns structured JSON to Claude Code:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Review results and recommendations..."
  },
  "decision": "block",  // Optional: blocks Claude if review fails
  "reason": "Reason for blocking..."
}
```

When a plan fails review and `blockOnFail` is enabled, Claude is blocked from proceeding until the plan is revised.

### Unified Review Pipeline

The `cc-native-plan-review.py` hook runs 4 phases:

1. **Phase 1: CLI Reviewers** - Sends plan to Codex/Gemini for external review
2. **Phase 2: Orchestrator** - Analyzes plan complexity and selects appropriate agents
3. **Phase 3: Agent Reviews** - Spawns selected Claude Code agents in parallel
4. **Phase 4: Combined Output** - Generates single JSON + Markdown output file

#### Orchestrator Details

The orchestrator uses a fast model (Haiku) to:
- Classify plan complexity (simple/medium/high)
- Categorize the plan (code/infrastructure/documentation/life/business/design/research)
- Select appropriate agents based on complexity and category

Simple plans skip agent review entirely. Medium/high complexity plans get 1-4 agents based on configuration.

#### Agent Execution

Each selected agent:
1. Runs as a headless Claude Code instance with `--agent` flag
2. Executes in parallel via ThreadPoolExecutor
3. Uses `--permission-mode bypassPermissions` and `--max-turns 3`
4. Returns structured JSON verdict (pass/warn/fail)

---

## Key Principles

1. **Native tools first** - AskUserQuestion, Task, EnterPlanMode, Write
2. **Minimal implicit behavior** - Only plan review runs automatically
3. **Context efficiency** - Explore subagents discard context, findings persist
4. **User control** - Clarification before action, plan approval before execution
5. **Composable** - Each workflow is independent, no interdependencies
6. **Multi-layer validation** - Plans reviewed by external CLIs + orchestrator + agents
7. **Selective archival** - Only plans passing all reviews get archived
8. **Single output** - One JSON + one Markdown file per review (no duplication)

---

## Version History

| Version | Changes |
|---------|---------|
| 1.4.0 | **Phase 1 Shared Infrastructure**: Event-sourced context management in `_shared/`, contexts in `_output/contexts/`, atomic writes. **BREAKING**: Renamed config.json → plan-review.config.json |
| 1.3.0 | Consolidated CLI + agent review into single unified hook with combined output |
| 1.2.0 | Added multi-agent plan review via Claude Code agents, reordered hooks (archive last) |
| 1.1.0 | Added plan review via Codex/Gemini with Claude feedback, config.json |
| 1.0.0 | Initial release with fix, research, implement workflows |
