# CC-Native Template Schema

## Philosophy

CC-Native uses Claude Code's native tools with minimal workflow overhead. Plan review runs automatically via external CLIs (Codex/Gemini) and parallel Claude Code agents when exiting plan mode.

This directory is the canonical source for the packaged CC-Native template. Build/package steps copy it directly; they do not mirror from a repo-root `.aiwcli/_cc-native`.

---

## Directory Structure

```
packages/cli/src/templates/cc-native/
├── _cc-native/               # METHOD-SPECIFIC: CC-Native template code
│   ├── workflows/*.md        # Workflow definitions
│   ├── hooks/                # Hook scripts (TypeScript, run via bun)
│   │   ├── cc-native-plan-review.ts   # Unified plan review (CLI + agents)
│   │   ├── plan_questions_early.ts    # Phase A clarification prompt
│   │   ├── mark_questions_asked.ts    # Tracks whether clarification happened
│   │   ├── enhance_plan_post_write.ts # Post-write plan enhancement
│   │   ├── enhance_plan_post_subagent.ts # Post-subagent plan enhancement
│   │   └── validate_task_prompt.ts    # Task prompt validation gate
│   ├── lib-ts/               # CC-Native specific TypeScript libraries
│   │   ├── cc-native-state.ts # State management
│   │   ├── config.ts          # Configuration loading
│   │   └── reviewers/         # Plan review implementations
│   │       └── codex.ts       # Codex CLI reviewer
│   └── cc-native.config.json  # Plan review configuration
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
│       ├── state.json        # Context state (source of truth)
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

## Configuration (`_cc-native/cc-native.config.json`)

CC-Native settings are stored in `_cc-native/cc-native.config.json`:

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
      "simple": { "min": 3, "max": 3 },
      "medium": { "min": 5, "max": 5 },
      "high": { "min": 7, "max": 7 },
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
| `agentReview.blockOnFail` | Block Claude if unknown agent fails | `true` |
| `agentReview.orchestrator.enabled` | Use orchestrator for complexity analysis | `true` |
| `agentReview.orchestrator.model` | Model for orchestrator | `haiku` |
| `agentReview.agentSelection.simple` | Agent count for simple plans | `3-3` |
| `agentReview.agentSelection.medium` | Agent count for medium plans | `5-5` |
| `agentReview.agentSelection.high` | Agent count for complex plans | `7-7` |

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `CC_NATIVE_ROBUST_WRITES` | Enable atomic writes and retry logic | `true` |
| `CC_NATIVE_NOTIFICATIONS` | Enable voice/visual notifications | `false` |

---

## Context Management (Phase 1 - State Based)

CC-Native uses **shared infrastructure** for cross-session context persistence:

```
_output/
├── index.json                        # CACHE: Aggregates all contexts
└── contexts/                         # All contexts (method-agnostic)
    ├── feature-auth/
    │   ├── state.json                # SOURCE OF TRUTH: Context state
    │   └── plans/                    # Archived plans for this context
    │       └── 2026-01-25-auth.md
    └── another-context/
        └── state.json
```

### Data Hierarchy

| Level | File | Role | Recovery |
|-------|------|------|----------|
| 1 (Truth) | `state.json` | Context state (source of truth) | Cannot be rebuilt |
| 2 (Cache) | `index.json` | Global context index | Rebuild from state files |

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
        { "type": "command", "command": "bun run .aiwcli/_cc-native/hooks/cc-native-plan-review.ts", "timeout": 600000 }
      ]
    }]
  }
}
```

**Hook order matters:** Archive runs on PermissionRequest:ExitPlanMode before reviews. If a review blocks, the archived plan is available for reference. Only plans that pass all reviews proceed to implementation.

| Hook | Trigger | Purpose |
|------|---------|---------|
| `cc-native-plan-review.ts` | ExitPlanMode | Unified review: CLI + orchestrator + agents |
| `mark_questions_asked.ts` | PostToolUse:AskUserQuestion | Mark that clarification questions were asked |
| `enhance_plan_post_write.ts` | PostToolUse:Write | Nudge plan improvement after write-heavy work |
| `enhance_plan_post_subagent.ts` | PostToolUse:Task | Nudge plan improvement after subagent work |
| `plan_questions_early.ts` | UserPromptSubmit | Injects Phase A clarification in plan mode |
| `validate_task_prompt.ts` | PreToolUse:Task | Blocks vague or non-self-contained Task prompts |

### Claude Feedback Mechanism

The unified review hook returns structured JSON to Claude Code:

```json
{
  "hookSpecificOutput": {
    "additionalContext": "Review results and recommendations...",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Reason for blocking..."
  }
}
```

When a plan fails review and `blockOnFail` is enabled, Claude is blocked from proceeding until the plan is revised.

### Unified Review Pipeline

The `cc-native-plan-review.ts` hook runs 4 phases:

1. **Phase 1: CLI Reviewers** - Sends plan to Codex/Gemini for external review
2. **Phase 2: Orchestrator** - Analyzes plan complexity and selects appropriate agents
3. **Phase 3: Agent Reviews** - Spawns selected Claude Code agents in parallel
4. **Phase 4: Combined Output** - Generates single JSON + Markdown output file

#### Orchestrator Details

The orchestrator uses a fast model (Haiku) to:
- Classify plan complexity (simple/medium/high)
- Categorize the plan (code/infrastructure/documentation/life/business/design/research)
- Select appropriate agents based on complexity and category

Plans run a complexity-tiered reviewer set: simple plans use 3 agents, medium plans use 5, and high-complexity plans use 7 (including mandatory reviewers).

#### Agent Execution

Each selected agent:
1. Runs as a headless Claude Code instance with `--agent` flag
2. Executes in parallel via Promise.all()
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
| 1.4.0 | **Phase 1 Shared Infrastructure**: Event-sourced context management in `core/`, contexts in `_output/contexts/`, atomic writes. **BREAKING**: Renamed config.json → cc-native.config.json |
| 1.3.0 | Consolidated CLI + agent review into single unified hook with combined output |
| 1.2.0 | Added multi-agent plan review via Claude Code agents, reordered hooks (archive last) |
| 1.1.0 | Added plan review via Codex/Gemini with Claude feedback, config.json |
| 1.0.0 | Initial release with fix, research, implement workflows |
