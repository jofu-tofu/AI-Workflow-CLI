# Cross-Platform Template User Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-13

A comprehensive guide to creating and using cross-platform AI assistant templates that work across Claude Code, Windsurf, and GitHub Copilot.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Template Anatomy](#2-template-anatomy)
3. [Frontmatter Reference](#3-frontmatter-reference)
4. [Platform Targeting](#4-platform-targeting)
5. [Worked Examples](#5-worked-examples)

---

## 1. Introduction

### What Are Cross-Platform Templates?

Cross-platform templates are portable instruction files that define skills, workflows, and behaviors for AI coding assistants. A single template can be converted to work with:

- **Claude Code** - Anthropic's CLI-based AI assistant
- **Windsurf** - Codeium's IDE with Cascade AI agent
- **GitHub Copilot** - Microsoft's AI pair programmer

Instead of maintaining separate configuration files for each platform, you write one template in the standard format and convert it to platform-specific formats as needed.

### Why Use the Standard Format?

**Portability** - Write once, deploy everywhere. Your team can use different AI assistants while sharing the same workflows.

**Completeness** - The standard schema is a superset of all three platforms. Nothing is lost in translation.

**Future-Proof** - As platforms evolve, the standard format captures new capabilities. Update templates centrally and regenerate platform outputs.

**Collaboration** - Share templates across teams regardless of which IDE or assistant they prefer.

### Quick Start (5-Minute First Template)

Create your first cross-platform template in three steps:

**Step 1:** Create the template directory structure:

```
.ai-templates/
  skills/
    my-first-skill/
      SKILL.md
```

**Step 2:** Write your template (`.ai-templates/skills/my-first-skill/SKILL.md`):

```yaml
---
name: my-first-skill
description: A simple skill that greets the user. USE WHEN user asks for a greeting.
version: "1.0.0"
platforms:
  - claude-code
  - windsurf
  - github-copilot
---

# My First Skill

Say hello to the user and ask how you can help them today.

Be friendly and professional in your greeting.
```

**Step 3:** Convert to platform-specific formats using the CLI:

```bash
aiwcli convert --platform claude-code
aiwcli convert --platform windsurf
aiwcli convert --platform github-copilot
```

That's it! Your template is now ready for all three platforms.

---

## 2. Template Anatomy

### Directory Structure

Templates live in the `.ai-templates/` directory at your project root:

```
.ai-templates/
  skills/               # Reusable capabilities
    code-review/
      SKILL.md
    dependency-updater/
      SKILL.md
  workflows/            # Multi-step processes
    deploy-production.workflow.md
    release-cycle.workflow.md
```

**Skills** are self-contained capabilities (code review, testing, refactoring).

**Workflows** are multi-step processes that may invoke multiple skills.

### File Naming Conventions

| Type | Location | Naming Pattern |
|------|----------|----------------|
| Skill | `.ai-templates/skills/{name}/` | `SKILL.md` |
| Workflow | `.ai-templates/workflows/` | `{name}.workflow.md` |

**Skill names** should be lowercase with hyphens: `code-review`, `dependency-updater`, `security-scan`.

**Workflow names** follow the same convention with `.workflow.md` suffix.

### YAML Frontmatter Structure

Every template consists of two parts:

1. **YAML frontmatter** (between `---` markers) - Machine-readable configuration
2. **Markdown body** - Human-readable instructions

```markdown
---
# YAML configuration goes here
name: example-skill
description: What the skill does
version: "1.0.0"
---

# Markdown Instructions

The actual instructions for the AI assistant go here.
```

The frontmatter is parsed by the conversion tools. The markdown body is passed through to the target platform.

### Markdown Body Conventions

The markdown body should include:

- **Title** (H1) - Clear name matching the frontmatter `name`
- **Purpose** - What the skill/workflow accomplishes
- **Steps** - Numbered or bulleted action items
- **Output format** - Expected results structure

Use standard markdown:
- Headers (`#`, `##`, `###`)
- Lists (ordered and unordered)
- Code blocks (with language hints)
- Tables for structured data

Avoid platform-specific markdown extensions that may not render correctly everywhere.

---

## 3. Frontmatter Reference

### Core Fields (Universal)

These fields work on all platforms and form the minimal portable specification.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes* | Unique identifier for the template |
| `description` | string | Recommended | Purpose and auto-invoke hints |
| `version` | string | No | Semantic version (default: "1.0.0") |

*Required for Claude Code; Windsurf uses filename; optional for GitHub Copilot.

**Example:**

```yaml
name: code-review
description: >
  USE WHEN reviewing code changes, pull requests, or examining code quality.
  Performs comprehensive code review for maintainability and security.
version: "1.0.0"
```

**Auto-Invoke Hint:** For Claude Code, include "USE WHEN" phrases in the description to enable automatic skill invocation based on user intent.

### Claude Code Fields

| Field | Type | Description |
|-------|------|-------------|
| `allowed-tools` | string[] | Whitelist of permitted tools |
| `model` | string | AI model to use (opus, sonnet, haiku) |
| `context` | string | Context mode: `inherit` or `fork` |
| `agent` | string | Reference to custom agent definition |
| `permissions` | object | Granular allow/deny patterns |
| `hooks` | object | Lifecycle event handlers (2.1.0+) |
| `language` | string | Response language (2.1.0+) |
| `disable-model-invocation` | boolean | Skip AI for simple commands |
| `argument-hint` | string | Usage hint shown on invocation |

**allowed-tools Example:**

```yaml
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(git *)
  - Bash(npm test)
  - Bash(npm run lint)
```

**Valid Tool Names:**
- File operations: `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `LS`
- Execution: `Bash`, `Bash(pattern)` (restricted)
- Subagents: `Task`, `Task(AgentType)`, `Skill`
- Web: `WebFetch`, `WebSearch`
- Notebooks: `NotebookRead`, `NotebookEdit`
- Tasks: `TodoRead`, `TodoWrite`
- Other: `LSP`, `MCPSearch`, `Computer`, `AskUserQuestion`

**permissions Example:**

```yaml
permissions:
  allow:
    - Read(**/*.ts)
    - Read(**/*.tsx)
    - Write(src/**/*.ts)
    - Bash(npm run *)
  deny:
    - Read(.env)
    - Read(.env.*)
    - Read(**/secrets/**)
    - Write(config/production.json)
    - Bash(rm -rf *)
```

**Model Values:**
- `claude-opus-4-5-20251101` - Most capable
- `claude-sonnet-4-5-20250929` - Balanced (recommended)
- `claude-haiku-4-20250107` - Fastest

### Windsurf Fields

| Field | Type | Description |
|-------|------|-------------|
| `trigger` | string | Activation mode |
| `globs` | string[] | File patterns (when trigger: glob) |
| `labels` | string[] | Categorization tags |
| `alwaysApply` | boolean | Apply to all interactions |
| `author` | string | Creator attribution |

**trigger Values:**
- `manual` - User explicitly invokes
- `always_on` - Applied to all interactions (like CLAUDE.md)
- `model_decision` - AI decides when to activate
- `glob` - Activated for matching file patterns

**Example:**

```yaml
trigger: model_decision
globs:
  - "**/*.ts"
  - "**/*.tsx"
labels:
  - code-quality
  - review
alwaysApply: false
author: "Your Team <team@example.com>"
```

### GitHub Copilot Fields

| Field | Type | Description |
|-------|------|-------------|
| `applyTo` | string[] | File glob patterns |
| `excludeAgent` | string[] | Agents to exclude |
| `mode` | string | Operating mode (agent, ask, edit) |
| `tools` | string[] | Available tools including MCP |
| `infer` | boolean | Enable automatic agent selection |
| `target` | string | Environment (vscode, github-copilot) |
| `metadata` | object | Custom key-value annotations |
| `handoffs` | array | Agent handoff configurations |
| `mcp-servers` | object | MCP server configurations |

**Example:**

```yaml
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
excludeAgent:
  - coding-agent
mode: agent
tools:
  - githubRepo
  - search/codebase
```

### Cross-Platform Fields

These meta-fields control conversion behavior and document platform differences.

| Field | Type | Description |
|-------|------|-------------|
| `platforms` | string[] | Target platforms for conversion |
| `compatibility` | object | Per-platform compatibility notes |
| `emulation` | object | Workaround patterns for missing features |

**platforms Example:**

```yaml
platforms:
  - claude-code
  - windsurf
  - github-copilot
```

**compatibility Example:**

```yaml
compatibility:
  claude-code:
    status: full
    notes: "Full feature support with isolated context and granular permissions"
  windsurf:
    status: partial
    notes: "No context isolation; permissions are advisory only"
  github-copilot:
    status: partial
    notes: "Limited to 10 files in working set; no permission enforcement"
```

**emulation Example:**

```yaml
emulation:
  subagents:
    pattern: sequential-workflow
    fallback: "Run tasks sequentially with context markers"
    limitations:
      - "No parallel execution"
      - "Context pollution risk"
  permissions:
    pattern: explicit-rules
    fallback: "Include permission rules in instruction body"
    limitations:
      - "Not enforced by platform"
      - "Relies on AI compliance"
```

### Field Availability Matrix

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
| `hooks` | Yes (2.1.0+) | Ignored | Ignored |
| `language` | Yes (2.1.0+) | Ignored | Ignored |
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
| `tools` | Ignored | Ignored | Yes |
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
- **Meta** - Used by converters, not passed to platform

### Validation Rules Summary

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

## 4. Platform Targeting

### Using the platforms Field

The `platforms` field specifies which platforms this template supports:

```yaml
platforms:
  - claude-code      # Anthropic's CLI assistant
  - windsurf        # Codeium's IDE
  - github-copilot  # Microsoft's AI programmer
```

When you run `aiwcli convert`:
- Templates without a `platforms` field convert to all platforms
- Templates with `platforms` only convert to listed platforms
- Omitting a platform from the list skips conversion for that platform

### Understanding Compatibility Markers

Use the `compatibility` field to document feature availability:

```yaml
compatibility:
  claude-code:
    status: full
    notes: "All features supported natively"
  windsurf:
    status: partial
    notes: "No subagent isolation; permissions advisory only"
  github-copilot:
    status: unsupported
    notes: "Requires features not available in Copilot"
```

**Status Values:**
- `full` - All template features work on this platform
- `partial` - Some features work; others are emulated or missing
- `unsupported` - Template should not be used on this platform

### What Happens on Unsupported Platforms

When converting a template to a platform where some features are not supported:

1. **Platform-specific fields are stripped** - Fields like `allowed-tools` are removed for Windsurf since it cannot enforce them.

2. **Advisory notes are injected** - Permission restrictions become instructional text: "Do not access .env files" instead of enforced rules.

3. **Emulation patterns apply** - Features like subagents become sequential workflows with context markers.

4. **Warnings are logged** - The conversion tool reports which features could not be fully translated.

**Example conversion behavior:**

Original template:
```yaml
permissions:
  deny:
    - Read(.env)
    - Write(config/production.json)
```

Converted for Windsurf (permissions not enforceable):
```markdown
**Access Restrictions (Advisory):**
- Do not read .env files
- Do not modify config/production.json
```

---

## 5. Worked Examples

### Example 1: Simple Single-Platform Skill

A minimal skill targeting only Claude Code:

**File:** `.ai-templates/skills/quick-test/SKILL.md`

```yaml
---
name: quick-test
description: >
  USE WHEN user wants to run tests quickly. Executes the test suite
  and reports results.
version: "1.0.0"

# Claude Code specific
allowed-tools:
  - Bash(npm test)
  - Bash(npm run test:*)
  - Read
model: claude-sonnet-4-5-20250929

# Only target Claude Code
platforms:
  - claude-code
---

# Quick Test Runner

Run the project's test suite and summarize results.

## Steps

1. Execute `npm test` to run the full test suite
2. If tests fail, use Read to examine failing test files
3. Summarize results with pass/fail counts

## Output Format

Report results as:

```
Test Results:
- Total: X tests
- Passed: Y
- Failed: Z
- Duration: N seconds
```

If failures exist, list the failing test names and file locations.
```

This template:
- Uses Claude Code-specific fields (`allowed-tools`, `model`)
- Only converts to Claude Code
- Has simple, focused functionality

### Example 2: Cross-Platform Code Review Skill

A full-featured skill that works across all three platforms:

**File:** `.ai-templates/skills/code-review/SKILL.md`

```yaml
---
# ============================================
# CORE FIELDS (Universal - All Platforms)
# ============================================
name: code-review
description: >
  USE WHEN reviewing code changes, pull requests, or examining code quality.
  Performs comprehensive code review for maintainability, performance, security,
  and adherence to best practices.
version: "1.0.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(npm run lint)
model: claude-sonnet-4-5-20250929
context: fork
agent: code-reviewer
permissions:
  allow:
    - Read(**/*.ts)
    - Read(**/*.tsx)
    - Read(**/*.js)
    - Read(**/*.jsx)
    - Read(**/*.py)
    - Read(package.json)
  deny:
    - Read(.env)
    - Read(.env.*)
    - Read(**/secrets/**)
    - Write(**)

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: model_decision
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
labels:
  - code-quality
  - review
  - best-practices
alwaysApply: false
author: "Development Team"

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
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
    notes: "Full feature support with isolated context and granular permissions"
  windsurf:
    status: partial
    notes: "No context isolation; permissions are advisory only"
  github-copilot:
    status: partial
    notes: "Limited to 10 files in working set; no permission enforcement"

emulation:
  subagents:
    pattern: sequential-workflow
    fallback: "Run review phases sequentially with context markers"
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

# Code Review Skill

Perform comprehensive code review focusing on quality, maintainability, security,
and best practices.

## Review Process

### Phase 1: Static Analysis

1. Examine each changed file for code quality issues
2. Search for anti-patterns like `any` types or `console.log` statements
3. Find TODO comments and technical debt markers

### Phase 2: Security Review

Check for security vulnerabilities:

1. Look for hardcoded credentials or API keys
2. Verify input validation patterns
3. Check for SQL injection or XSS vulnerabilities
4. Review authentication and authorization logic

**Access Restrictions:** Do not access .env files or secrets directories.
This review is read-only; do not modify any files.

### Phase 3: Best Practices

Evaluate code against best practices:

- Naming conventions
- Function length and complexity
- Error handling patterns
- Test coverage indicators

## Output Format

Create a findings report:

| Category | Severity | File | Line | Description |
|----------|----------|------|------|-------------|
| Security | High | - | - | - |
| Quality | Medium | - | - | - |
| Style | Low | - | - | - |

## Invocation

Invoke with `/code-review` or activate automatically when reviewing PRs.
```

This template demonstrates:
- All three platform sections with relevant fields
- Compatibility notes explaining feature differences
- Emulation patterns for features not universally supported
- Markdown body that works regardless of platform

### Example 3: Workflow with Semantic Constructs

A workflow that uses progress tracking and checkpoints:

**File:** `.ai-templates/workflows/dependency-update.workflow.md`

```yaml
---
# ============================================
# CORE FIELDS
# ============================================
name: dependency-updater
description: >
  USE WHEN checking for outdated dependencies, updating packages, or auditing
  for security vulnerabilities. Automates dependency maintenance workflow.
version: "1.0.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(npm outdated)
  - Bash(npm audit)
  - Bash(npm update *)
  - Bash(npm install *)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(npm test)
model: claude-sonnet-4-5-20250929
context: inherit
permissions:
  allow:
    - Read(package.json)
    - Read(package-lock.json)
    - Read(yarn.lock)
    - Write(package.json)
    - Write(package-lock.json)
    - Bash(npm *)
    - Bash(yarn *)
  deny:
    - Read(.env)
    - Bash(rm -rf *)
    - Bash(* --force)

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: manual
globs:
  - "package.json"
  - "package-lock.json"
  - "yarn.lock"
labels:
  - dependencies
  - maintenance
  - security
  - automation
alwaysApply: false
author: "Platform Team"

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "package.json"
  - "package-lock.json"
  - "requirements.txt"
  - "Cargo.toml"
mode: agent
tools:
  - githubRepo
  - search/codebase

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
    notes: "Full automation with Bash tool for npm commands"
  windsurf:
    status: full
    notes: "Can execute terminal commands via Cascade"
  github-copilot:
    status: partial
    notes: "Limited terminal access; may require manual command execution"
---

# Dependency Updater Workflow

Automated workflow for checking, updating, and verifying project dependencies.

## Workflow Steps

### Step 1: Audit Current State

Run dependency audit commands:

```bash
npm outdated --json
npm audit --json
```

Parse output to identify:
- Outdated packages (major, minor, patch)
- Security vulnerabilities (critical, high, medium, low)
- Deprecated packages

### Step 2: Categorize Updates

Categorize updates by risk level:

| Risk Level | Update Type | Action |
|------------|-------------|--------|
| Low | Patch updates | Auto-update |
| Medium | Minor updates | Review changelog |
| High | Major updates | Manual review required |
| Critical | Security fixes | Immediate update |

### Step 3: Apply Safe Updates

For low-risk updates, proceed automatically:

1. Run `npm update` for patch versions
2. Update package.json for approved minor versions
3. Run tests to verify changes

**Tool Restrictions (Advisory):** Only use npm commands listed above.
Do not use `rm -rf` or `--force` flags.

### Step 4: Verify Updates

Run comprehensive verification:

```bash
npm test
npm run build
npm run lint
```

## Progress Tracking

Track workflow progress:

- [ ] Step 1: Audit complete
- [ ] Step 2: Categorization complete
- [ ] Step 3: Updates applied
- [ ] Step 4: Verification complete
- [ ] Step 5: Committed

## Checkpoint

After successful verification, create atomic commit:

```
deps: update dependencies to latest compatible versions

Updated packages:
- package-a: 1.0.0 -> 1.0.5 (patch)
- package-b: 2.1.0 -> 2.2.0 (minor)

Security fixes:
- Resolved N vulnerabilities
```

## Rollback Plan

If issues are discovered after updates:

1. Use `git revert` to undo the checkpoint commit
2. Re-run `npm install` to restore previous lock file
3. Document which package caused the issue

## Invocation

Invoke with `/dependency-updater` or when user mentions:
- "update dependencies"
- "check for outdated packages"
- "npm audit"
```

This workflow demonstrates:
- Multi-step process with clear phases
- Progress tracking with checkbox format
- Checkpoint patterns for atomic commits
- Rollback procedures for failure recovery
- Advisory tool restrictions for platforms that cannot enforce permissions

---

## Additional Resources

For complete field definitions and validation rules, see:
- [STANDARD-SCHEMA.md](../STANDARD-SCHEMA.md) - Complete schema specification

For platform-specific details:
- [RESEARCH-claude-code.md](../RESEARCH-claude-code.md) - Claude Code capabilities
- [RESEARCH-windsurf.md](../RESEARCH-windsurf.md) - Windsurf capabilities
- [RESEARCH-github-copilot.md](../RESEARCH-github-copilot.md) - GitHub Copilot capabilities

For feature comparison:
- [CAPABILITY-MATRIX.md](../CAPABILITY-MATRIX.md) - Side-by-side feature comparison
- [TERMINOLOGY-MAPPING.md](../TERMINOLOGY-MAPPING.md) - Concept translation between platforms

---

## Summary

Cross-platform templates enable you to:

1. **Write once** - Create templates in the standard format
2. **Convert anywhere** - Generate platform-specific outputs
3. **Document differences** - Use compatibility and emulation fields
4. **Stay portable** - Share workflows across teams using different tools

Start with the [Quick Start](#quick-start-5-minute-first-template) example, then expand to cross-platform templates as your needs grow. The standard schema ensures nothing is lost as you target multiple platforms.
