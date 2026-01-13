# Claude Code Architecture Research

**Date:** 2026-01-12
**Version:** Based on latest documentation and code analysis

---

## Overview

Claude Code is Anthropic's official CLI tool that enables agentic coding workflows. It uses a skill-based architecture with dynamic discovery, progressive disclosure, and hierarchical configuration management.

---

## 1. File Structure and Locations

### Storage Hierarchy

**Skills:**
- Global: `~/.claude/skills/` (available across all projects)
- Project: `.claude/skills/` (shared with team via git)

**Commands:**
- Personal: `~/.claude/commands/` (available across all projects)
- Project: `.claude/commands/` (shared with team)

**Settings:**
1. User Settings: `~/.claude/settings.json` (applies to all projects)
2. Project Settings: `.claude/settings.json` (shared with team)
3. Local Project Settings: `.claude/settings.local.json` (gitignored)

**Plugins:**
```
plugin-name/
├── .claude-plugin/
│   └── plugin.json       # Required manifest
├── commands/             # Slash commands (.md files)
├── agents/              # Subagent definitions (.md files)
├── skills/              # Agent skills (subdirectories)
├── hooks/               # Event handlers
├── .mcp.json            # MCP server definitions
└── scripts/             # Helper utilities
```

---

## 2. Skill Definition Format

### Directory Structure
```
skill-name/
├── SKILL.md           # Core markdown file with YAML frontmatter
├── scripts/           # Executable Python/Bash automation scripts
├── references/        # Documentation and reference files
└── assets/            # Templates, images, and static resources
```

### SKILL.md Format

**Required Frontmatter:**
```yaml
---
name: skill-name
description: Clear description of what this skill does and when to use it
---
```

**Optional Frontmatter Fields:**
```yaml
version: 1.0.0
license: MIT
allowed-tools: Read,Write,Bash
model: claude-sonnet-4-20250514
disable-model-invocation: false
mode: false
context: fork
agent: custom-agent-name
```

**Example from Upgrades Skill:**
```yaml
---
name: Upgrades
description: Track PAI upgrade opportunities. USE WHEN upgrades, improvement tracking. SkillSearch('upgrades') for docs.
---

# Upgrades

Monitor Anthropic ecosystem AND AI development YouTube channels for updates.

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **Anthropic** | "check Anthropic", "new Claude features" | `Workflows/Anthropic.md` |
| **YouTube** | "check YouTube", "new videos" | `Workflows/YouTube.md` |
```

### Key Features

**Progressive Disclosure:**
- Level 1: Metadata loads first (frontmatter)
- Level 2: Full SKILL.md loads when relevant
- Level 3+: Nested resources load dynamically

**Hot-Reload:**
- Skills automatically reload when created/modified in `~/.claude/skills`
- No session restart required

**Path Portability:**
- Use `{baseDir}` for relative references
- Use `${CLAUDE_PLUGIN_ROOT}` for plugin-internal paths

---

## 3. Command System

### File Structure
- Filename becomes command name: `commit.md` → `/commit`
- Stored in `.claude/commands/` or `~/.claude/commands/`

### Command Format
```yaml
---
description: Create a git commit with conventional message
argument-hint: [message]
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
model: claude-3-5-haiku-20241022
disable-model-invocation: true
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      type: command
      command: "npm run lint"
---

Create a git commit with message: $ARGUMENTS

Use conventional commit format with proper scope and type.
```

### Arguments
- `$ARGUMENTS` - All arguments
- `$1`, `$2`, `$3` - Positional parameters

### Invocation
- Autocomplete anywhere in input (not just beginning)
- `/help` shows all available commands
- Programmatic invocation via Skill tool

---

## 4. Agent Types and Capabilities

### Built-in Agents

**Main Agent:**
- Primary conversation agent
- Full tool access
- Maintains conversation context

**Explore Agent:**
- Fast, read-only codebase analysis
- Optimized for file discovery and code search
- Restricted to read-only operations

**Plan Agent:**
- Research agent for plan mode
- Context gathering and exploration

**General-Purpose Subagent:**
- Delegated task execution
- Separate context window
- Inherits permissions with additional restrictions

### Custom Subagents

**Location:** `.claude-plugin/agents/` or `.claude/agents/`

**Format:**
```yaml
---
name: custom-agent
description: Agent purpose and use case
allowed-tools: Read,Bash
model: claude-sonnet-4-20250514
---

# Custom Agent Instructions

[Agent-specific system prompt and guidelines]
```

**Activation:**
- Via `context: fork` in skill frontmatter
- Via Task tool with `subagent_type` parameter

---

## 5. Hook System

### Available Events

1. **SessionStart** - When Claude Code starts/resumes
2. **UserPromptSubmit** - When user submits prompt
3. **PermissionRequest** - When Claude requests tool permission (v2.0.45+)
4. **PreToolUse** - Before tool execution (can control execution)
5. **PostToolUse** - After successful tool completion
6. **Stop** - When main agent finishes responding
7. **SubagentStop** - When subagent finishes (v1.0.41+)
8. **SessionEnd** - When session terminates
9. **PreCompact** - Before context compaction
10. **Notification** - For notification events

### Configuration Locations
- `hooks/hooks.json` in plugin root
- Inline in `plugin.json`
- In skill/command frontmatter

