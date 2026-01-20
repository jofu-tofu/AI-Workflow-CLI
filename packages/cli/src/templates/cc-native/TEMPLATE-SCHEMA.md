# CC-Native Template Schema

## Philosophy

CC-Native uses Claude Code's native tools with minimal workflow overhead. Plan review runs automatically via external CLIs (Codex/Gemini) and parallel Claude Code agents when exiting plan mode.

---

## Directory Structure

```
packages/cli/src/templates/cc-native/
├── _cc-native/
│   ├── workflows/*.md        # Workflow definitions
│   ├── hooks/                # Hook scripts
│   │   ├── cc-native-plan-review.py   # Plan review via Codex/Gemini
│   │   ├── cc-native-agent-review.py  # Plan review via Claude agents
│   │   └── archive_plan.py            # Archives approved plans (runs last)
│   └── config.json           # CC-Native configuration
├── .claude/commands/cc-native/  # Claude Code slash commands
├── .claude/settings.json     # Hook wiring
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

All outputs in `_output/cc-native/`:

```
_output/cc-native/
├── findings.md           # Research findings (optional)
├── plans/                # Archived approved plans
│   ├── YYYY-MM-DD/       # Date-organized plan archives
│   │   └── HHMMSS-session-{id}.md
│   ├── reviews/          # External CLI review artifacts (Codex/Gemini)
│   │   └── YYYY-MM-DD/
│   │       ├── HHMMSS-session-{id}-plan.md
│   │       ├── HHMMSS-session-{id}-review.md
│   │       ├── HHMMSS-session-{id}-codex.json
│   │       └── HHMMSS-session-{id}-gemini.json
│   └── agent-reviews/    # Claude agent review artifacts
│       └── YYYY-MM-DD/
│           ├── HHMMSS-session-{id}-plan.md
│           ├── HHMMSS-session-{id}-agents-review.md
│           └── HHMMSS-session-{id}-{agent-name}.json
└── scratch/              # Working notes
```

---

## Configuration (`_cc-native/config.json`)

CC-Native settings are stored in `_cc-native/config.json`:

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
    "agents": [
      { "name": "architect-reviewer", "model": "sonnet", "focus": "architectural concerns", "enabled": true },
      { "name": "penetration-tester", "model": "sonnet", "focus": "security vulnerabilities", "enabled": true },
      { "name": "performance-engineer", "model": "sonnet", "focus": "performance bottlenecks", "enabled": true },
      { "name": "accessibility-tester", "model": "sonnet", "focus": "accessibility compliance", "enabled": true }
    ]
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
| `agentReview.agents[].name` | Agent name (used in `--agent` flag) | Required |
| `agentReview.agents[].model` | Model: `sonnet`, `opus`, `haiku` | `sonnet` |
| `agentReview.agents[].focus` | Focus area description (for logging) | `general review` |
| `agentReview.agents[].enabled` | Whether this agent runs | `true` |

---

## Hooks (`_cc-native/hooks/`)

Hook scripts live in `_cc-native/hooks/`. IDE-specific wiring in `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "ExitPlanMode",
      "hooks": [
        { "type": "command", "command": "python _cc-native/hooks/cc-native-plan-review.py", "timeout": 300000 },
        { "type": "command", "command": "python _cc-native/hooks/cc-native-agent-review.py", "timeout": 600000 },
        { "type": "command", "command": "python _cc-native/hooks/archive_plan.py", "timeout": 600 }
      ]
    }]
  }
}
```

**Hook order matters:** Reviews run first; archive runs last. If a review blocks, the plan is not archived. Only plans that pass all reviews get archived.

| Hook | Trigger | Purpose |
|------|---------|---------|
| `cc-native-plan-review.py` | ExitPlanMode | Sends plan to Codex/Gemini for review |
| `cc-native-agent-review.py` | ExitPlanMode | Spawns parallel Claude Code agents for review |
| `archive_plan.py` | ExitPlanMode | Archives approved plans (runs last) |

### Claude Feedback Mechanism

Both review hooks return structured JSON to Claude Code:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Review results and recommendations..."
  },
  "decision": "block",  // Optional: blocks Claude if review fails
  "reason": "Reason for blocking..."
}
```

When a plan fails review and `blockOnFail` is enabled, Claude is blocked from proceeding until the plan is revised.

### Agent Review Details

The `cc-native-agent-review.py` hook:
1. Spawns headless Claude Code instances with `--agent` flag
2. Each agent runs in parallel via ThreadPoolExecutor
3. Uses `--permission-mode plan` and `--max-turns 1` for constrained review
4. Aggregates results and identifies critical issues
5. Blocks if any agent returns verdict `fail` (when `blockOnFail: true`)

---

## Key Principles

1. **Native tools first** - AskUserQuestion, Task, EnterPlanMode, Write
2. **Minimal implicit behavior** - Only plan review runs automatically
3. **Context efficiency** - Explore subagents discard context, findings persist
4. **User control** - Clarification before action, plan approval before execution
5. **Composable** - Each workflow is independent, no interdependencies
6. **Multi-layer validation** - Plans reviewed by external CLIs + parallel Claude agents
7. **Selective archival** - Only plans passing all reviews get archived

---

## Version History

| Version | Changes |
|---------|---------|
| 1.2.0 | Added multi-agent plan review via Claude Code agents, reordered hooks (archive last) |
| 1.1.0 | Added plan review via Codex/Gemini with Claude feedback, config.json |
| 1.0.0 | Initial release with fix, research, implement workflows |
