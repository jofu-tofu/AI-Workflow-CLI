# Cross-Platform Template Standard Schema

**Version:** 1.0.0
**Date:** 2026-01-12
**Purpose:** Superset YAML frontmatter specification for cross-platform AI assistant compatibility

---

## Overview

This schema defines a unified frontmatter specification that captures ALL features from Claude Code, Windsurf, and GitHub Copilot. The superset approach preserves maximum expressiveness while providing clear platform availability markers.

**Design Principle:** Include all fields from all platforms. Each platform ignores fields it doesn't understand, while platform adapters can use the full specification to generate platform-specific output.

---

## Schema Structure

```yaml
---
# ============================================
# CORE FIELDS (Universal - All Platforms)
# ============================================
name: string                    # Template identifier
description: string             # Purpose and auto-invoke hint
version: string                 # Semantic version (e.g., "1.0.0")

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools: string[]         # Tool permissions
model: string                   # Model selection
context: string                 # Context handling mode
agent: string                   # Custom agent type reference
permissions:                    # Granular access control
  allow: string[]               # Allowed patterns
  deny: string[]                # Denied patterns

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: string                 # Activation mode
globs: string[]                 # File patterns for glob trigger
labels: string[]                # Categorization tags
alwaysApply: boolean            # Universal application flag
author: string                  # Creator attribution

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo: string[]               # Path-specific instruction patterns
excludeAgent: string[]          # Agents to exclude from
mode: string                    # Copilot mode (agent, ask, edit)

# ============================================
# CROSS-PLATFORM FIELDS
# ============================================
platforms: string[]             # Target platforms
compatibility: object           # Per-platform notes
emulation: object               # Workaround patterns
---
```

---

## Field Definitions

### Core Fields (Universal)

These fields are supported by all three platforms and form the minimal portable specification.

#### `name`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | Yes (Claude Code), No (Windsurf uses filename), Yes (GitHub Copilot) |
| **Default** | Filename without extension |
| **Platforms** | Claude Code, Windsurf, GitHub Copilot |
| **Description** | Unique identifier for the template. In Windsurf, the filename serves as the name. |

**Validation Rules:**
- Must be a valid identifier (alphanumeric, hyphens, underscores)
- Should be URL-safe and filesystem-safe
- Maximum 64 characters recommended

**Example:**
```yaml
name: code-review
```

---

#### `description`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | Strongly recommended |
| **Default** | None |
| **Platforms** | Claude Code, Windsurf, GitHub Copilot |
| **Description** | Human-readable description of what the template does. Used for auto-invocation matching in Claude Code and documentation in all platforms. |

**Validation Rules:**
- Should clearly describe the template's purpose
- For auto-invoke in Claude Code, include trigger phrases like "USE WHEN working with Python files"
- Maximum 500 characters recommended

**Example:**
```yaml
description: Review code changes for security vulnerabilities and best practice violations
```

---

#### `version`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | No |
| **Default** | `"1.0.0"` |
| **Platforms** | Claude Code, Windsurf (as `modified`), GitHub Copilot |
| **Description** | Semantic version string for tracking template changes. |

**Validation Rules:**
- Should follow Semantic Versioning (semver) format: `MAJOR.MINOR.PATCH`
- Windsurf may use `modified` date instead

**Example:**
```yaml
version: "2.1.0"
```

---

### Claude Code Fields

These fields are specific to Claude Code's advanced features.

#### `allowed-tools`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` |
| **Required** | No |
| **Default** | All tools available |
| **Platforms** | Claude Code only |
| **Description** | Whitelist of tools the template can use. Provides granular permission control. |

**Validation Rules:**
- Array of tool names with optional patterns
- Supports wildcards and specific command patterns

