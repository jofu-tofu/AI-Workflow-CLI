# AI Assistant Terminology Translation Table

**Date:** 2026-01-12
**Purpose:** Cross-platform terminology mapping between Claude Code, Windsurf IDE, and GitHub Copilot

---

## Core Concepts

| Claude Code | Windsurf | GitHub Copilot | Equivalent? | Notes |
|-------------|----------|----------------|-------------|-------|
| **Skill** | **Workflow** | **Prompt File** | ≈ Similar | All are automation sequences in .md files |
| **Command** | **Workflow** | **Slash Command** | ≈ Similar | /command invocation pattern |
| **CLAUDE.md** | **Rule (Always On)** | **copilot-instructions.md** | ✅ Equivalent | Static project instructions |
| **Agent** | **Cascade** | **Copilot** | ✅ Equivalent | The AI assistant itself |
| **Subagent** | *(None)* | **Custom Agent** | ⚠️ Partial | Windsurf cannot spawn, Copilot can |
| **Hook** | **Trigger** | *(None)* | ⚠️ Partial | Claude has most comprehensive |
| **Permission** | *(Limited)* | **MCP Permissions** | ⚠️ Varies | Claude most granular, Copilot MCP-based |
| **Plugin** | *(Unknown)* | **IDE Extension** | ⚠️ Different | Different extension models |
| **Tool** | **Command** | **Tool** | ✅ Equivalent | Executable actions |
| **Session** | **Conversation** | **Session** | ✅ Equivalent | Interaction context |
| **Settings** | **Configuration** | **Workspace Settings** | ✅ Equivalent | System preferences |
| **Progressive Disclosure** | *(None)* | *(None)* | ❌ No equivalent | Claude-specific feature |
| **Context Fork** | *(None)* | *(None)* | ❌ No equivalent | Claude-specific subagent isolation |
| *(None)* | **Memory** | *(None)* | ❌ No equivalent | Windsurf pattern learning |
| *(None)* | **Glob Trigger** | **applyTo** | ⚠️ Similar | File-pattern activation |
| *(None)* | **Model Decision** | *(None)* | ❌ No equivalent | AI-driven rule activation (Windsurf only) |
| *(None)* | *(None)* | **Agent Mode** | ❌ No equivalent | Multi-step autonomous execution |
| *(None)* | *(None)* | **Working Set** | ❌ No equivalent | Collection of files being edited (Copilot) |
| *(None)* | **Flow Mode** | *(None)* | ❌ No equivalent | Real-time collaboration (Windsurf only) |
| *(None)* | *(None)* | **excludeAgent** | ❌ No equivalent | Exclude from specific agents (Copilot only) |

---

## File Organization

| Claude Code | Windsurf | GitHub Copilot | Purpose |
|-------------|----------|----------------|---------|
| `~/.claude/` | `~/.codeium/windsurf/` | *(IDE settings)* | User-level directory |
| `~/.claude/skills/` | *(N/A)* | *(N/A)* | Global skills storage |
| `~/.claude/commands/` | *(N/A)* | *(N/A)* | Global commands storage |
| `.claude/` | `.windsurf/` | `.github/` | Project-level directory |
| `.claude/skills/` | `.windsurf/workflows/` | `.github/prompts/` | Project automation |
| `.claude/commands/` | `.windsurf/workflows/` | *(via prompts)* | Slash commands |
| `CLAUDE.md` | *(Use Always On rule)* | `.github/copilot-instructions.md` | Project instructions |
| `CLAUDE.local.md` | `global_rules.md` | *(Workspace settings)* | Personal preferences |
| `.claude/settings.json` | *(Limited config)* | *(IDE config)* | Project settings |
| `.claude/settings.local.json` | *(Limited config)* | *(Workspace settings)* | Local overrides |
| `.claude-plugin/` | *(Unknown)* | *(N/A)* | Plugin root |
| `.claude/agents/` | *(N/A)* | *(N/A - defined in prompts)* | Custom subagents |
| `.mcp.json` | *(MCP support)* | *(MCP via IDE)* | MCP server config |
| *(N/A)* | *(N/A)* | `.github/instructions/*.instructions.md` | Path-specific instructions |
| *(N/A)* | *(N/A)* | `.github/chatmodes/` | Custom chat modes |

---

## Skill/Workflow Structure

