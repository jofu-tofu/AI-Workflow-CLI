# CC-Native

A minimal template that uses Claude Code's native tools without added complexity.

## Philosophy

Instead of specialized workflows, hooks, and implicit behaviors, CC-Native leverages what Claude Code already does well:

- **Ask questions** before acting
- **Explore** with subagents for context
- **Plan** using native plan mode
- **Execute** with user approval

No magic. No hidden state. Just composable commands.

## Commands

### `/cc-native:fix`

Fix an issue with proper context gathering.

```
1. Clarify: Ask questions about the issue
2. Explore: Spawn agents to understand the codebase
3. Plan: Enter native plan mode with findings
4. Execute: Implement after approval
```

### `/cc-native:research`

Research a topic and persist findings.

```
1. Clarify: What do you need to understand?
2. Explore: Spawn agents to investigate
3. Write: Save findings to _output/cc-native/findings.md
```

### `/cc-native:implement`

Implement a new feature.

```
1. Clarify: Requirements and scope questions
2. Explore: Understand existing patterns
3. Plan: Design the implementation
4. Execute: Build after approval
```

## Why CC-Native?

| Problem | CC-Native Solution |
|---------|-------------------|
| Hooks cause isolation issues | No hooks |
| Implicit behaviors conflict | Explicit invocation only |
| Specialized workflows add overhead | Use native tools |
| Context accumulates in main agent | Explore subagents discard context |
| Findings lost between sessions | Optional file persistence |

## Output

Optional outputs go to `_output/cc-native/`:

```
_output/cc-native/
├── findings.md      # Research findings
├── plans/           # Archived approved plans
└── scratch/         # Working notes
```

## The Pattern

Every CC-Native workflow follows the same structure:

```
Clarify → Explore → [Plan] → [Execute]
```

- **Clarify**: Use AskUserQuestion to understand intent
- **Explore**: Spawn Explore subagents for context (context discarded)
- **Plan**: Optional - use native plan mode for complex tasks
- **Execute**: Optional - implement after user approval

The brackets indicate optional steps. Research only needs Clarify → Explore → Write.

## When to Use

- You want native Claude Code behavior, not custom workflows
- You need context gathering without context pollution
- You want explicit control over each phase
- You're tired of implicit behaviors causing issues

---

## Context Management (Phase 1 - Shared Infrastructure)

CC-Native uses **event-sourced context management** via shared infrastructure in `_shared/`:

```
_output/contexts/
├── feature-auth/                    # Context folder (method-agnostic)
│   ├── context.json                 # Derived cache with current state
│   ├── events.jsonl                 # SOURCE OF TRUTH (append-only)
│   └── plans/                       # Archived plans for this context
│       └── 2026-01-25-auth-plan.md
└── another-context/
    ├── context.json
    └── events.jsonl
```

### Data Hierarchy

| File | Role | Notes |
|------|------|-------|
| `events.jsonl` | **Source of truth** | Append-only, never modified |
| `context.json` | Derived cache | Rebuilt from events if corrupted |
| `_output/index.json` | Global cache | Aggregates all contexts |

### Context Schema

```json
{
  "id": "feature-auth",
  "status": "active",
  "summary": "JWT authentication system",
  "method": "cc-native",
  "in_flight": {
    "mode": "implementing",
    "artifact_path": "_output/contexts/feature-auth/plans/2026-01-25-auth.md",
    "artifact_hash": "a1b2c3d4"
  }
}
```

### In-Flight Modes

| Mode | Meaning |
|------|---------|
| `none` | Normal context, no special handling |
| `planning` | Currently in plan mode |
| `pending_implementation` | Plan approved, awaiting implementation |
| `implementing` | Implementation in progress |

### Why Event Sourcing?

- **Crash recovery**: Replay events to rebuild state
- **Audit trail**: Full history of all actions
- **No orphan state**: Contexts always visible (no "in_progress" limbo)
- **Cross-session**: State persists across `/clear` and session restarts

---

## Troubleshooting

### Plan Archive Failures

**Symptom:** Plan not appearing in `_output/contexts/{id}/plans/`

**Check:**
1. Context exists: `ls _output/contexts/`
2. Events logged: `cat _output/contexts/{id}/events.jsonl`
3. Hook logs in terminal output

**Solutions:**
- **Disk full:** Clear space (requires 10MB minimum)
- **Permissions:** Check write access to `_output/`

### Context Recovery

**Symptom:** `context.json` appears corrupted

**Fix:** Context can be rebuilt from events:
```bash
# Events are the source of truth - context.json is derived
# Delete context.json and it will be rebuilt on next access
rm _output/contexts/{id}/context.json
```

### Notification Issues

**Symptom:** No voice/visual notifications after plan review

**Check:**
```bash
# Notifications disabled by default
echo $CC_NATIVE_NOTIFICATIONS  # Should be 'true'
```

**Enable:**
```bash
export CC_NATIVE_NOTIFICATIONS=true
```