**Valid Tool Names:**
- `Bash` - Shell command execution
- `Bash(pattern)` - Restricted shell (e.g., `Bash(git *)`)
- `Read` - File reading
- `Read(pattern)` - Restricted reading (e.g., `Read(**/*.ts)`)
- `Write` - File creation/overwriting
- `Write(pattern)` - Restricted writing
- `Edit` - File modification
- `MultiEdit` - Multiple edits to single file
- `Glob` - File pattern matching
- `Grep` - Content search
- `Task` - Subagent spawning
- `Task(AgentType)` - Specific agent type restriction
- `Skill` - Skill execution
- `LSP` - Language Server Protocol (code intelligence)
- `LS` - List files and directories
- `WebFetch` - Web content retrieval
- `WebSearch` - Web search
- `NotebookRead` - Read Jupyter notebooks
- `NotebookEdit` - Edit Jupyter notebooks
- `TodoRead` - Read task list
- `TodoWrite` - Manage task list
- `MCPSearch` - MCP tool discovery
- `Computer` - Browser automation
- `EnterPlanMode` - Enter planning mode
- `ExitPlanMode` - Exit planning mode
- `AskUserQuestion` - User input prompts

**Example:**
```yaml
allowed-tools:
  - Read
  - Write
  - Bash(git *)
  - Bash(npm test)
```

---

#### `model`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | No |
| **Default** | Session default model |
| **Platforms** | Claude Code, Windsurf, GitHub Copilot (Pro+ only) |
| **Description** | AI model to use for this template. |

**Valid Values (Claude Code):**
- `claude-sonnet-4-5-20250929` - Claude Sonnet 4.5 (balanced)
- `claude-opus-4-5-20251101` - Claude Opus 4.5 (most capable)
- `claude-haiku-4-20250107` - Claude Haiku 4 (fastest)
- `sonnet`, `opus`, `haiku` - Legacy short names (still supported for backwards compatibility)

**Valid Values (Windsurf):**
- `claude-opus-4-5-20251101` - Claude Opus 4.5
- `claude-sonnet-4-5-20250929` - Claude Sonnet 4.5
- `swe-1` - SWE-1 (software engineering optimized)
- `swe-1-lite` - SWE-1 Lite (faster variant)
- `swe-1-mini` - SWE-1 Mini (lightweight)
- `swe-1.5` - SWE-1.5 (latest, free through Q1 2026)

**Valid Values (GitHub Copilot Pro+):**
- `claude-opus-4` - Claude Opus 4
- `claude-opus-4.1` - Claude Opus 4.1 (newest variant)
- `claude-3.7-sonnet` - Claude 3.7 Sonnet (January 2026)
- `claude-3.5-sonnet` - Claude 3.5 Sonnet
- `openai-o3` - OpenAI o3 (reasoning model)
- `openai-o3-mini` - OpenAI o3-mini (fast reasoning)
- `gpt-4o` - GPT-4 Omni
- `gemini-3-flash` - Gemini 3 Flash (December 2025/January 2026)
- `gemini-2.0-flash` - Gemini 2.0 Flash
- `gemini-1.5-pro` - Gemini 1.5 Pro

**Example:**
```yaml
model: claude-opus-4-5-20251101  # Full version string (recommended)
# model: opus                    # Legacy short name (still works)
```

---

#### `context`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | No |
| **Default** | `"inherit"` |
| **Platforms** | Claude Code only |
| **Description** | Context handling mode for subagent execution. |

**Valid Values:**
- `inherit` - Share context with parent session
- `fork` - Isolated context for subagent (prevents pollution)

**Example:**
```yaml
context: fork
```

---

#### `agent`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | No |
| **Default** | Default agent |
| **Platforms** | Claude Code only |
| **Description** | Reference to a custom agent type defined in `.claude/agents/`. |

**Validation Rules:**
- Must reference an existing agent definition file
- Filename without extension

**Example:**
```yaml
agent: security-reviewer
```

---

#### `permissions`

| Attribute | Value |
|-----------|-------|
| **Type** | `object` |
| **Required** | No |
| **Default** | Session defaults |
| **Platforms** | Claude Code only |
| **Description** | Granular permission control for file and command access. |

**Sub-fields:**

##### `permissions.allow`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` |
| **Description** | Patterns explicitly allowed for this template. |

##### `permissions.deny`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` |
| **Description** | Patterns explicitly denied for this template. |

**Pattern Format:**
- `Read(glob)` - File read patterns
- `Write(glob)` - File write patterns
- `Bash(command)` - Command patterns

**Example:**
```yaml
permissions:
  allow:
    - Read(**/*.ts)
    - Write(src/**/*.ts)
    - Bash(npm run *)
  deny:
    - Read(.env)
    - Read(secrets/**)
    - Write(config/production.json)
    - Bash(rm -rf *)
```

---

#### `disable-model-invocation`