| Claude Code | Windsurf | Description |
|-------------|----------|-------------|
| `SKILL.md` | `workflow-name.md` | Main definition file |
| `---` (YAML frontmatter) | `---` (YAML frontmatter) | Metadata section |
| `name:` | *(Filename)* | Identifier (filename in Windsurf) |
| `description:` | `description:` | Purpose description |
| `allowed-tools:` | *(Limited)* | Tool permissions |
| `model:` | *(Model selection)* | Model override |
| `context: fork` | *(N/A)* | Subagent execution |
| `agent:` | *(N/A)* | Custom agent type |
| `version:` | `modified:` | Version tracking |
| `license:` | *(N/A)* | Licensing info |
| *(N/A)* | `trigger:` | Activation mode |
| *(N/A)* | `globs:` | File patterns |
| *(N/A)* | `labels:` | Categorization tags |
| *(N/A)* | `author:` | Creator attribution |
| *(N/A)* | `alwaysApply:` | Universal application |

---

## Invocation Patterns

| Claude Code | Windsurf | Example |
|-------------|----------|---------|
| `/command-name` | `/workflow-name` | `/commit` vs `/deploy` |
| `@file-path` | `@file-path` | Both use @ for file references |
| *(Auto-invoke via description)* | `@rules:rulename` | Manual rule activation |
| *(Hook-based)* | *(Trigger-based)* | Event activation |
| `$ARGUMENTS` | *(Unknown)* | Command arguments |
| `$1`, `$2`, `$3` | *(Unknown)* | Positional parameters |
| `{baseDir}` | *(Unknown)* | Path variables |
| `${CLAUDE_PLUGIN_ROOT}` | *(Unknown)* | Plugin paths |

---

## Activation Modes

| Claude Code | Windsurf | Description |
|-------------|----------|-------------|
| **Manual** (via /command) | **Manual** (via @rules:) | User explicitly invokes |
| **Auto-invoke** (description matching) | **Model Decision** | AI decides when to activate |
| **Hook-based** (event triggers) | **Trigger** (event-based) | Lifecycle events |
| *(N/A)* | **Always On** | Continuously applied |
| *(Permission patterns)* | **Glob** | File-pattern based |

---

## Hook/Trigger Events

| Claude Code Hook | Windsurf Trigger | Description |
|------------------|------------------|-------------|
| `SessionStart` | *(Yes)* | Session initialization |
| `UserPromptSubmit` | *(Unknown)* | User submits input |
| `PermissionRequest` | *(N/A)* | Tool permission needed |
| `PreToolUse` | *(Limited)* | Before tool execution |
| `PostToolUse` | *(Limited)* | After tool completion |
| `Stop` | *(Unknown)* | Agent finishes response |
| `SubagentStop` | *(N/A)* | Subagent completes |
| `SessionEnd` | *(Yes)* | Session termination |
| `PreCompact` | *(Unknown)* | Before context compression |
| `Notification` | *(Unknown)* | Notification events |
| *(N/A)* | `push` | Git push event |
| *(N/A)* | `pull_request` | PR event |

---

## Agent Types

| Claude Code | Windsurf | Capabilities |
|-------------|----------|--------------|
| **Main Agent** | **Cascade** | Primary AI assistant |
| **Explore Agent** | *(N/A)* | Read-only codebase exploration |
| **Plan Agent** | *(N/A)* | Research and planning mode |
| **General-Purpose Subagent** | *(N/A)* | Delegated task execution |
| **Custom Subagent** (.md) | *(N/A)* | User-defined agents |
| *(N/A)* | **Cascade Conversation** | Parallel AI sessions |

---

## Tool Names

| Claude Code | Windsurf | Purpose |
|-------------|----------|---------|
| `Bash` | *(Command execution)* | Shell commands |
| `Read` | *(File read)* | Read file contents |
| `Write` | *(File write)* | Create/overwrite files |
| `Edit` | *(File edit)* | Modify existing files |
| `Glob` | *(Pattern match)* | File pattern matching |
| `Grep` | *(Content search)* | Search file contents |
| `Task` | *(N/A)* | Spawn subagent |
| `AskUserQuestion` | *(Interactive)* | Get user input |
| `WebFetch` | *(Web access)* | Fetch web content |
| `WebSearch` | *(Web search)* | Search the web |
| `NotebookEdit` | *(Unknown)* | Jupyter notebook editing |

