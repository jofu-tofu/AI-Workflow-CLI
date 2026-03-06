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

## Context Management (Phase 2 - Shared Infrastructure)

CC-Native uses **direct-state context management** via shared infrastructure in `core/`:

```
_output/contexts/
├── feature-auth/                    # Context folder (method-agnostic)
│   ├── state.json                   # SOURCE OF TRUTH (direct read/write)
│   └── plans/                       # Archived plans for this context
│       └── 2026-01-25-auth-plan.md
└── another-context/
    └── state.json
```

### Data Hierarchy

| File | Role | Notes |
|------|------|-------|
| `state.json` | **Source of truth** | Direct read/write per context |
| `_output/index.json` | Global cache | Fast session-to-context lookup |

### Context Schema

```json
{
  "id": "feature-auth",
  "status": "active",
  "summary": "JWT authentication system",
  "method": "cc-native",
  "mode": "active",
  "plan_path": "_output/contexts/feature-auth/plans/2026-01-25-auth.md",
  "plan_hash": "a1b2c3d4",
  "plan_signature": "approved"
}
```

### Context Modes

| Mode | Meaning |
|------|---------|
| `idle` | No active plan or work in progress |
| `has_plan` | Plan exists but not yet being implemented |
| `active` | Implementation in progress |

### Why 2-Layer Architecture?

- **Simple reads**: `state.json` is read directly, no event replay needed
- **Fast lookup**: `index.json` provides global session-to-context mapping without scanning directories
- **No orphan state**: Contexts always visible (no "in_progress" limbo)
- **Cross-session**: State persists across `/clear` and session restarts

---

## Troubleshooting

### Plan Archive Failures

**Symptom:** Plan not appearing in `_output/contexts/{id}/plans/`

**Check:**
1. Context exists: `ls _output/contexts/`
2. State file exists: `cat _output/contexts/{id}/state.json`
3. Hook logs in terminal output

**Solutions:**
- **Disk full:** Clear space (requires 10MB minimum)
- **Permissions:** Check write access to `_output/`

### Context Recovery

**Symptom:** `state.json` appears corrupted

**WARNING:** Do NOT delete `state.json` -- it IS the source of truth and cannot be rebuilt.

**Fix:** Edit `state.json` directly to correct invalid fields, or restore from a backup:
```bash
# state.json is the source of truth - do NOT delete it
# Instead, inspect and fix the JSON manually
cat _output/contexts/{id}/state.json
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