| Attribute | Value |
|-----------|-------|
| **Type** | `boolean` |
| **Required** | No |
| **Default** | `false` |
| **Platforms** | Claude Code only |
| **Description** | When true, skips AI processing for lightweight commands. Useful for simple utility skills that don't need model inference. |

**Use Cases:**
- File system operations (ls, pwd, cd)
- Simple text transformations
- Alias-style commands
- Template boilerplate generation

**Example:**
```yaml
disable-model-invocation: true
```

---

#### `argument-hint`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | No |
| **Default** | None |
| **Platforms** | Claude Code only |
| **Description** | User-facing guidance text shown when the skill is invoked, describing expected arguments or usage. |

**Example:**
```yaml
argument-hint: "<branch-name> [--force]"
```

```yaml
argument-hint: "Provide a commit message or leave blank for auto-generation"
```

---

#### `hooks`

| Attribute | Value |
|-----------|-------|
| **Type** | `object` |
| **Required** | No |
| **Default** | None |
| **Platforms** | Claude Code 2.1.0+ |
| **Description** | Event-driven automation hooks scoped to skill/command lifecycle. Allows skills to define their own hook handlers that execute during specific lifecycle events. |

**Available Events:**
- `PreToolUse` - Before tool execution
- `PostToolUse` - After tool completion
- `Stop` - When agent finishes responding

**Hook Configuration Schema:**
```yaml
hooks:
  PreToolUse:
    - matcher: string           # Tool name pattern (supports regex)
      once: boolean             # Execute only once per session
      hooks:
        - type: string          # Hook type (e.g., "command")
          command: string       # Command to execute
          timeout: number       # Max execution time in seconds
  PostToolUse:
    - matcher: string
      hooks:
        - type: string
          command: string
  Stop:
    - hooks:
        - type: string
          command: string
```

**Example:**
```yaml
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      once: false
      hooks:
        - type: command
          command: "npm run lint"
          timeout: 30
  Stop:
    - hooks:
        - type: command
          command: "echo 'Skill execution complete'"
```

**Notes:**
- Skill-level hooks override global hooks for matching patterns
- Hooks execute in skill context with skill permissions
- Available in Claude Code 2.1.0+ (January 2026)

---

#### `language`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | No |
| **Default** | `"english"` |
| **Platforms** | Claude Code 2.1.0+ |
| **Description** | Configures Claude's response language for multilingual workflows. Enables localized AI interactions without post-processing. |

**Valid Values:**
- Any language name (e.g., `"japanese"`, `"spanish"`, `"french"`, `"german"`, `"chinese"`, etc.)
- Case-insensitive

**Example:**
```yaml
language: japanese
```

**Use Cases:**
- International teams requiring localized documentation
- Multi-language code review workflows
- Region-specific customer support automation
- Educational content in native languages

---

### Windsurf Fields

These fields are specific to Windsurf's workflow and rule system.

#### `trigger`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` (enum) |
| **Required** | No |
| **Default** | `"manual"` |
| **Platforms** | Windsurf only |
| **Description** | Determines when and how the rule/workflow is activated. |

**Valid Values:**
- `manual` - User explicitly invokes with `@rules:name` or `/workflow`
- `always_on` - Automatically applied to all interactions (like CLAUDE.md)
- `model_decision` - AI decides when to activate based on context (unique to Windsurf)
- `glob` - Activated when working with files matching specified patterns

**Example:**
```yaml
trigger: model_decision
```

---

#### `globs`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` |
| **Required** | Required when `trigger: glob` |
| **Default** | None |
| **Platforms** | Windsurf only |
| **Description** | File patterns that trigger rule activation when `trigger: glob`. |

**Validation Rules:**
- Standard glob pattern syntax
- Supports wildcards (`*`, `**`)
- Can include file extensions

**Example:**
```yaml
trigger: glob
globs:
  - "*.py"
  - "**/*.py"
  - "tests/**/*.test.ts"
```

---

#### `labels`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` |
| **Required** | No |
| **Default** | `[]` |
| **Platforms** | Windsurf only |
| **Description** | Categorization tags for organizing and discovering workflows. |

**Example:**
```yaml
labels:
  - deployment
  - automation
  - production
```

---

#### `alwaysApply`