---

## Permission Patterns

| Claude Code | Windsurf | Example |
|-------------|----------|---------|
| `Read(**/*.ts)` | `globs: ["*.ts"]` | TypeScript files |
| `Bash(git add:*)` | *(Limited)* | Git add commands |
| `Write(src/**/*.js)` | *(Limited)* | JavaScript in src/ |
| `deny: [Read(.env)]` | *(Limited)* | Block .env access |
| `allow: [...]` | *(Limited)* | Whitelist permissions |

---

## Configuration Keys

| Claude Code | Windsurf | Description |
|-------------|----------|-------------|
| `model` | *(Model selection)* | AI model choice |
| `permissions` | *(Limited)* | Tool access control |
| `env` | *(Yes)* | Environment variables |
| `enabledPlugins` | *(Unknown)* | Plugin management |
| `hooks` | `triggers` | Event handlers |
| `spinnerTipsEnabled` | *(N/A)* | UI preferences |
| `cleanupPeriodDays` | *(Unknown)* | Cleanup settings |

---

## Size Limits

| Aspect | Claude Code | Windsurf |
|--------|-------------|----------|
| **Skill/Workflow file** | ♾️ Unlimited | ⚠️ 12,000 characters |
| **Rule file** | ♾️ Unlimited | ⚠️ 12,000 characters |
| **File handling** | ✅ Large files OK | ⚠️ Struggles >300-500 lines |
| **Codebase size** | ✅ Large codebases OK | ⚠️ Optimal: 10K-100K lines |

---

## Unique Features (No Direct Equivalent)

### Claude Code Only
- **Subagent spawning** - Parallel isolated agents
- **Progressive disclosure** - Layered context loading
- **Context forking** - Separate execution contexts
- **Granular permissions** - Fine-grained tool control
- **Custom agent types** - User-defined agent specializations
- **Plugin marketplace** - Ecosystem of extensions
- **SubagentStop hook** - Subagent lifecycle event
- **PermissionRequest hook** - Permission control
- **Task tool** - Spawn parallel work

### Windsurf Only
- **Cascade Memories** - Learn patterns across sessions
- **Model Decision trigger** - AI chooses when to activate
- **Glob trigger** - File-pattern-based activation
- **Always On rules** - Continuous application
- **Multiple Cascade conversations** - Parallel AI sessions
- **Simpler autonomous UI** - Less manual control

---

## Translation Examples

### Example 1: Project Instructions

**Claude Code:**
```markdown
# CLAUDE.md
- Use ES modules
- Run tests before committing
- Follow conventional commits
```

**Windsurf Equivalent:**
```yaml
---
trigger: always_on
description: Project coding standards
---

# Project Standards
- Use ES modules
- Run tests before committing
- Follow conventional commits
```

---

### Example 2: Automation Workflow

**Claude Code Skill:**
```yaml
---
name: deploy
description: Deploy application to production
allowed-tools: Bash
---

# Deploy

Run deployment workflow:
1. Run tests
2. Build production
3. Deploy to server
```

**Windsurf Workflow:**
```yaml
---
description: Deploy application to production
labels: deployment, production
---

# Deploy

Run deployment workflow:
1. Run tests
2. Build production
3. Deploy to server
```

---

### Example 3: File-Specific Rules

**Claude Code (Permission):**
```json
{
  "permissions": {
    "allow": ["Read(**/*.py)"],
    "deny": ["Write(**/*.py)"]
  }
}
```

**Windsurf (Glob Trigger):**
```yaml
---
trigger: glob
globs: ["*.py", "**/*.py"]
description: Python file standards
---

# Python Standards
- Read-only access to Python files
- Use Black for formatting
- PEP 8 compliance required
```

---

## Conversion Guidelines

### From Claude Code to Windsurf

1. **Skills → Workflows**
   - Keep same .md format
   - Filename becomes workflow name
   - Remove `name:` from frontmatter (use filename)
   - Add `trigger:` and `labels:` as needed
   - Limit to 12,000 characters

2. **CLAUDE.md → Always On Rule**
   - Create `.windsurf/rules/project-standards.md`
   - Add `trigger: always_on` in frontmatter
   - Keep instructions the same

