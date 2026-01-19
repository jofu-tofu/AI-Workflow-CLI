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