| Attribute | Value |
|-----------|-------|
| **Type** | `boolean` |
| **Required** | No |
| **Default** | `false` |
| **Platforms** | Windsurf only |
| **Description** | When true, rule applies to all interactions regardless of trigger. Equivalent to `trigger: always_on`. |

**Example:**
```yaml
alwaysApply: true
```

---

#### `author`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` |
| **Required** | No |
| **Default** | None |
| **Platforms** | Windsurf only |
| **Description** | Creator attribution for the workflow/rule. |

**Example:**
```yaml
author: "Development Team <team@example.com>"
```

---

### GitHub Copilot Fields

These fields are specific to GitHub Copilot's instruction system.

#### `applyTo`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` or `string` |
| **Required** | No |
| **Default** | All files |
| **Platforms** | GitHub Copilot only |
| **Description** | Glob patterns specifying which files this instruction applies to. |

**Validation Rules:**
- Standard glob pattern syntax
- Multiple patterns can be comma-separated in a string or as array
- Supports `**` for recursive matching

**Normalization:**
- String format: `"**/*.ts,**/*.tsx"` → normalized to `["**/*.ts", "**/*.tsx"]`
- Array format: `["**/*.ts", "**/*.tsx"]` → used as-is
- Platform adapters should always normalize to array format for consistent processing

**Pattern Examples:**
- `"*"` - Current directory only
- `"**"` - All files recursively
- `"*.py"` - Python files in current directory
- `"**/*.ts,**/*.tsx"` - TypeScript files everywhere
- `"**/subdir/**/*.py"` - Python in any subdir

**Example:**
```yaml
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.test.ts"
```

---

#### `excludeAgent`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` or `string` |
| **Required** | No |
| **Default** | None (applies to all agents) |
| **Platforms** | GitHub Copilot only |
| **Description** | Agents that should NOT receive these instructions. |

**Valid Values:**
- `"code-review"` - Exclude from code review agent
- `"coding-agent"` - Exclude from coding/implementation agent

**Normalization:**
- String format: `"code-review"` → normalized to `["code-review"]`
- Array format: `["code-review", "coding-agent"]` → used as-is
- Platform adapters should always normalize to array format for consistent processing

**Example:**
```yaml
excludeAgent:
  - code-review
```

---

#### `mode`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` (enum) |
| **Required** | No |
| **Default** | Context-dependent |
| **Platforms** | GitHub Copilot only |
| **Description** | Copilot operating mode for this instruction. |

**Valid Values:**
- `agent` - Autonomous multi-step execution mode
- `ask` - Conversational Q&A mode
- `edit` - Direct inline file modification mode

**Example:**
```yaml
mode: agent
```

---

#### `tools`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` |
| **Required** | No |
| **Default** | All available tools |
| **Platforms** | GitHub Copilot (Agent Skills, Custom Agents, Prompt Files) |
| **Description** | List of tools the agent/skill can use, including MCP tools. |

**Valid Values:**
- Tool names (e.g., `"githubRepo"`, `"search/codebase"`)
- MCP server wildcard: `"server-name/*"` (all tools from MCP server)

**Example:**
```yaml
tools:
  - githubRepo
  - search/codebase
  - github-mcp/*
```

---

#### `infer`

| Attribute | Value |
|-----------|-------|
| **Type** | `boolean` |
| **Required** | No |
| **Default** | `false` |
| **Platforms** | GitHub Copilot (Custom Agents) |
| **Description** | When true, enables automatic agent selection based on task context. AI determines when to invoke this agent without explicit user mention. |

**Example:**
```yaml
infer: true
```

---

#### `target`

| Attribute | Value |
|-----------|-------|
| **Type** | `string` (enum) |
| **Required** | No |
| **Default** | Both environments |
| **Platforms** | GitHub Copilot (Custom Agents) |
| **Description** | Specifies the environment context where the agent operates. |

**Valid Values:**
- `vscode` - VS Code only
- `github-copilot` - GitHub.com only

**Example:**
```yaml
target: vscode
```

---

#### `metadata`

| Attribute | Value |
|-----------|-------|
| **Type** | `object` |
| **Required** | No |
| **Default** | `{}` |
| **Platforms** | GitHub Copilot (Custom Agents) |
| **Description** | Custom name-value pairs for agent annotations and metadata. |

**Example:**
```yaml
metadata:
  category: "code-review"
  version: "2.1.0"
  team: "platform-engineering"
```