3. **Subagent Calls → Inline Instructions**
   - No subagents in Windsurf
   - Expand subagent logic inline
   - Use sequential instructions instead

4. **Hooks → Triggers**
   - Map lifecycle events where possible
   - Use `trigger:` field for activation
   - Limited event coverage in Windsurf

5. **Permissions → Glob Triggers**
   - Use `globs:` for file-pattern restrictions
   - Cannot enforce permissions, only context
   - Rely on AI to respect rules

### From Windsurf to Claude Code

1. **Workflows → Skills**
   - Create `skill-name/SKILL.md`
   - Add `name:` from filename
   - Remove Windsurf-specific fields (`trigger`, `globs`, `labels`)
   - Can exceed 12,000 characters

2. **Always On Rules → CLAUDE.md**
   - Extract `always_on` rules
   - Combine into single CLAUDE.md
   - Remove frontmatter (optional in CLAUDE.md)

3. **Glob Triggers → Permissions**
   - Map `globs:` to permission patterns
   - Use `allow:` and `deny:` for enforcement
   - Add to `.claude/settings.json`

4. **Model Decision → Description Matching**
   - Use clear `description:` field
   - Rely on auto-invoke matching
   - May need user to explicitly call /command

5. **Memories → Documentation**
   - No automatic memory in Claude Code
   - Document learned patterns manually
   - Add to CLAUDE.md or skill documentation

---

### From GitHub Copilot to Claude Code

1. **Prompt Files → Skills**
   - Create `skill-name/SKILL.md`
   - Convert `.github/prompts/*.prompt.md` to skill structure
   - Add `name:` field from filename
   - No character limits

2. **copilot-instructions.md → CLAUDE.md**
   - Copy instructions directly
   - Works in both platforms
   - Remove GitHub Copilot-specific frontmatter if present

3. **Path-Specific Instructions → Permissions + Skills**
   - Map `applyTo:` globs to permission patterns
   - Create separate skills for language-specific rules
   - Use skill descriptions for auto-invocation

4. **Agent Mode → Subagents**
   - Define custom subagents for specialized tasks
   - Use `context: fork` for isolation
   - More control over agent behavior

5. **MCP Servers → MCP Servers**
   - Compatible protocol
   - May need different configuration format
   - Test compatibility

### From GitHub Copilot to Windsurf

1. **Prompt Files → Workflows**
   - Convert `.github/prompts/*.prompt.md` to `.windsurf/workflows/`
   - Filename becomes workflow name
   - Add `trigger: manual` for slash command access
   - Limit to 12,000 characters

2. **copilot-instructions.md → Always On Rule**
   - Create `.windsurf/rules/copilot-instructions.md`
   - Add `trigger: always_on` frontmatter
   - Instructions remain the same

3. **Path-Specific Instructions → Glob Rules**
   - Map `applyTo:` directly to `globs:` in Windsurf
   - Use `trigger: glob` for file-pattern activation
   - Very similar semantics

4. **Agent Mode → Cascade Agent**
   - Windsurf Cascade handles similar autonomous tasks
   - No custom agents (use single Cascade)
   - Flow mode for collaborative work

---

## Quick Reference: Terminology Cheat Sheet

| Concept | Claude Code | Windsurf | GitHub Copilot |
|---------|-------------|----------|----------------|
| **Project Instructions** | CLAUDE.md | Always-On Rule | copilot-instructions.md |
| **Automation** | Skill | Workflow | Prompt File |
| **Invocation** | /command | /workflow | #prompt: or /slash |
| **File Patterns** | Permissions | Glob Trigger | applyTo |
| **AI Assistant** | Claude | Cascade | Copilot |
| **Subagents** | Custom .md | *(N/A)* | Custom Agent |
| **Context** | Session | Conversation | Session |
| **Lifecycle** | Hooks (10+) | Triggers (Limited) | *(None)* |
| **Memory** | *(None)* | Memories | *(None)* |
| **File Limit** | ♾️ None | ♾️ None* | ⚠️ 10 files |
| **Working Set** | Unlimited | Unlimited | 10 files max |

*Windsurf has performance issues >300-500 lines but no hard limit

---

## Sources

- RESEARCH-claude-code.md
- RESEARCH-windsurf.md
- RESEARCH-github-copilot.md
- CAPABILITY-MATRIX.md
- Official documentation from all three platforms
