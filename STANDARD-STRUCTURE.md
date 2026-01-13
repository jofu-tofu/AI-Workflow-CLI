# Standard Directory Structure and Platform Mappings

**Date:** 2026-01-12
**Purpose:** Define the canonical directory structure for cross-platform AI assistant templates with mappings to Claude Code, Windsurf, and GitHub Copilot native formats.

---

## Executive Summary

This document defines the **standard directory layout** for portable AI assistant templates that work across Claude Code, Windsurf IDE, and GitHub Copilot. The structure follows the **Superset + Platform Adapter** approach: capturing ALL features from ALL platforms in a unified format, with platform adapters handling translation to each platform's native structure.

---

## Standard Directory Layout

```
.ai-templates/                    # Standard root (platform-agnostic)
|
+-- skills/                       # Automation templates (workflows/prompts)
|   +-- skill-name/               # Each skill in its own directory
|   |   +-- SKILL.md              # Main template file (required)
|   |   +-- assets/               # Supporting files (optional)
|   |   |   +-- scripts/          # Helper scripts
|   |   |   +-- templates/        # Code templates
|   |   |   +-- examples/         # Example files
|   |   +-- CHUNKS/               # Chunked content for large templates
|   |       +-- chunk-1.md        # First chunk (if template exceeds limits)
|   |       +-- chunk-2.md        # Additional chunks as needed
|   |
|   +-- another-skill/
|       +-- SKILL.md
|
|   # Note: Skills can represent both Claude Code skills and Windsurf workflows.
|   # See WORKAROUND-PATTERNS.md Pattern 2 for workflow emulation patterns.
|
+-- instructions/                 # Project-level instructions
|   +-- PROJECT.md                # Main instructions (always loaded)
|   +-- LOCAL.md                  # Local overrides (gitignored)
|   +-- paths/                    # Path-specific instructions
|       +-- src-typescript.md     # Rules for src/**/*.ts
|       +-- src-api.md            # Rules for src/api/**/*
|       +-- tests.md              # Rules for tests/**/*
|
+-- agents/                       # Custom agent definitions
|   +-- explorer.md               # Read-only explorer agent
|   +-- implementer.md            # Code implementation agent
|   +-- reviewer.md               # Code review agent
|
+-- config/                       # Platform adapter configurations
|   +-- claude-code.json          # Claude Code specific settings
|   +-- windsurf.json             # Windsurf specific settings
|   +-- github-copilot.json       # GitHub Copilot specific settings
|   +-- platform-features.json    # Feature compatibility matrix
|
+-- hooks/                        # Lifecycle event handlers
|   +-- pre-commit.md             # Before git commit
|   +-- session-start.md          # On session start
|   +-- post-tool-use.md          # After tool execution
|
+-- state/                        # Runtime state (gitignored)
    +-- session-context.json      # Current session state
    +-- learned-patterns.json     # Emulated memory/patterns
```

---

## Platform Mapping Table

### Primary Locations