---

#### `handoffs`

| Attribute | Value |
|-----------|-------|
| **Type** | `array` |
| **Required** | No |
| **Default** | `[]` |
| **Platforms** | GitHub Copilot (VS Code only, not supported on GitHub.com) |
| **Description** | Configuration for agent handoff buttons, enabling seamless transition between specialized agents. |

**Schema:**
```yaml
handoffs:
  - target: string          # Target agent name
    button_label: string    # Button text displayed to user
    prompt: string          # Optional handoff prompt
```

**Example:**
```yaml
handoffs:
  - target: security-reviewer
    button_label: "Hand off to Security"
    prompt: "Please perform security review of this code"
```

**Platform Notes:**
- VS Code: Fully supported with UI buttons
- GitHub.com: Not supported (field ignored)

---

#### `mcp-servers`

| Attribute | Value |
|-----------|-------|
| **Type** | `object` |
| **Required** | No |
| **Default** | `{}` |
| **Platforms** | GitHub Copilot (Custom Agents) |
| **Description** | MCP (Model Context Protocol) server configurations for this agent. |

**Schema:**
```yaml
mcp-servers:
  server-name:
    # Server-specific configuration
```

**Example:**
```yaml
mcp-servers:
  github-api:
    endpoint: "https://api.github.com"
    auth: "${GITHUB_TOKEN}"
```

---

### Cross-Platform Fields

These fields support portability and platform adaptation.

#### `platforms`

| Attribute | Value |
|-----------|-------|
| **Type** | `string[]` |
| **Required** | No |
| **Default** | All platforms |
| **Platforms** | Cross-platform (meta-field) |
| **Description** | Target platforms for this template. Platform adapters use this to determine output targets. |

**Valid Values:**
- `claude-code`
- `windsurf`
- `github-copilot`

**Example:**
```yaml
platforms:
  - claude-code
  - windsurf
  - github-copilot
```

---

#### `compatibility`

| Attribute | Value |
|-----------|-------|
| **Type** | `object` |
| **Required** | No |
| **Default** | None |
| **Platforms** | Cross-platform (meta-field) |
| **Description** | Per-platform compatibility notes and feature availability. |

**Structure:**
```yaml
compatibility:
  claude-code:
    status: full | partial | unsupported
    notes: string
  windsurf:
    status: full | partial | unsupported
    notes: string
  github-copilot:
    status: full | partial | unsupported
    notes: string
```

**Example:**
```yaml
compatibility:
  claude-code:
    status: full
    notes: "All features supported natively"
  windsurf:
    status: partial
    notes: "Subagent spawning emulated via sequential workflows"
  github-copilot:
    status: partial
    notes: "Limited to 10 files in working set"
```

---

#### `emulation`

| Attribute | Value |
|-----------|-------|
| **Type** | `object` |
| **Required** | No |
| **Default** | None |
| **Platforms** | Cross-platform (meta-field) |
| **Description** | Workaround patterns for features not natively supported on target platforms. |

**Structure:**
```yaml
emulation:
  feature-name:
    pattern: string           # Emulation strategy name
    fallback: string          # Fallback behavior description
    limitations: string[]     # Known limitations of emulation
```

**Example:**
```yaml
emulation:
  subagents:
    pattern: "sequential-workflow"
    fallback: "Execute tasks sequentially with context markers"
    limitations:
      - "Not truly parallel execution"
      - "No isolated contexts"
      - "Manual orchestration required"
  permissions:
    pattern: "explicit-rules"
    fallback: "Document restrictions as instructions (not enforced)"
    limitations:
      - "Relies on AI compliance"
      - "No technical enforcement"
```

---

## Complete Example

