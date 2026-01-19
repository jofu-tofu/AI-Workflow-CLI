# CC-Native Template Schema

## Philosophy

CC-Native uses Claude Code's native tools without adding workflow complexity. No hooks, no implicit behaviors, just explicit commands that compose native capabilities.

---

## Directory Structure

```
packages/cli/src/templates/cc-native/
├── _cc-native/
│   └── workflows/*.md        # Workflow definitions
├── .claude/commands/cc-native/  # Claude Code slash commands
├── .windsurf/workflows/cc-native/  # Windsurf workflows
├── .gitignore                # Ignores _output/cc-native/
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

Optional outputs in `_output/cc-native/`:

```
_output/cc-native/
├── findings.md      # Research findings (optional)
├── plans/           # Archived approved plans (auto-saved by hook)
└── scratch/         # Working notes
```

---

## Key Principles

1. **Explicit invocation** - No hooks, no implicit behavior
2. **Native tools only** - AskUserQuestion, Task, EnterPlanMode, Write
3. **Context efficiency** - Explore subagents discard context, findings persist
4. **User control** - Clarification before action, plan approval before execution
5. **Composable** - Each workflow is independent, no interdependencies

---

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial release with fix, research, implement workflows |