| Standard Location | Claude Code | Windsurf | GitHub Copilot |
|-------------------|-------------|----------|----------------|
| `.ai-templates/` | `.claude/` | `.windsurf/` | `.github/` |
| `.ai-templates/skills/` | `.claude/skills/` | `.windsurf/workflows/` | `.github/prompts/` |
| `.ai-templates/skills/name/SKILL.md` | `.claude/skills/name/SKILL.md` | `.windsurf/workflows/name.md` | `.github/prompts/name.prompt.md` or `.github/skills/name/SKILL.md` |
| *Workflow emulation* | See [Pattern 2](WORKAROUND-PATTERNS.md#pattern-2-workflow-emulation-for-claude-code) | N/A (native workflows) | N/A |
| `.ai-templates/commands/` | `.claude/commands/` | N/A (use workflows) | N/A (not supported) |
| `.ai-templates/instructions/PROJECT.md` | `CLAUDE.md` (root) | `.windsurf/rules/*.md` (always_on) | `.github/copilot-instructions.md` |
| `.ai-templates/instructions/MODEL.md` | N/A (not supported) | N/A (not supported) | `CLAUDE.md`, `GEMINI.md`, `AGENTS.md` (model-specific) |
| `.ai-templates/instructions/LOCAL.md` | `CLAUDE.local.md` (root) | `~/.codeium/windsurf/memories/global_rules.md` | Workspace settings |
| `.ai-templates/instructions/paths/` | N/A (use permissions) | `.windsurf/rules/` (glob trigger) | `.github/instructions/` |
| `.ai-templates/agents/` | `.claude/agents/` | N/A (not supported) | Inline in prompts |
| `.ai-templates/config/` | `.claude/settings.json` | N/A (limited config) | IDE/Workspace settings |
| `.ai-templates/hooks/` | `.claude/settings.json` (hooks: {}) | **No equivalent** (triggers are different concept) | N/A (not supported) |
| `.ai-templates/state/` | `.claude/state/` (gitignored) | N/A (uses Memories) | N/A (not supported) |

### Path-Specific Instructions

| Standard Pattern | Claude Code | Windsurf | GitHub Copilot |
|------------------|-------------|----------|----------------|
| `paths/src-typescript.md` | Permissions: `Read(src/**/*.ts)` | Glob rule: `globs: ["src/**/*.ts"]` | `applyTo: "src/**/*.ts"` |
| `paths/src-api.md` | Permissions: `Read(src/api/**)` | Glob rule: `globs: ["src/api/**"]` | `applyTo: "src/api/**"` |
| `paths/tests.md` | Permissions: `Read(tests/**)` | Glob rule: `globs: ["tests/**"]` | `applyTo: "tests/**"` |

### Agent Definitions

| Standard Location | Claude Code | Windsurf | GitHub Copilot |
|-------------------|-------------|----------|----------------|
| `agents/explorer.md` | `.claude/agents/explorer.md` | Emulate via persona rule | Inline in prompt files |
| `agents/implementer.md` | `.claude/agents/implementer.md` | Emulate via persona rule | Inline in prompt files |
| `agents/reviewer.md` | `.claude/agents/reviewer.md` | Emulate via persona rule | Inline in prompt files |

### User-Level / Global Directories

These directories exist at the user level (not project level) and apply across all projects:

| Purpose | Claude Code | Windsurf | GitHub Copilot |
|---------|-------------|----------|----------------|
| **Global skills/workflows** | `~/.claude/skills/` | N/A (not supported) | `~/.copilot/skills/` |
| **Global commands** | `~/.claude/commands/` | N/A (use workflows) | N/A (not supported) |
| **Global instructions** | N/A (use project `CLAUDE.md`) | `~/.codeium/windsurf/memories/global_rules.md` | N/A (use workspace settings) |
| **Memories/Learning** | N/A (manual state management) | `~/.codeium/windsurf/memories/` | N/A (not supported) |
| **AI-generated memories** | N/A (manual state management) | `~/.codeium/windsurf/cascade/` | N/A (not supported) |
| **User settings** | `~/.claude/settings.json` | `~/.codeium/windsurf/config/` | IDE settings.json |
| **MCP configuration** | `.mcp.json` (plugin root) | Limited MCP support | MCP server configs (IDE settings) |

**Notes:**
- **Claude Code global skills** at `~/.claude/skills/` are available across all projects without needing to be in project `.claude/` directory
- **Windsurf Memories system** at `~/.codeium/windsurf/memories/` learns from interactions and applies patterns automatically
- **Windsurf global_rules.md** applies to all projects for this user, equivalent to LOCAL.md in standard format

---

## Naming Conventions

### Directory and File Names

1. **Use kebab-case** for all file and directory names
   - Good: `code-review`, `pre-commit`, `src-typescript.md`
   - Bad: `codeReview`, `preCommit`, `srcTypescript.md`

2. **Main file naming:**
   - Skills: Always `SKILL.md` (uppercase)
   - Instructions: Always `PROJECT.md` and `LOCAL.md` (uppercase)
   - Path rules: `{path-pattern}.md` (lowercase kebab-case)
   - Agents: `{agent-name}.md` (lowercase kebab-case)

3. **Reserved names:**
   - `SKILL.md` - Main skill definition
   - `PROJECT.md` - Main project instructions
   - `LOCAL.md` - Local overrides (gitignored)
   - `CHUNKS/` - Directory for chunked content

### Skill Directory Structure

```
skills/
+-- commit/                       # Skill name as directory
|   +-- SKILL.md                  # Required: main definition
|   +-- assets/                   # Optional: supporting files
|
+-- deploy-production/            # Kebab-case for multi-word names
    +-- SKILL.md
```

### Path-Specific Instruction Naming

Pattern: Replace path separators and wildcards with descriptive names.

| File Path Pattern | Instruction File Name |
|-------------------|----------------------|
| `src/**/*.ts` | `src-typescript.md` |
| `src/api/**/*` | `src-api.md` |
| `src/components/**/*.tsx` | `src-components-tsx.md` |
| `tests/**/*` | `tests.md` |
| `docs/**/*.md` | `docs-markdown.md` |
| `*.config.js` | `config-js.md` |

---

## Size Limits and Constraints

### Platform-Specific Limits

| Constraint | Claude Code | Windsurf | GitHub Copilot |
|------------|-------------|----------|----------------|
| **Skill/Workflow file size** | Unlimited | **12,000 characters** | Unlimited |
| **Rule/Instruction file size** | Unlimited | **12,000 characters** | Unlimited |
| **Single file line limit** | Unlimited | ~300-500 lines (performance) | ~6,000 lines (quality degrades) |
| **Context window** | Large | Large | **6,000 chars/batch; 60 lines/file; 20 files max** |
| **Max files in context** | Unlimited | Unlimited | **20 files** |
| **Working set** | Unlimited | Unlimited | **10 files** (Edits mode) |

### Chunking Strategy for Large Templates

When a template exceeds platform limits, use the chunking system:

```
skills/large-skill/
+-- SKILL.md                      # Main entry point (under limit)
+-- CHUNKS/                       # Overflow content
    +-- chunk-1-setup.md          # Setup instructions
    +-- chunk-2-implementation.md # Implementation details
    +-- chunk-3-testing.md        # Testing procedures
```

**SKILL.md Header for Chunked Skills:**

```yaml
---
name: large-skill
description: Complex skill requiring multiple chunks
chunks:
  - CHUNKS/chunk-1-setup.md
  - CHUNKS/chunk-2-implementation.md
  - CHUNKS/chunk-3-testing.md
---

# Large Skill

This skill is chunked for platform compatibility.

## Quick Start
[Brief overview under 6,000 characters for Copilot compatibility]

## Detailed Instructions
For complete instructions, load chunks as needed:
- Setup: See `CHUNKS/chunk-1-setup.md`
- Implementation: See `CHUNKS/chunk-2-implementation.md`
- Testing: See `CHUNKS/chunk-3-testing.md`
```

### Size Recommendations

| Content Type | Recommended Size | Reason |
|--------------|------------------|--------|
| Main SKILL.md | < 6,000 chars | GitHub Copilot context limit |
| Windsurf workflows | < 12,000 chars | Hard platform limit |
| Path-specific rules | < 3,000 chars | Keep focused and fast |
| Agent definitions | < 4,000 chars | Reasonable persona scope |
| Quick start section | < 2,000 chars | Initial context load |

---

## Complete Mapping Examples

### Example 1: Standard Skill to All Platforms

**Standard Location:** `.ai-templates/skills/commit/SKILL.md`

```yaml
---
name: commit
description: Create conventional git commits with proper formatting
allowed-tools: [Bash]
platforms: [claude-code, windsurf, github-copilot]
---

# Commit Skill

Create a properly formatted conventional commit.

## Steps
1. Check git status
2. Stage changes
3. Create commit with conventional format
```

**Claude Code:** `.claude/skills/commit/SKILL.md`
```yaml
---
name: commit
description: Create conventional git commits with proper formatting
allowed-tools: [Bash]
---

# Commit Skill
[Same content]
```

**Windsurf:** `.windsurf/workflows/commit.md`
```yaml
---
description: Create conventional git commits with proper formatting
trigger: manual
labels: [git, automation]
---

# Commit Workflow
[Same content, invoke with /commit]
```

**GitHub Copilot:** `.github/prompts/commit.prompt.md`
```yaml
---
description: Create conventional git commits with proper formatting
mode: agent
---

# Commit Prompt
[Same content, invoke with /commit or #prompt:commit]
```

---

### Example 2: Project Instructions to All Platforms

**Standard Location:** `.ai-templates/instructions/PROJECT.md`

```markdown
# Project Instructions

## Code Style
- Use TypeScript strict mode
- Prefer functional programming patterns
- Use Tailwind CSS for styling

## Testing
- Jest for unit tests
- 80% coverage minimum

## Git Workflow
- Conventional commits required
- Feature branches only
```

**Claude Code:** `CLAUDE.md` (project root)
```markdown
[Same content - no changes needed]
```

**Windsurf:** `.windsurf/rules/project-instructions.md`
```yaml
---
trigger: always_on
description: Project coding standards
---

[Same content with frontmatter]
```

**GitHub Copilot:** `.github/copilot-instructions.md`
```markdown
[Same content - no changes needed]
```

---

### Example 3: Path-Specific Rules to All Platforms

**Standard Location:** `.ai-templates/instructions/paths/src-api.md`

```yaml
---
path-pattern: src/api/**/*
description: API route development standards
---

# API Development Standards

- Use Express.js patterns
- Validate all inputs with Zod
- Return consistent error formats
- Include OpenAPI documentation
```

**Claude Code:** Added to `.claude/settings.json`
```json
{
  "permissions": {
    "allow": ["Read(src/api/**/*)", "Write(src/api/**/*.ts)"]
  }
}
```
Plus skill with description matching for auto-invoke.

**Windsurf:** `.windsurf/rules/src-api.md`
```yaml
---
trigger: glob
globs: ["src/api/**/*"]
description: API route development standards
---

[Same content]
```

**GitHub Copilot:** `.github/instructions/src-api.instructions.md`
```yaml
---
applyTo: "src/api/**/*"
---

[Same content]
```

---

### Example 4: Agent Definition to All Platforms

**Standard Location:** `.ai-templates/agents/explorer.md`

```yaml
---
name: explorer
description: Read-only codebase exploration agent
allowed-tools: [Read, Glob, Grep]
forbidden-tools: [Write, Edit, Bash]
---

# Explorer Agent

You are a read-only exploration agent. Your role is to:
- Search and analyze the codebase
- Document findings in FINDINGS.md
- Never modify files

## Allowed Actions
- Read any file
- Search with glob and grep
- Create documentation files

## Forbidden Actions
- Do not write or edit code files
- Do not execute commands
- Do not suggest changes (only document)
```

**Claude Code:** `.claude/agents/explorer.md`
```yaml
---
name: explorer
description: Read-only codebase exploration agent
allowed-tools: [Read, Glob, Grep]
---

[Same content]
```

**Windsurf:** `.windsurf/rules/agent-explorer.md` (emulated via persona rule)
```yaml
---
trigger: manual
description: Read-only explorer agent persona - activate with @rules:agent-explorer
---

# Explorer Agent Persona

When @rules:agent-explorer is active, adopt this persona:

[Same behavioral content]

Note: Tool restrictions cannot be enforced, rely on AI compliance.
```

**GitHub Copilot:** Inline in prompt files
```yaml
# .github/prompts/explore-codebase.prompt.md
---
description: Explore codebase in read-only mode
mode: agent
tools:
  - filesystem (read-only)
---

You are acting as an explorer agent.

[Same behavioral content inline]
```

---

## Reverse Mapping: Platform-Native to Standard

### From Claude Code to Standard

| Claude Code Location | Standard Location |
|---------------------|-------------------|
| `.claude/` | `.ai-templates/` |
| `.claude/skills/name/SKILL.md` | `.ai-templates/skills/name/SKILL.md` |
| `CLAUDE.md` | `.ai-templates/instructions/PROJECT.md` |
| `CLAUDE.local.md` | `.ai-templates/instructions/LOCAL.md` |
| `.claude/agents/name.md` | `.ai-templates/agents/name.md` |
| `.claude/settings.json` | `.ai-templates/config/claude-code.json` |
| `.claude/commands/` | `.ai-templates/skills/` (convert to skills) |

### From Windsurf to Standard

| Windsurf Location | Standard Location |
|-------------------|-------------------|
| `.windsurf/` | `.ai-templates/` |
| `.windsurf/workflows/name.md` | `.ai-templates/skills/name/SKILL.md` |
| `.windsurf/rules/*.md` (always_on) | `.ai-templates/instructions/PROJECT.md` |
| `.windsurf/rules/*.md` (glob) | `.ai-templates/instructions/paths/*.md` |
| `.windsurf/rules/*.md` (manual persona) | `.ai-templates/agents/*.md` |
| `global_rules.md` | `.ai-templates/instructions/LOCAL.md` |

### From GitHub Copilot to Standard

| GitHub Copilot Location | Standard Location |
|------------------------|-------------------|
| `.github/` | `.ai-templates/` |
| `.github/prompts/name.prompt.md` | `.ai-templates/skills/name/SKILL.md` |
| `.github/copilot-instructions.md` | `.ai-templates/instructions/PROJECT.md` |
| `.github/instructions/*.instructions.md` | `.ai-templates/instructions/paths/*.md` |
| `.github/chatmodes/*.chatmode.md` | `.ai-templates/agents/*.md` (convert) |
| Workspace settings | `.ai-templates/config/github-copilot.json` |

---

## Config File Schemas

### claude-code.json

```json
{
  "$schema": "https://aiwcli.dev/schemas/claude-code.json",
  "version": "1.0.0",
  "permissions": {
    "allow": [
      "Read(**/*.ts)",
      "Write(src/**/*.ts)",
      "Bash(npm test)",
      "Bash(npm run lint)"
    ],
    "deny": [
      "Read(.env)",
      "Write(package.json)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git push*)",
        "action": "require-confirmation"
      }
    ]
  },
  "model": "claude-sonnet-4-20250514"
}
```

### windsurf.json

```json
{
  "$schema": "https://aiwcli.dev/schemas/windsurf.json",
  "version": "1.0.0",
  "notes": {
    "max-file-size": "12000 characters",
    "chunking-required": true
  },
  "rule-mapping": {
    "always-on-rules": ["project-instructions"],
    "glob-rules": ["src-api", "src-components"],
    "manual-rules": ["agent-explorer", "agent-implementer"]
  }
}
```

### github-copilot.json

```json
{
  "$schema": "https://aiwcli.dev/schemas/github-copilot.json",
  "version": "1.0.0",
  "constraints": {
    "max-context-chars": 6000,
    "max-files-in-context": 20,
    "max-working-set": 10
  },
  "prompt-mapping": {
    "skills-as-prompts": true,
    "agents-inline": true
  },
  "mcp-servers": {
    "github": {
      "enabled": true,
      "auth": "oauth"
    }
  }
}
```

### platform-features.json

```json
{
  "$schema": "https://aiwcli.dev/schemas/platform-features.json",
  "version": "1.0.0",
  "features": {
    "subagent-spawning": {
      "claude-code": true,
      "windsurf": false,
      "github-copilot": true
    },
    "lifecycle-hooks": {
      "claude-code": ["SessionStart", "PreToolUse", "PostToolUse", "Stop", "SubagentStop"],
      "windsurf": [],
      "github-copilot": [],
      "note": "Windsurf uses trigger-based rules (always_on, model_decision, glob) instead of lifecycle hooks"
    },
    "file-pattern-rules": {
      "claude-code": "permissions",
      "windsurf": "glob-trigger",
      "github-copilot": "applyTo"
    },
    "ai-driven-activation": {
      "claude-code": false,
      "windsurf": true,
      "github-copilot": false
    },
    "custom-agents": {
      "claude-code": true,
      "windsurf": false,
      "github-copilot": true
    }
  }
}
```

---

## Validation Checklist

When creating or converting templates, verify:

- [ ] Main skill file is named `SKILL.md`
- [ ] All directories and files use kebab-case
- [ ] Content under 12,000 characters (Windsurf limit) or properly chunked
- [ ] Quick start section under 6,000 characters (Copilot context limit)
- [ ] Path-specific rules have valid glob patterns
- [ ] Agent definitions include behavioral constraints
- [ ] Platform-specific features are tagged appropriately
- [ ] Gitignore includes LOCAL.md and state/ directory
- [ ] Reverse mapping is documented for conversions

---

## Sources

- TERMINOLOGY-MAPPING.md (File Organization section)
- CAPABILITY-MATRIX.md (File Organization section)
- GAP-ANALYSIS.md (Workaround patterns)
- Official documentation from Claude Code, Windsurf, and GitHub Copilot