```yaml
---
# ============================================
# CORE FIELDS (Universal)
# ============================================
name: security-code-review
description: >
  USE WHEN reviewing code for security vulnerabilities. Performs comprehensive
  security analysis including OWASP Top 10, dependency vulnerabilities, and
  authentication/authorization issues.
version: "2.0.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(npm audit)
  - Bash(git log *)
  - Bash(git diff *)
model: opus
context: fork
agent: security-reviewer
permissions:
  allow:
    - Read(**/*.ts)
    - Read(**/*.js)
    - Read(**/*.py)
    - Read(package.json)
    - Read(package-lock.json)
  deny:
    - Read(.env)
    - Read(.env.*)
    - Read(**/secrets/**)
    - Read(**/credentials.*)
    - Write(**)

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: model_decision
globs:
  - "**/*.ts"
  - "**/*.js"
  - "**/*.py"
labels:
  - security
  - code-review
  - automation
alwaysApply: false
author: "Security Team <security@example.com>"

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "**/*.ts"
  - "**/*.js"
  - "**/*.py"
excludeAgent:
  - coding-agent
mode: agent

# ============================================
# CROSS-PLATFORM FIELDS
# ============================================
platforms:
  - claude-code
  - windsurf
  - github-copilot

compatibility:
  claude-code:
    status: full
    notes: "Full feature support with subagent isolation and granular permissions"
  windsurf:
    status: partial
    notes: "No subagent isolation; permissions are advisory only"
  github-copilot:
    status: partial
    notes: "Limited to 10 files per review; no lifecycle hooks"

emulation:
  subagents:
    pattern: sequential-workflow
    fallback: "Run security checks sequentially with context markers"
    limitations:
      - "No parallel execution"
      - "Context pollution risk"
  permissions:
    pattern: explicit-rules
    fallback: "Include permission rules in instruction body"
    limitations:
      - "Not enforced by platform"
      - "Relies on AI compliance"
---

# Security Code Review

Perform a comprehensive security review of the codebase.

## Review Checklist

### OWASP Top 10
- [ ] Injection vulnerabilities (SQL, Command, LDAP)
- [ ] Broken authentication
- [ ] Sensitive data exposure
- [ ] XML External Entities (XXE)
- [ ] Broken access control
- [ ] Security misconfiguration
- [ ] Cross-Site Scripting (XSS)
- [ ] Insecure deserialization
- [ ] Using components with known vulnerabilities
- [ ] Insufficient logging and monitoring

### Dependency Analysis
1. Run `npm audit` to check for known vulnerabilities
2. Review dependency versions in package.json
3. Check for outdated packages with security issues

### Authentication/Authorization
1. Verify JWT token handling
2. Check password hashing algorithms
3. Review session management
4. Validate role-based access controls

## Output Format

Create a security report with:
- Severity ratings (Critical, High, Medium, Low)
- Specific file and line references
- Remediation recommendations
- Priority order for fixes
```

---

## Validation Rules Summary

### Required Fields

| Platform | Required Fields |
|----------|-----------------|
| **All** | `description` (strongly recommended) |
| **Claude Code** | `name` |
| **Windsurf** | None (filename is name) |
| **GitHub Copilot** | None |

### Field Constraints

| Field | Constraint |
|-------|------------|
| `name` | Max 64 chars, alphanumeric + hyphens/underscores |
| `description` | Max 500 chars recommended |
| `version` | Semver format (MAJOR.MINOR.PATCH) |
| `allowed-tools` | Valid tool names only |
| `model` | Platform-specific valid values |
| `context` | `inherit` or `fork` only |
| `trigger` | `manual`, `always_on`, `model_decision`, or `glob` |
| `globs` | Required when `trigger: glob` |
| `platforms` | `claude-code`, `windsurf`, `github-copilot` |
| `compatibility.*.status` | `full`, `partial`, or `unsupported` |

### Platform-Specific Limits

| Platform | Limit |
|----------|-------|
| **Windsurf** | 12,000 character max for workflow/rule files |
| **GitHub Copilot** | 10 files max in working set |
| **GitHub Copilot** | ~6,000 lines per file max |
| **GitHub Copilot** | 6,000 character context window |
| **GitHub Copilot** | 20 files max for context |

---

## Field Availability Matrix