### hooks.json Format
```json
{
  "PreToolUse": [{
    "matcher": "Write|Edit",
    "once": true,
    "hooks": [{
      "type": "command",
      "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/validate.sh",
      "timeout": 30
    }]
  }],
  "PostToolUse": [{
    "matcher": "Bash",
    "hooks": [{
      "type": "command",
      "command": "echo 'Bash command completed'"
    }]
  }]
}
```

### Hook Features
- `once: true` - Execute only once per session
- `matcher` - Tool name pattern (regex supported)
- `timeout` - Maximum execution time in seconds
- Scoped to agent lifecycle

### Example from Upgrades Skill
```bash
# Voice Notification Hook
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running the WORKFLOWNAME workflow"}' \
  > /dev/null 2>&1 &
```

---

## 6. CLAUDE.md Files

### Purpose
Project-level instructions treated as immutable system rules.

### Locations
- `CLAUDE.md` - Root of repository (shared, version-controlled)
- `CLAUDE.local.md` - Personal preferences (gitignored)
- Subdirectories - For monorepo hierarchical context

### Import Syntax
```markdown
# Project Instructions

See @README for project overview
See @package.json for available npm commands

# Git Workflow
@docs/git-instructions.md

# Code Style
- Use ES modules (import/export)
- Destructure imports when possible
```

---

## 7. Settings Configuration

### settings.json Structure
```json
{
  "model": "claude-sonnet-4-20250514",
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(git status)",
      "Read(**/*.ts)"
    ],
    "deny": [
      "Read(./.env)",
      "Write(./config/production.json)"
    ]
  },
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "NODE_ENV": "development"
  },
  "enabledPlugins": {
    "plugin-name@marketplace": true
  },
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write(.*\\.py)",
      "hooks": [{
        "type": "command",
        "command": "black $FILE"
      }]
    }]
  },
  "spinnerTipsEnabled": false,
  "cleanupPeriodDays": 30
}
```

### Hierarchy
1. User Settings (`~/.claude/settings.json`) - Global
2. Project Settings (`.claude/settings.json`) - Shared
3. Local Project Settings (`.claude/settings.local.json`) - Personal

---

## 8. Plugin System

### plugin.json Manifest
```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "repository": "https://github.com/user/plugin-name",
  "keywords": ["claude", "automation", "testing"]
}
```

### Plugin Structure Conventions
- Use kebab-case for all directory/file names
- Component directories must be at plugin root
- Use `${CLAUDE_PLUGIN_ROOT}` for intra-plugin paths
- Auto-discovery for standard directories

---

## 9. MCP (Model Context Protocol) Integration

**Configuration:** `.mcp.json` in plugin root

**Features:**
- Dynamically discovered MCP servers
- Tool integration
- Resource management

---

## 10. Tool System

### Available Tools
- **Bash** - Command execution with restrictions
- **Read** - File reading with path patterns
- **Write** - File creation/modification
- **Edit** - File editing with string replacement
- **Glob** - File pattern matching
- **Grep** - Content search
- **Task** - Subagent spawning
- **AskUserQuestion** - Interactive user input
- **WebFetch** - Web content retrieval
- **WebSearch** - Web search capabilities

### Permission Patterns
```json
{
  "allow": [
    "Bash(npm run *)",
    "Read(**/*.ts)",
    "Write(src/**/*.js)"
  ]
}
```

---

## 11. Naming Conventions

- **Skills:** kebab-case directories (e.g., `my-skill`)
- **Commands:** kebab-case .md files (e.g., `commit.md`)
- **Agents:** kebab-case .md files (e.g., `custom-agent.md`)
- **Hooks:** camelCase event names (e.g., `PostToolUse`)
- **Settings:** camelCase keys (e.g., `spinnerTipsEnabled`)

---

## 12. Integration Patterns

### Skill Workflows
Skills can define workflow routing tables to map user intents to specific workflow files:

```markdown
| Workflow | Trigger | File |
|----------|---------|------|
| **Anthropic** | "check Anthropic" | `Workflows/Anthropic.md` |
| **YouTube** | "check YouTube" | `Workflows/YouTube.md` |
| **All** | "check for updates" | Run both workflows |
```

### Tool Invocation from Skills
```markdown
## Tool Reference

| Tool | Purpose |
|------|---------|
| `tools/Anthropic.ts` | Check Anthropic sources |
```

### Configuration Loading
```bash
bun ~/.claude/skills/CORE/Tools/LoadSkillConfig.ts
```

---

## Analyzed Example: Upgrades Skill

**Location:** `~/.pai/skills/Upgrades/SKILL.md`

**Key Features Demonstrated:**
1. Workflow routing with trigger patterns
2. Voice notification integration via hooks
3. Tool references for external scripts
4. Configuration management with customizations
5. State tracking with JSON files
6. Integration with other skills (VideoTranscript)

**File Structure:**
```
Upgrades/
├── SKILL.md
├── Workflows/
│   ├── Anthropic.md
│   ├── YouTube.md
│   └── ReleaseNotesDeepDive.md
├── tools/
│   └── Anthropic.ts
├── sources.json
├── youtube-channels.json
└── state/
    ├── last-check.json
    └── youtube-videos.json
```

---

## Sources

- [Claude Code Documentation](https://code.claude.com/docs/)
- [GitHub - anthropics/claude-code](https://github.com/anthropics/claude-code)
- [GitHub - anthropics/skills](https://github.com/anthropics/skills)
- [Claude Code: Best practices for agentic coding](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Inside Claude Code Skills - Mikhail Shilkov](https://mikhail.io/2025/10/claude-code-skills/)
- Real-world analysis of Upgrades skill from PAI infrastructure
