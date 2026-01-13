# Platform Adapters: Transformation Rules

**Version:** 1.0.0
**Date:** 2026-01-12
**Purpose:** Define deterministic transformation rules for converting superset templates to platform-native formats

---

## Overview

This document specifies the **platform adapters** that transform templates written in the Standard Schema (superset format) into native formats for Claude Code, Windsurf, and GitHub Copilot. Each adapter handles:

1. **Field Mapping** - Converting superset fields to platform-native equivalents
2. **Emulation Patterns** - Workarounds for features not natively supported
3. **Output Structure** - Platform-specific file locations and formats
4. **Validation** - Platform-specific constraints and limits
5. **Warning Generation** - Alerts for unsupported or degraded features

---

## Table of Contents

1. [Claude Code Adapter](#1-claude-code-adapter)
2. [Windsurf Adapter](#2-windsurf-adapter)
3. [GitHub Copilot Adapter](#3-github-copilot-adapter)
4. [Transformation Rules](#4-transformation-rules)
5. [Complete Transformation Example](#5-complete-transformation-example)

---

## 1. Claude Code Adapter

Claude Code is the **most feature-complete platform**, so the adapter primarily strips unused fields and restructures output for Claude Code's directory conventions.

**See Also:** [WORKAROUND-PATTERNS.md Pattern 2](WORKAROUND-PATTERNS.md#pattern-2-workflow-emulation-for-claude-code) - Detailed workflow emulation pattern for converting Windsurf workflows with AI-driven activation to Claude Code skills

### 1.1 Field Mapping

| Superset Field | Claude Code Field | Transformation |
|----------------|-------------------|----------------|
| `name` | `name` | Direct copy (required) |
| `description` | `description` | Direct copy |
| `version` | `version` | Direct copy |
| `allowed-tools` | `allowed-tools` | Direct copy as array |
| `model` | `model` | Direct copy |
| `context` | `context` | Direct copy (`inherit` or `fork`) |
| `agent` | `agent` | Direct copy (reference to agent file) |
| `permissions.allow` | `permissions.allow` | Direct copy as array |
| `permissions.deny` | `permissions.deny` | Direct copy as array |
| `trigger` | *(dropped)* | Windsurf-only field |
| `globs` | *(dropped)* | Windsurf-only field |
| `labels` | *(dropped)* | Windsurf-only field |
| `alwaysApply` | *(dropped)* | Windsurf-only field |
| `author` | *(dropped)* | Windsurf-only field |
| `applyTo` | *(dropped)* | GitHub Copilot-only field |
| `excludeAgent` | *(dropped)* | GitHub Copilot-only field |
| `mode` | *(dropped)* | GitHub Copilot-only field |
| `platforms` | *(dropped)* | Meta-field (processed by adapter) |
| `compatibility` | *(dropped)* | Meta-field (documentation only) |
| `emulation` | *(dropped)* | Meta-field (used by other adapters) |

### 1.2 Dropped Fields (Windsurf/Copilot-Only)

The following fields are **ignored** when generating Claude Code output:

**Windsurf Fields:**
- `trigger` - Activation modes not applicable (Claude uses auto-invoke via description)
- `globs` - File patterns handled via `permissions` in Claude Code
- `labels` - No categorization system in Claude Code
- `alwaysApply` - Equivalent to placing content in CLAUDE.md
- `author` - No attribution field in Claude Code

**GitHub Copilot Fields:**
- `applyTo` - Use `permissions` patterns instead
- `excludeAgent` - No agent exclusion in Claude Code
- `mode` - All Claude Code skills are implicitly "agent" mode

### 1.3 Output Structure

```
.claude/
+-- skills/
|   +-- {name}/
|       +-- SKILL.md              # Main skill file with frontmatter
|       +-- assets/               # Optional supporting files
|       +-- CHUNKS/               # Optional chunked content
|
+-- agents/
|   +-- {agent-name}.md           # Custom agent definitions (if referenced)
|
+-- settings.json                 # Permission grants (generated)
```

#### SKILL.md Output Format

```yaml
---
name: {name}
description: {description}
version: {version}
allowed-tools: {allowed-tools}
model: {model}
context: {context}
agent: {agent}
---

{markdown_body}
```

### 1.4 Settings Generation

When `permissions` are specified, generate or update `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "{permissions.allow[0]}",
      "{permissions.allow[1]}"
    ],
    "deny": [
      "{permissions.deny[0]}",
      "{permissions.deny[1]}"
    ]
  }
}
```

**Merging Rules:**

**IMPORTANT:** Permissions in skill frontmatter are **PROJECT-SCOPED**, not skill-scoped. They are merged into the global `.claude/settings.json` and apply to the entire project, not just when the skill is active.

**Merging Algorithm:**

1. **Start with existing permissions:**
   - If `.claude/settings.json` exists, load current `permissions.allow` and `permissions.deny` arrays
   - If it doesn't exist, start with empty arrays: `{"permissions": {"allow": [], "deny": []}}`

2. **Merge `allow` patterns:**
   - Append all `permissions.allow` entries from skill frontmatter to existing `allow` array
   - Remove duplicate patterns (exact string match)
   - Result: `allow = deduplicate(existing_allow + skill_allow)`

3. **Merge `deny` patterns:**
   - Append all `permissions.deny` entries from skill frontmatter to existing `deny` array
   - Remove duplicate patterns (exact string match)
   - Result: `deny = deduplicate(existing_deny + skill_deny)`

4. **No removal/replacement:**
   - Skills ONLY ADD permissions, they never remove existing ones
   - To remove permissions, manually edit `.claude/settings.json`

**Conflict Resolution:**
- At runtime, `deny` patterns take precedence over `allow` patterns
- If a pattern matches both `allow` and `deny`, access is **denied**
- Example: `allow: ["Read(**)"]` + `deny: ["Read(.env)"]` = can read all files except .env

**Example Merge Scenario:**

**Initial State** (`.claude/settings.json`):
```json
{
  "permissions": {
    "allow": ["Read(**/*.ts)"],
    "deny": []
  }
}
```

**Skill A Added** (`permissions.allow: ["Write(src/**)"]`):
```json
{
  "permissions": {
    "allow": ["Read(**/*.ts)", "Write(src/**)"],
    "deny": []
  }
}
```

**Skill B Added** (`permissions.deny: ["Write(src/critical/**)"]`):
```json
{
  "permissions": {
    "allow": ["Read(**/*.ts)", "Write(src/**)"],
    "deny": ["Write(src/critical/**)"]
  }
}
```

**Result:** Can write to `src/**` EXCEPT `src/critical/**` (deny wins).

**Common Pitfalls:**

1. **Permission Accumulation:**
   - Adding `permissions` to multiple skills will accumulate ALL permissions in project settings.json
   - This can unintentionally grant broad access; review settings.json periodically

2. **No Skill-Scoped Permissions:**
   - Permissions apply PROJECT-WIDE, not just when the skill is active
   - A restrictive skill cannot override more permissive project settings
   - Consider creating separate projects for different security contexts

3. **Manual Cleanup Required:**
   - Removing a skill does NOT remove its permissions from settings.json
   - Must manually edit settings.json to revoke accumulated permissions

4. **Deny-Allow Interactions:**
   - `allow: ["Bash(*)"]` + `deny: ["Bash(rm *)"]` = allows all bash EXCEPT rm commands
   - Overly broad `allow` patterns may need specific `deny` patterns to restrict

### 1.5 Example Transformation

**Input (Superset Format):**

```yaml
---
name: security-review
description: USE WHEN reviewing code for security vulnerabilities
version: "1.0.0"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(npm audit)
model: opus
context: fork
permissions:
  allow:
    - Read(**/*.ts)
    - Read(**/*.js)
  deny:
    - Read(.env)
    - Read(secrets/**)
# Windsurf fields (ignored)
trigger: model_decision
globs: ["**/*.ts", "**/*.js"]
labels: [security, review]
# Copilot fields (ignored)
applyTo: ["**/*.ts", "**/*.js"]
mode: agent
# Meta fields (processed)
platforms: [claude-code, windsurf, github-copilot]
---

# Security Review

Perform security analysis of the codebase...
```

**Output (Claude Code):**

**File:** `.claude/skills/security-review/SKILL.md`

```yaml
---
name: security-review
description: USE WHEN reviewing code for security vulnerabilities
version: "1.0.0"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(npm audit)
model: opus
context: fork
---

# Security Review

Perform security analysis of the codebase...
```

**File:** `.claude/settings.json` (merged)

```json
{
  "permissions": {
    "allow": [
      "Read(**/*.ts)",
      "Read(**/*.js)"
    ],
    "deny": [
      "Read(.env)",
      "Read(secrets/**)"
    ]
  }
}
```

---

## 2. Windsurf Adapter

Windsurf has **fewer native features** than Claude Code, so this adapter uses **emulation patterns** extensively.

### 2.1 Field Mapping

| Superset Field | Windsurf Field | Transformation |
|----------------|----------------|----------------|
| `name` | *(filename)* | Filename becomes identifier |
| `description` | `description` | Direct copy |
| `version` | *(dropped or comment)* | No native field; add as comment |
| `allowed-tools` | *(emulated)* | Convert to explicit instructions |
| `model` | *(model selection)* | Platform setting |
| `context` | *(emulated)* | Sequential workflow markers |
| `agent` | *(emulated)* | Persona rules |
| `permissions.allow` | *(emulated)* | Explicit rule instructions |
| `permissions.deny` | *(emulated)* | Explicit rule warnings |
| `trigger` | `trigger` | Direct copy |
| `globs` | `globs` | Direct copy (required for `trigger: glob`) |
| `labels` | `labels` | Direct copy as array |
| `alwaysApply` | `alwaysApply` | Direct copy as boolean |
| `author` | `author` | Direct copy |
| `applyTo` | `globs` | Convert to glob patterns (if `trigger: glob`) |
| `excludeAgent` | *(dropped)* | Not supported |
| `mode` | *(dropped)* | Not applicable |
| `platforms` | *(dropped)* | Meta-field |
| `compatibility` | *(dropped)* | Meta-field |
| `emulation` | *(applied)* | Patterns injected into body |

### 2.2 Emulation Patterns

**See Also:** [WORKAROUND-PATTERNS.md](WORKAROUND-PATTERNS.md) - Detailed skill emulation pattern with complete examples

#### 2.2.1 allowed-tools to Explicit Instructions

**Pattern:** Convert tool restrictions to explicit AI instructions (not enforced)

**Input:**
```yaml
allowed-tools:
  - Read
  - Grep
  - Bash(git *)
```

**Emulated Output (injected at top of body):**

```markdown
## Tool Restrictions (Advisory)

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by the platform.

**Allowed Operations:**
- Read files
- Search file contents (grep)
- Git commands only (`git *`)

**Forbidden Operations:**
- Writing or editing files
- Non-git shell commands
- File creation

**IMPORTANT:** Before using any tool not listed above, STOP and ask for user confirmation.
```

#### 2.2.2 context: fork to Sequential Workflow Markers

**Pattern:** Emulate subagent isolation with explicit context boundaries

**Input:**
```yaml
context: fork
```

**Emulated Output:**

```markdown
## Execution Context

This workflow simulates isolated subagent execution.

### Context Isolation Protocol

When executing this workflow:

1. **BEGIN ISOLATED CONTEXT** - Treat this as a fresh session
2. Do NOT reference prior conversation history
3. Do NOT make assumptions from previous context
4. Complete ALL steps within this workflow before responding to other requests
5. **END ISOLATED CONTEXT** - Resume normal session after completion

---

[CONTEXT: Isolated Execution - Act as if this is a fresh conversation]

{original workflow content}

[END CONTEXT: Return to normal session state]
```

#### 2.2.3 agent: to Persona Rules

**Pattern:** Convert custom agent references to manual persona activation

**Input:**
```yaml
agent: security-reviewer
```

**Emulated Output:**

Creates a companion rule file `.windsurf/rules/agent-{agent-name}.md`:

```yaml
---
trigger: manual
description: Activate security-reviewer persona with @rules:agent-security-reviewer
---

# Security Reviewer Persona

When @rules:agent-security-reviewer is active, adopt this persona:

## Role
You are a specialized security review agent.

## Behavioral Guidelines
{content from referenced agent file}

## Activation
User invokes with: `@rules:agent-security-reviewer`

## Deactivation
Returns to default Cascade behavior when user starts new topic.

> **NOTE:** Tool restrictions cannot be enforced in Windsurf. Rely on AI compliance.
```

**Workflow Reference:**
```markdown
## Agent Persona

This workflow uses the **security-reviewer** agent.
Activate with: `@rules:agent-security-reviewer` before running this workflow.
```

#### 2.2.4 permissions to Glob Trigger Rules with Warnings

**Pattern:** Convert permission patterns to advisory rules

**Input:**
```yaml
permissions:
  allow:
    - Read(**/*.ts)
    - Write(src/**/*.ts)
  deny:
    - Read(.env)
    - Write(config/production.json)
```

**Emulated Output (companion rule file):**

Creates `.windsurf/rules/permissions-{skill-name}.md`:

```yaml
---
trigger: glob
globs: [".env", "config/production.json", "secrets/**/*"]
description: Security warning for restricted files
---

# SECURITY WARNING - Restricted File Access

You are accessing a file that has ACCESS RESTRICTIONS in this project.

## Restricted Patterns

**FORBIDDEN - Do NOT access these files:**
- `.env` - Environment secrets
- `config/production.json` - Production configuration
- `secrets/**/*` - All files in secrets directory

## Required Actions

1. **STOP** - Do not read or modify this file
2. **WARN** - Alert the user about the attempted access
3. **ASK** - Request explicit permission if access is truly needed

> **WARNING:** These restrictions are NOT technically enforced.
> Violating them may expose secrets or corrupt production configurations.
```

**Main Workflow Addition:**
```markdown
## Access Permissions (Advisory)

This workflow has the following access restrictions:

**Allowed:**
- Read TypeScript files (`**/*.ts`)
- Write to source directory (`src/**/*.ts`)

**Forbidden:**
- Environment files (`.env`)
- Production config (`config/production.json`)

See `@rules:permissions-{skill-name}` for enforcement details.
```

### 2.3 Dropped Fields

**Claude Code-Only Fields:**
- `allowed-tools` - Converted to advisory instructions
- `model` - May be available in Windsurf settings
- `context` - Emulated with markers (no true isolation)
- `agent` - Emulated via persona rules
- `permissions` - Converted to advisory rules

**Emulation Notes:**
| Dropped Field | Emulation Strategy | Limitations |
|---------------|-------------------|-------------|
| `allowed-tools` | Explicit instructions | Not enforced |
| `context: fork` | Sequential markers | No true isolation |
| `agent` | Persona rules | Manual activation |
| `permissions` | Glob trigger warnings | Advisory only |
| `hooks` | Workflow step instructions | No automatic execution |

#### Lifecycle Hooks Emulation

**Problem:** Windsurf does not have lifecycle hooks like Claude Code's PreToolUse, PostToolUse, Stop events.

**Emulation Strategy:**

When `hooks` field is present in superset template, convert hook logic to explicit workflow steps:

**Input (Superset with hooks):**
```yaml
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "npm run lint"
  Stop:
    - hooks:
        - type: command
          command: "npm test"
```

**Output (Windsurf workflow with manual steps):**
```markdown
# {Skill Name}

## Pre-Execution Checks

**IMPORTANT:** Before making any file changes, run:
```bash
npm run lint
```

## Main Workflow

{Main skill content}

## Post-Execution Validation

**IMPORTANT:** After completing work, run:
```bash
npm test
```

Ensure all tests pass before considering the task complete.
```

**Limitations:**
- Not automatically enforced
- Relies on AI following instructions
- No hooks for tool-level events
- User must manually verify execution

### 2.4 Output Structure

```
.windsurf/
+-- workflows/
|   +-- {name}.md                 # Main workflow file
|
+-- rules/
|   +-- agent-{agent-name}.md     # Emulated agent persona (if agent: used)
|   +-- permissions-{name}.md     # Emulated permissions (if permissions: used)
```

### 2.5 Character Limit Handling

**Limit:** 12,000 characters per file

**Strategy:**

1. **Check Length:** After transformation, measure total character count
2. **If Under Limit:** Output as single file
3. **If Over Limit:** Split into chunks

**Chunking Process:**

```
.windsurf/
+-- workflows/
    +-- {name}.md                 # Main entry (under limit)
    +-- {name}-part-2.md          # Continuation
    +-- {name}-part-3.md          # Additional parts as needed
```

**Main File (chunked):**
```yaml
---
description: {description} (Part 1 of N)
trigger: manual
labels: {labels}
---

# {Name} - Part 1

{First ~10,000 characters of content}

---

## Continuation

This workflow continues in additional parts:
- Part 2: `/workflow {name}-part-2`
- Part 3: `/workflow {name}-part-3`

Run parts sequentially for complete workflow execution.
```

**Splitting Algorithm:**
1. Split at markdown heading boundaries (`##` or `###`)
2. Keep logical sections together
3. Each chunk must be self-contained enough to execute
4. Add navigation links between chunks

### 2.6 Example Transformation

**Input (Superset Format):**

```yaml
---
name: deploy-production
description: Deploy application to production environment
version: "2.0.0"
allowed-tools:
  - Bash(npm run build)
  - Bash(docker *)
  - Bash(kubectl *)
context: fork
agent: deployment-specialist
permissions:
  allow:
    - Read(src/**)
    - Read(config/**)
  deny:
    - Write(.env.production)
trigger: manual
labels: [deployment, production, automation]
platforms: [claude-code, windsurf]
---

# Production Deployment

## Prerequisites
- Ensure all tests pass
- Verify staging deployment successful

## Deployment Steps
1. Build production bundle
2. Build Docker image
3. Push to registry
4. Deploy to Kubernetes

## Verification
- Check pod status
- Verify health endpoints
```

**Output (Windsurf):**

**File:** `.windsurf/workflows/deploy-production.md`

```yaml
---
description: Deploy application to production environment
trigger: manual
labels:
  - deployment
  - production
  - automation
---

# Production Deployment

<!-- Version: 2.0.0 -->

## Agent Persona

This workflow uses the **deployment-specialist** agent.
Activate with: `@rules:agent-deployment-specialist` before running this workflow.

## Tool Restrictions (Advisory)

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced.

**Allowed Operations:**
- Build commands (`npm run build`)
- Docker commands (`docker *`)
- Kubernetes commands (`kubectl *`)

**Forbidden Operations:**
- Direct file editing
- Non-deployment shell commands

## Access Permissions (Advisory)

**Allowed:**
- Read source files (`src/**`)
- Read configuration (`config/**`)

**Forbidden:**
- Write to production environment file (`.env.production`)

---

## Execution Context

[CONTEXT: Isolated Execution - Treat as fresh session]

## Prerequisites
- Ensure all tests pass
- Verify staging deployment successful

## Deployment Steps
1. Build production bundle
2. Build Docker image
3. Push to registry
4. Deploy to Kubernetes

## Verification
- Check pod status
- Verify health endpoints

[END CONTEXT: Return to normal session]
```

**File:** `.windsurf/rules/agent-deployment-specialist.md`

```yaml
---
trigger: manual
description: Activate deployment-specialist persona with @rules:agent-deployment-specialist
---

# Deployment Specialist Persona

When @rules:agent-deployment-specialist is active:

## Role
You are a specialized deployment automation agent focused on safe, reliable production deployments.

## Behavioral Guidelines
- Always verify prerequisites before deployment
- Use rolling deployments to minimize downtime
- Monitor deployment progress and rollback on failures
- Never deploy without proper testing

## Activation
User invokes with: `@rules:agent-deployment-specialist`

> **NOTE:** Tool restrictions cannot be enforced. Rely on AI compliance.
```

**File:** `.windsurf/rules/permissions-deploy-production.md`

```yaml
---
trigger: glob
globs: [".env.production"]
description: Security warning for production environment file
---

# SECURITY WARNING - Production Environment File

You are accessing `.env.production` which has WRITE RESTRICTIONS.

## Required Actions

1. **STOP** - Do not modify this file
2. **WARN** - Alert the user
3. **ASK** - Request explicit permission if modification is truly needed

> **WARNING:** Modifying production environment without proper review may cause outages.
```

---

## 3. GitHub Copilot Adapter

GitHub Copilot has the **most restrictive constraints** (working set limits, context limits), so this adapter focuses on optimization and warnings.

### 3.1 Field Mapping

| Superset Field | Copilot Field | Transformation |
|----------------|---------------|----------------|
| `name` | *(filename)* | Filename becomes identifier |
| `description` | `description` | Direct copy |
| `version` | *(comment)* | Add as comment in body |
| `allowed-tools` | *(emulated)* | Convert to explicit instructions |
| `model` | `model` | Pro+ only; add compatibility note |
| `context` | *(emulated)* | Sequential batch notes |
| `agent` | *(inline)* | Inline persona in prompt body |
| `permissions.allow` | *(emulated)* | Convert to instructions |
| `permissions.deny` | *(emulated)* | Convert to warnings |
| `trigger` | *(emulated)* | Manual invocation pattern |
| `globs` | `applyTo` | Convert to applyTo patterns |
| `labels` | *(dropped)* | Not supported |
| `alwaysApply` | *(dropped)* | Use copilot-instructions.md instead |
| `author` | *(comment)* | Add as comment |
| `applyTo` | `applyTo` | Direct copy (normalize string to array) |
| `excludeAgent` | `excludeAgent` | Direct copy (normalize string to array) |
| `mode` | `mode` | Direct copy (`agent`, `ask`, `edit`) |
| `platforms` | *(dropped)* | Meta-field |
| `compatibility` | *(dropped)* | Meta-field |
| `emulation` | *(applied)* | Patterns injected into body |

### 3.2 Emulation Patterns

#### 3.2.1 allowed-tools to Explicit Instructions

**Pattern:** Similar to Windsurf, convert to advisory instructions

**Input:**
```yaml
allowed-tools:
  - Read
  - Write(src/**)
  - Bash(npm test)
```

**Emulated Output:**

```markdown
## Operational Constraints

**This prompt has the following tool restrictions:**

Allowed:
- Read any file
- Write to source directory only (`src/**`)
- Run tests (`npm test`)

Not Allowed:
- Write outside source directory
- Run arbitrary shell commands
- Delete files

Please adhere to these constraints throughout execution.
```

#### 3.2.2 context: fork to Sequential Batch Notes

**Pattern:** Document batch execution for large tasks

**Input:**
```yaml
context: fork
```

**Emulated Output:**

```markdown
## Batch Execution Protocol

This prompt may require multiple execution batches due to working set limits.

### Execution Guidelines

1. **Batch Size:** Process maximum 10 files per batch
2. **Checkpoints:** Create checkpoint commits between batches
3. **Context Preservation:** Document progress in `PROGRESS.md`
4. **Resumption:** Use `PROGRESS.md` to resume if interrupted

### Batch Template

For each batch:
1. Identify next 10 files to process
2. Make changes
3. Commit with message: `batch N: description`
4. Update `PROGRESS.md`
5. Continue to next batch
```

#### 3.2.3 Windsurf Triggers to applyTo Patterns

**Pattern:** Convert Windsurf glob triggers to Copilot applyTo

**Input:**
```yaml
trigger: glob
globs:
  - "**/*.py"
  - "tests/**/*.py"
```

**Emulated Output:**

```yaml
applyTo:
  - "**/*.py"
  - "tests/**/*.py"
```

#### 3.2.4 agent: to Inline Persona

**Pattern:** Inline agent personality into prompt body (no separate files)

**Input:**
```yaml
agent: code-reviewer
```

**Emulated Output:**

```markdown
## Agent Persona: Code Reviewer

For this task, adopt the following persona:

**Role:** Expert code reviewer focused on quality and maintainability

**Approach:**
- Examine code for bugs, security issues, and anti-patterns
- Provide specific, actionable feedback
- Reference line numbers and file paths
- Suggest concrete improvements

**Tone:**
- Constructive and professional
- Educational where appropriate
- Prioritize issues by severity

---

{Original prompt content follows}
```

### 3.3 Dropped Fields

**Windsurf-Only Fields:**
- `trigger` - Use manual invocation or convert to `applyTo`
- `labels` - Not supported
- `alwaysApply` - Use copilot-instructions.md for always-on content
- `author` - Add as comment if needed

**Emulation Notes:**
| Dropped Field | Emulation Strategy | Limitations |
|---------------|-------------------|-------------|
| `trigger` | Manual or applyTo | No AI-driven activation |
| `labels` | *(none)* | No categorization |
| `alwaysApply` | Use instructions file | Different mechanism |
| `allowed-tools` | Explicit instructions | Not enforced |
| `context: fork` | Batch notes | No true isolation |
| `hooks` | Workflow step instructions | No automatic execution |

#### 3.3.1 Lifecycle Hooks Emulation

**Problem:** GitHub Copilot does not have lifecycle hooks like Claude Code's PreToolUse, PostToolUse, Stop events.

**Emulation Strategy:**

When `hooks` field is present in superset template, convert hook logic to explicit prompt instructions:

**Input (Superset with hooks):**
```yaml
hooks:
  PreToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "npm run lint"
  Stop:
    - hooks:
        - type: command
          command: "git diff --check"
```

**Output (GitHub Copilot prompt with manual steps):**
```markdown
# {Skill Name}

{Main content}

## Pre-Change Validation

Before modifying any files, execute:
```bash
npm run lint
```

Address any linting errors before proceeding.

## Post-Completion Checklist

After completing all changes, verify:

1. Run: `git diff --check`
2. Ensure no whitespace errors
3. Confirm all modifications are intentional

```

**Limitations:**
- Not automatically enforced
- Relies on user/AI following instructions
- No event-driven execution
- Manual verification required

### 3.4 Output Structure

```
.github/
+-- prompts/
|   +-- {name}.prompt.md          # Main prompt file
|
+-- instructions/
|   +-- {name}.instructions.md    # Path-specific instructions (if applyTo used)
|
+-- copilot-instructions.md       # Always-on instructions (if alwaysApply: true)
```

### 3.5 Working Set Limit Warnings

**Limits:**
- Maximum 10 files in working set
- Maximum 20 files in context
- ~6,000 character context window
- Quality degrades >782 lines per file

**Warning Injection:**

When template references more than 10 files or complex operations:

```markdown
## Working Set Advisory

> **WARNING:** GitHub Copilot has a 10-file working set limit.

This prompt may reference more files than Copilot can handle simultaneously.

**Recommended Approach:**

1. Process files in batches of 10 or fewer
2. Use explicit file lists rather than broad patterns
3. Complete one batch before starting the next

**File Batching Example:**
```
Batch 1: src/auth/*.ts (5 files)
Batch 2: src/api/*.ts (5 files)
Batch 3: tests/auth/*.test.ts (5 files)
```

See [GitHub Copilot Limits](https://docs.github.com/copilot) for details.
```

**Context Window Warning:**

When body exceeds ~4,000 characters:

```markdown
> **NOTE:** This prompt approaches Copilot's ~6,000 character context limit.
> Consider breaking into smaller focused prompts for better results.
```

### 3.6 Example Transformation

**Input (Superset Format):**

```yaml
---
name: typescript-refactor
description: Refactor TypeScript codebase for better modularity
version: "1.0.0"
allowed-tools:
  - Read
  - Write
  - Edit
context: fork
agent: refactoring-specialist
trigger: manual
globs:
  - "**/*.ts"
  - "**/*.tsx"
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
mode: agent
platforms: [claude-code, windsurf, github-copilot]
---

# TypeScript Refactoring

## Goals
- Improve code modularity
- Extract reusable components
- Reduce code duplication

## Steps
1. Analyze current structure
2. Identify extraction candidates
3. Create new modules
4. Update imports
5. Verify tests pass
```

**Output (GitHub Copilot):**

**File:** `.github/prompts/typescript-refactor.prompt.md`

```yaml
---
description: Refactor TypeScript codebase for better modularity
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
mode: agent
---

# TypeScript Refactoring

<!-- Version: 1.0.0 -->
<!-- Author: Generated from cross-platform template -->

## Agent Persona: Refactoring Specialist

For this task, adopt the following persona:

**Role:** Expert code refactoring specialist focused on modularity and clean architecture

**Approach:**
- Analyze code structure before making changes
- Make incremental, testable changes
- Preserve existing functionality
- Document significant architectural decisions

---

## Operational Constraints

**This prompt has the following tool restrictions:**

Allowed:
- Read any TypeScript file
- Write/Edit TypeScript files

Please adhere to these constraints throughout execution.

---

## Working Set Advisory

> **WARNING:** GitHub Copilot has a 10-file working set limit.

For large refactoring tasks:
1. Process files in batches of 10 or fewer
2. Complete one module extraction before starting the next
3. Commit between batches

---

## Batch Execution Protocol

This refactoring may require multiple execution batches.

### Execution Guidelines

1. **Batch Size:** Process maximum 10 files per batch
2. **Checkpoints:** Create checkpoint commits between batches
3. **Resumption:** Document progress for interrupted sessions

---

## Goals
- Improve code modularity
- Extract reusable components
- Reduce code duplication

## Steps
1. Analyze current structure
2. Identify extraction candidates
3. Create new modules
4. Update imports
5. Verify tests pass
```

**File:** `.github/instructions/typescript.instructions.md`

```yaml
---
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript Development Instructions

When working with TypeScript files, apply refactoring best practices:

- Improve code modularity
- Extract reusable components
- Reduce code duplication
```

---

## 4. Transformation Rules

### 4.1 Field Precedence

When multiple values could apply, use this precedence order:

1. **Platform-specific override** (highest priority)
2. **Superset standard field**
3. **Emulated/converted value**
4. **Default value** (lowest priority)

**Example:**
```yaml
# Superset template
model: sonnet                    # Standard field
# If windsurf.model exists in platform config, it overrides
```

### 4.2 Conditional Inclusion

Use the `platforms` field to determine which platforms receive output:

```yaml
platforms:
  - claude-code
  - windsurf
  # github-copilot NOT listed = no output generated for Copilot
```

**Algorithm:**
```
for each target_platform in [claude-code, windsurf, github-copilot]:
    if platforms is not defined OR target_platform in platforms:
        generate_output(template, target_platform)
    else:
        skip_platform(target_platform)
```

### 4.3 Warning Generation

Generate warnings for:

1. **Unsupported Features:** When a feature doesn't exist on target platform
2. **Degraded Features:** When emulation is imperfect
3. **Limit Violations:** When content exceeds platform limits
4. **Security Concerns:** When permission emulation is advisory-only

**Warning Format:**

```markdown
> **WARNING [{CATEGORY}]:** {message}
>
> {details}
```

**Warning Categories:**
- `UNSUPPORTED` - Feature doesn't exist
- `EMULATED` - Feature is approximated
- `LIMIT` - Platform constraint exceeded
- `SECURITY` - Advisory-only restriction
- `DEGRADED` - Reduced functionality

### 4.4 Compatibility Notes Injection

When `compatibility` field exists, inject relevant notes:

```yaml
compatibility:
  windsurf:
    status: partial
    notes: "Subagent spawning emulated via sequential workflows"
```

**Injected (Windsurf output):**

```markdown
## Platform Compatibility Note

> **NOTE [COMPATIBILITY]:** This template has partial support on Windsurf.
> Subagent spawning emulated via sequential workflows.
```

### 4.5 Transformation Pipeline

```
                    +-------------------+
                    |  Superset Template |
                    +-------------------+
                             |
                             v
                    +-------------------+
                    |  Parse Frontmatter |
                    +-------------------+
                             |
                             v
                    +-------------------+
                    | Check `platforms` |
                    +-------------------+
                             |
              +--------------+--------------+
              |              |              |
              v              v              v
     +----------------+ +----------------+ +----------------+
     | Claude Adapter | | Windsurf Adapter| | Copilot Adapter|
     +----------------+ +----------------+ +----------------+
              |              |              |
              v              v              v
     +----------------+ +----------------+ +----------------+
     | Map Fields     | | Map Fields     | | Map Fields     |
     | Drop Unused    | | Apply Emulation| | Apply Emulation|
     +----------------+ +----------------+ +----------------+
              |              |              |
              v              v              v
     +----------------+ +----------------+ +----------------+
     | Generate       | | Check Limits   | | Check Limits   |
     | settings.json  | | Chunk if >12K  | | Add Warnings   |
     +----------------+ +----------------+ +----------------+
              |              |              |
              v              v              v
     +----------------+ +----------------+ +----------------+
     | Output:        | | Output:        | | Output:        |
     | .claude/skills/| | .windsurf/     | | .github/prompts|
     +----------------+ +----------------+ +----------------+
```

---

## 5. Complete Transformation Example

This section demonstrates transforming a complex template to all three platforms.

### 5.1 Input: Superset Template

**File:** `.ai-templates/skills/full-stack-review/SKILL.md`

```yaml
---
# ============================================
# CORE FIELDS (Universal)
# ============================================
name: full-stack-review
description: >
  USE WHEN performing comprehensive code review. Reviews frontend React
  components, backend Node.js APIs, and database interactions for security,
  performance, and maintainability issues.
version: "2.1.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(npm audit)
  - Bash(npm run lint)
  - Bash(npm test)
model: opus
context: fork
agent: senior-reviewer
permissions:
  allow:
    - Read(**/*.ts)
    - Read(**/*.tsx)
    - Read(**/*.js)
    - Read(package.json)
    - Read(package-lock.json)
  deny:
    - Read(.env)
    - Read(.env.*)
    - Read(secrets/**)
    - Write(**)

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: model_decision
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
labels:
  - code-review
  - security
  - full-stack
alwaysApply: false
author: "Engineering Team <eng@example.com>"

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
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
    notes: "Full feature support with subagent isolation"
  windsurf:
    status: partial
    notes: "No subagent isolation; permissions are advisory only"
  github-copilot:
    status: partial
    notes: "Limited to 10 files per review batch"

emulation:
  subagents:
    pattern: sequential-workflow
    fallback: "Execute review phases sequentially"
    limitations:
      - "No parallel execution"
      - "Context pollution risk"
  permissions:
    pattern: explicit-rules
    fallback: "Document restrictions as instructions"
    limitations:
      - "Not enforced by platform"
---

# Full Stack Code Review

Perform a comprehensive review of the full-stack application.

## Review Phases

### Phase 1: Security Analysis
- Check for injection vulnerabilities
- Review authentication flows
- Audit authorization logic
- Scan for exposed secrets

### Phase 2: Frontend Review
- React component best practices
- State management patterns
- Performance optimizations
- Accessibility compliance

### Phase 3: Backend Review
- API design patterns
- Error handling
- Database query efficiency
- Input validation

### Phase 4: Dependency Audit
- Run `npm audit` for vulnerabilities
- Check for outdated packages
- Review license compliance

## Output Format

Create `REVIEW-REPORT.md` with:
- Executive summary
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (nice to have)
- Metrics and scores
```

### 5.2 Output: Claude Code

**File:** `.claude/skills/full-stack-review/SKILL.md`

```yaml
---
name: full-stack-review
description: >
  USE WHEN performing comprehensive code review. Reviews frontend React
  components, backend Node.js APIs, and database interactions for security,
  performance, and maintainability issues.
version: "2.1.0"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(npm audit)
  - Bash(npm run lint)
  - Bash(npm test)
model: opus
context: fork
agent: senior-reviewer
---

# Full Stack Code Review

Perform a comprehensive review of the full-stack application.

## Review Phases

### Phase 1: Security Analysis
- Check for injection vulnerabilities
- Review authentication flows
- Audit authorization logic
- Scan for exposed secrets

### Phase 2: Frontend Review
- React component best practices
- State management patterns
- Performance optimizations
- Accessibility compliance

### Phase 3: Backend Review
- API design patterns
- Error handling
- Database query efficiency
- Input validation

### Phase 4: Dependency Audit
- Run `npm audit` for vulnerabilities
- Check for outdated packages
- Review license compliance

## Output Format

Create `REVIEW-REPORT.md` with:
- Executive summary
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (nice to have)
- Metrics and scores
```

**File:** `.claude/settings.json` (merged)

```json
{
  "permissions": {
    "allow": [
      "Read(**/*.ts)",
      "Read(**/*.tsx)",
      "Read(**/*.js)",
      "Read(package.json)",
      "Read(package-lock.json)"
    ],
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(secrets/**)",
      "Write(**)"
    ]
  }
}
```

**File:** `.claude/agents/senior-reviewer.md`

```yaml
---
name: senior-reviewer
description: Senior code reviewer with security focus
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Senior Reviewer Agent

You are a senior code reviewer with expertise in:
- Security vulnerability detection
- Performance optimization
- Clean code principles
- Full-stack architecture

## Review Approach
- Be thorough but constructive
- Prioritize issues by severity
- Provide specific remediation steps
- Include code examples when helpful
```

---

### 5.3 Output: Windsurf

**File:** `.windsurf/workflows/full-stack-review.md`

```yaml
---
description: >
  USE WHEN performing comprehensive code review. Reviews frontend React
  components, backend Node.js APIs, and database interactions for security,
  performance, and maintainability issues.
trigger: model_decision
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
labels:
  - code-review
  - security
  - full-stack
author: "Engineering Team <eng@example.com>"
---

# Full Stack Code Review

<!-- Version: 2.1.0 -->

## Platform Compatibility Note

> **NOTE [COMPATIBILITY]:** This template has partial support on Windsurf.
> No subagent isolation; permissions are advisory only.

---

## Agent Persona

This workflow uses the **senior-reviewer** agent.
Activate with: `@rules:agent-senior-reviewer` before running this workflow.

---

## Tool Restrictions (Advisory)

> **WARNING [SECURITY]:** These restrictions rely on AI compliance and are NOT enforced.

**Allowed Operations:**
- Read files
- Search file contents (grep/glob)
- Run `npm audit`
- Run `npm run lint`
- Run `npm test`

**Forbidden Operations:**
- Writing or editing ANY files
- Non-audit shell commands

**IMPORTANT:** Before using any tool not listed above, STOP and ask for user confirmation.

---

## Access Permissions (Advisory)

**Allowed:**
- Read TypeScript files (`**/*.ts`, `**/*.tsx`)
- Read JavaScript files (`**/*.js`)
- Read package files (`package.json`, `package-lock.json`)

**Forbidden:**
- Environment files (`.env`, `.env.*`)
- Secrets directory (`secrets/**`)
- Write to ANY files (`**`)

See `@rules:permissions-full-stack-review` for enforcement details.

---

## Execution Context

[CONTEXT: Isolated Execution - Treat as fresh session]

This workflow simulates isolated subagent execution. Complete ALL phases within this workflow before responding to other requests.

---

## Review Phases

### Phase 1: Security Analysis
[CONTEXT: Acting as security specialist]
- Check for injection vulnerabilities
- Review authentication flows
- Audit authorization logic
- Scan for exposed secrets
[END CONTEXT]

### Phase 2: Frontend Review
[CONTEXT: Acting as frontend specialist]
- React component best practices
- State management patterns
- Performance optimizations
- Accessibility compliance
[END CONTEXT]

### Phase 3: Backend Review
[CONTEXT: Acting as backend specialist]
- API design patterns
- Error handling
- Database query efficiency
- Input validation
[END CONTEXT]

### Phase 4: Dependency Audit
[CONTEXT: Acting as security auditor]
- Run `npm audit` for vulnerabilities
- Check for outdated packages
- Review license compliance
[END CONTEXT]

---

[END CONTEXT: Return to normal session]

## Output Format

Create `REVIEW-REPORT.md` with:
- Executive summary
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (nice to have)
- Metrics and scores
```

**File:** `.windsurf/rules/agent-senior-reviewer.md`

```yaml
---
trigger: manual
description: Activate senior-reviewer persona with @rules:agent-senior-reviewer
---

# Senior Reviewer Persona

When @rules:agent-senior-reviewer is active, adopt this persona:

## Role
You are a senior code reviewer with expertise in security vulnerability detection, performance optimization, clean code principles, and full-stack architecture.

## Behavioral Guidelines
- Be thorough but constructive
- Prioritize issues by severity
- Provide specific remediation steps
- Include code examples when helpful

## Focus Areas
- Security vulnerabilities
- Performance bottlenecks
- Code maintainability
- Best practice violations

## Activation
User invokes with: `@rules:agent-senior-reviewer`

## Deactivation
Returns to default Cascade behavior when user starts new topic.

> **NOTE:** Tool restrictions cannot be enforced in Windsurf. Rely on AI compliance.
```

**File:** `.windsurf/rules/permissions-full-stack-review.md`

```yaml
---
trigger: glob
globs:
  - ".env"
  - ".env.*"
  - "secrets/**/*"
description: Security warning for restricted files during code review
---

# SECURITY WARNING - Restricted File Access

You are accessing a file that has ACCESS RESTRICTIONS during code review.

## Restricted Patterns

**FORBIDDEN - Do NOT access these files:**
- `.env` - Environment secrets
- `.env.*` - Environment variants
- `secrets/**/*` - All files in secrets directory

## Required Actions

1. **STOP** - Do not read this file
2. **WARN** - Alert the user about the attempted access
3. **SKIP** - Continue review without accessing restricted files

> **WARNING:** These restrictions are NOT technically enforced.
> Accessing these files may expose secrets in review output.
```

---

### 5.4 Output: GitHub Copilot

**File:** `.github/prompts/full-stack-review.prompt.md`

```yaml
---
description: >
  USE WHEN performing comprehensive code review. Reviews frontend React
  components, backend Node.js APIs, and database interactions for security,
  performance, and maintainability issues.
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
excludeAgent:
  - coding-agent
mode: agent
---

# Full Stack Code Review

<!-- Version: 2.1.0 -->
<!-- Author: Engineering Team <eng@example.com> -->

## Platform Compatibility Note

> **NOTE [COMPATIBILITY]:** This template has partial support on GitHub Copilot.
> Limited to 10 files per review batch.

---

## Agent Persona: Senior Reviewer

For this task, adopt the following persona:

**Role:** Senior code reviewer with expertise in security vulnerability detection, performance optimization, clean code principles, and full-stack architecture.

**Approach:**
- Be thorough but constructive
- Prioritize issues by severity
- Provide specific remediation steps
- Include code examples when helpful

**Focus Areas:**
- Security vulnerabilities
- Performance bottlenecks
- Code maintainability
- Best practice violations

---

## Operational Constraints

> **WARNING [SECURITY]:** These restrictions are advisory and rely on AI compliance.

**Allowed Operations:**
- Read TypeScript files (`**/*.ts`, `**/*.tsx`)
- Read JavaScript files (`**/*.js`)
- Read package files (`package.json`, `package-lock.json`)
- Run `npm audit`
- Run `npm run lint`
- Run `npm test`

**Forbidden Operations:**
- Reading environment files (`.env`, `.env.*`)
- Reading secrets directory (`secrets/**`)
- Writing or editing ANY files

---

## Working Set Advisory

> **WARNING [LIMIT]:** GitHub Copilot has a 10-file working set limit.

This code review may reference more files than Copilot can handle simultaneously.

**Recommended Batch Approach:**

1. **Batch 1: Security-Critical Files** (max 10 files)
   - Authentication modules
   - Authorization logic
   - Input validation

2. **Batch 2: Frontend Components** (max 10 files)
   - React components
   - State management
   - UI utilities

3. **Batch 3: Backend APIs** (max 10 files)
   - API routes
   - Controllers
   - Database queries

4. **Batch 4: Remaining Files**
   - Utilities
   - Configuration
   - Tests

---

## Batch Execution Protocol

> **WARNING [EMULATED]:** Subagent isolation emulated via sequential batches.

### Execution Guidelines

1. **Batch Size:** Process maximum 10 files per phase
2. **Checkpoints:** Document findings after each phase
3. **Context Preservation:** Maintain running list of issues
4. **Completion:** Consolidate into final report

---

## Review Phases

### Phase 1: Security Analysis
- Check for injection vulnerabilities
- Review authentication flows
- Audit authorization logic
- Scan for exposed secrets

### Phase 2: Frontend Review
- React component best practices
- State management patterns
- Performance optimizations
- Accessibility compliance

### Phase 3: Backend Review
- API design patterns
- Error handling
- Database query efficiency
- Input validation

### Phase 4: Dependency Audit
- Run `npm audit` for vulnerabilities
- Check for outdated packages
- Review license compliance

---

## Output Format

Create `REVIEW-REPORT.md` with:
- Executive summary
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (nice to have)
- Metrics and scores
```

**File:** `.github/instructions/code-review.instructions.md`

```yaml
---
applyTo:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
---

# Code Review Standards

When reviewing code in this project:

## Security Checks
- Always check for injection vulnerabilities
- Verify authentication and authorization logic
- Scan for exposed secrets or credentials

## Quality Checks
- Follow React component best practices
- Ensure proper error handling
- Validate all inputs

## Restrictions
- Do NOT access `.env` or secrets files
- Do NOT modify files during review
```

---

## Summary

This document provides complete, deterministic transformation rules for converting superset templates to all three platforms:

| Platform | Transformation Complexity | Key Challenges |
|----------|--------------------------|----------------|
| **Claude Code** | Low | Mostly field dropping |
| **Windsurf** | Medium | Extensive emulation needed |
| **GitHub Copilot** | Medium-High | Limit warnings and batching |

**Key Patterns:**
1. Claude Code receives the most features natively
2. Windsurf requires persona rules and advisory restrictions
3. GitHub Copilot requires batching guidance and limit warnings

**All adapters follow:**
- Deterministic field mapping
- Consistent warning format
- Clear emulation documentation
- Platform-specific output locations

---

## 6. Security Considerations

### 6.1 Permission Enforcement Limitations

**CRITICAL:** Permission emulation varies significantly across platforms. Understanding these differences is essential for security-critical operations.

| Platform | Permission Enforcement | Risk Level |
|----------|----------------------|------------|
| **Claude Code** | **Enforced** - `allowed-tools` and `permissions` are runtime-enforced by the system | ✅ Low |
| **Windsurf** | **Advisory Only** - Emulated via markdown instructions; AI may ignore restrictions | ⚠️ High |
| **GitHub Copilot** | **Advisory Only** - Emulated via markdown instructions; AI may ignore restrictions | ⚠️ High |

**What This Means:**

- **Claude Code:** If a skill specifies `allowed-tools: [Read]`, the system will **prevent** Write/Bash/other tool usage. Permissions are hard-enforced.

- **Windsurf:** If emulation adds "## Tool Restrictions (Advisory)", the AI is **instructed** to follow them, but there is **no system enforcement**. The AI can still use restricted tools if prompted or if it determines it's necessary.

- **GitHub Copilot:** Same as Windsurf - advisory only, no system enforcement.

### 6.2 Security Recommendations

**For Security-Critical Operations:**

1. **Use Claude Code for enforced restrictions**
   - If a skill handles sensitive data (credentials, secrets, production systems)
   - If tool restrictions are required for safety (prevent `Bash(rm -rf *)`, etc.)
   - If permission boundaries must be guaranteed

2. **Treat Windsurf/Copilot permissions as guidance**
   - Do NOT rely on emulated permissions for security
   - Assume AI can access any tool/file unless you configure IDE-level restrictions
   - Review AI actions carefully when working with sensitive data

3. **Defense in Depth**
   - Use `.gitignore` to prevent accidental commits of sensitive files
   - Use file system permissions to restrict access at OS level
   - Configure IDE/workspace permissions where available
   - Employ code review for all AI-generated changes to sensitive areas

**Warning Injection:**

Platform adapters automatically inject security warnings for Windsurf and GitHub Copilot when `permissions` or `allowed-tools` are specified:

```markdown
## Security Notice

⚠️ **ADVISORY ONLY:** These restrictions are not enforced by Windsurf.
The AI is instructed to follow them, but system enforcement is not available.
For security-critical operations, use Claude Code which provides runtime enforcement.
```

### 6.3 Project Settings Impact (Claude Code)

**IMPORTANT:** When using the Claude Code adapter, permissions from skill frontmatter are merged into **project-level** `.claude/settings.json`, not scoped to individual skills.

**Security Implications:**

- Installing a skill with `permissions.allow: ["Bash(npm install)"]` grants this permission **globally** to the project
- Multiple skills accumulate permissions in `settings.json`
- Malicious or poorly-designed skills can grant unintended broad access
- Review `.claude/settings.json` periodically to audit accumulated permissions

**Best Practices:**

1. **Minimize skill permissions** - Only grant what's strictly necessary
2. **Audit settings.json** - Review project permissions after installing new skills
3. **Use skill `allowed-tools` instead** - Where possible, restrict tools rather than file patterns
4. **Manual cleanup** - Remove obsolete permissions from `settings.json` when uninstalling skills

**Example Risk Scenario:**

```yaml
# Skill A adds:
permissions:
  allow: ["Read(src/**)"]

# Skill B adds:
permissions:
  allow: ["Write(src/**)"]

# Result in settings.json:
{
  "permissions": {
    "allow": [
      "Read(src/**)",
      "Write(src/**)"  # Now ALL project sessions can write to src/
    ]
  }
}
```

Even if you only run Skill A, Skill B's permissions persist and apply globally.

### 6.4 Recommended Practices

1. **Review skill source** before installing - Check frontmatter for broad permissions
2. **Test in isolated environment** - Try new skills in throwaway projects first
3. **Use version control** - Commit before running untrusted skills
4. **Prefer narrow scopes** - `allowed-tools: [Read]` is safer than `permissions.allow: ["Read(**)"]`
5. **Document assumptions** - Comment security expectations in `settings.json`

---

## Sources

- STANDARD-SCHEMA.md
- STANDARD-STRUCTURE.md
- GAP-ANALYSIS.md
- TERMINOLOGY-MAPPING.md
- Official documentation from Claude Code, Windsurf, and GitHub Copilot