| Field | Claude Code | Windsurf | GitHub Copilot |
|-------|:-----------:|:--------:|:--------------:|
| **Core Fields** |
| `name` | Required | Filename | Optional |
| `description` | Recommended | Recommended | Recommended |
| `version` | Optional | As `modified` | Optional |
| **Claude Code Fields** |
| `allowed-tools` | Yes | Ignored | Ignored |
| `model` | Yes | Yes | Pro+ only |
| `context` | Yes | Ignored | Ignored |
| `agent` | Yes | Ignored | Ignored |
| `permissions.allow` | Yes | Ignored | Ignored |
| `permissions.deny` | Yes | Ignored | Ignored |
| **Windsurf Fields** |
| `trigger` | Ignored | Yes | Ignored |
| `globs` | Ignored | Yes | Ignored |
| `labels` | Ignored | Yes | Ignored |
| `alwaysApply` | Ignored | Yes | Ignored |
| `author` | Ignored | Yes | Ignored |
| **GitHub Copilot Fields** |
| `applyTo` | Ignored | As `globs` | Yes |
| `excludeAgent` | Ignored | Ignored | Yes |
| `mode` | Ignored | Ignored | Yes |
| **Cross-Platform Fields** |
| `platforms` | Meta | Meta | Meta |
| `compatibility` | Meta | Meta | Meta |
| `emulation` | Meta | Meta | Meta |

**Legend:**
- **Yes** - Natively supported
- **Required** - Must be present
- **Recommended** - Strongly suggested
- **Optional** - Can be omitted
- **Ignored** - Platform ignores this field
- **As X** - Maps to equivalent field X
- **Meta** - Used by adapters, not passed to platform

---

## Platform Adapter Behavior

### Claude Code Adapter

**Input Processing:**
1. Extract `name`, `description`, `version`, `allowed-tools`, `model`, `context`, `agent`, `permissions`
2. Ignore Windsurf-specific fields
3. Ignore GitHub Copilot-specific fields
4. Use `emulation` patterns if feature gaps exist

**Output Location:**
- Skills: `.claude/skills/{name}/SKILL.md`
- Commands: `.claude/commands/{name}.md`
- Agents: `.claude/agents/{name}.md`

### Windsurf Adapter

**Input Processing:**
1. Extract `description`, `trigger`, `globs`, `labels`, `alwaysApply`, `author`
2. Use filename as `name`
3. Map `applyTo` to `globs` if `trigger: glob`
4. Ignore Claude Code permission fields (document as instructions)
5. Apply 12,000 character limit

**Output Location:**
- Rules: `.windsurf/rules/{name}.md`
- Workflows: `.windsurf/workflows/{name}.md`

### GitHub Copilot Adapter

**Input Processing:**
1. Extract `description`, `applyTo`, `excludeAgent`, `mode`
2. Map `globs` to `applyTo` if present
3. Ignore lifecycle hooks (document as manual steps)
4. Check for 10-file working set limit compatibility

**Output Location:**
- Instructions: `.github/copilot-instructions.md` (repo-wide)
- Path-specific: `.github/instructions/{name}.instructions.md`
- Prompts: `.github/prompts/{name}.prompt.md`

---

## Migration Examples

### From Claude Code Skill

**Original:**
```yaml
---
name: deploy
description: Deploy application to production
allowed-tools: Bash
model: sonnet
---
```

**Standard Schema:**
```yaml
---
name: deploy
description: Deploy application to production
version: "1.0.0"
allowed-tools:
  - Bash
model: sonnet
trigger: manual
platforms:
  - claude-code
  - windsurf
  - github-copilot
---
```

### From Windsurf Workflow

**Original:**
```yaml
---
trigger: glob
globs: ["*.py"]
description: Python coding standards
labels: python, standards
---
```

**Standard Schema:**
```yaml
---
name: python-standards
description: USE WHEN working with Python files. Python coding standards and best practices.
version: "1.0.0"
trigger: glob
globs:
  - "*.py"
  - "**/*.py"
labels:
  - python
  - standards
applyTo:
  - "**/*.py"
platforms:
  - claude-code
  - windsurf
  - github-copilot
---
```

### From GitHub Copilot Instructions

**Original:**
```yaml
---
applyTo: "**/*.test.ts"
description: Testing standards
---
```

**Standard Schema:**
```yaml
---
name: testing-standards
description: USE WHEN writing tests. Testing standards for TypeScript test files.
version: "1.0.0"
applyTo:
  - "**/*.test.ts"
trigger: glob
globs:
  - "**/*.test.ts"
platforms:
  - claude-code
  - windsurf
  - github-copilot
---
```

---

## Sources

- RESEARCH-claude-code.md
- RESEARCH-windsurf.md
- RESEARCH-github-copilot.md
- CAPABILITY-MATRIX.md
- TERMINOLOGY-MAPPING.md
- GAP-ANALYSIS.md
- Official documentation from all three platforms
