# Cross-Platform Template Best Practices

**Version:** 1.0.0
**Last Updated:** 2026-01-13
**Purpose:** Patterns, best practices, and step-by-step tutorials for cross-platform template development

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Template Organization](#2-template-organization)
3. [Cross-Platform Patterns](#3-cross-platform-patterns)
4. [Semantic Construct Usage](#4-semantic-construct-usage)
5. [Testing Your Templates](#5-testing-your-templates)
6. [Tutorials](#6-tutorials)

---

## 1. Design Principles

### 1.1 Start with Standard Format, Convert to Platforms

Write templates once in the standard superset format and convert to platform-specific outputs. This approach ensures:

- **Single source of truth** - Changes propagate to all platforms
- **Feature completeness** - Standard format captures all platform capabilities
- **Reduced maintenance** - No need to maintain separate files per platform

**Recommended Workflow:**

```
Standard Template (.ai-templates/)
        |
        v
    aiw convert
        |
   +----+----+----+
   |    |    |    |
   v    v    v    v
Claude  Windsurf  GitHub
Code              Copilot
```

**Anti-pattern:** Writing platform-specific templates first, then trying to generalize.

### 1.2 Use Compatibility Field Proactively

Document platform differences upfront using the `compatibility` field:

```yaml
compatibility:
  claude-code:
    status: full
    notes: "Full feature support with isolated context and permissions"
  windsurf:
    status: partial
    notes: "No context isolation; permissions are advisory only"
  github-copilot:
    status: partial
    notes: "Limited to 10 files in working set"
```

**Status Values:**
- `full` - All features work natively
- `partial` - Some features emulated or missing
- `unsupported` - Template should not be used on this platform

**Why This Matters:** Teams can quickly assess which templates work best on their preferred platform, avoiding runtime surprises.

### 1.3 Prefer Portable Constructs When Possible

Some constructs work identically across all platforms. Prefer these when possible:

**Portable Constructs:**
- Markdown headers and lists
- Code blocks with language hints
- Tables for structured data
- Numbered steps for workflows
- Checklist format for progress tracking

**Platform-Specific Constructs (Use Sparingly):**
- `allowed-tools` (Claude Code only enforces)
- `trigger: model_decision` (Windsurf only)
- `context: fork` (Claude Code only)
- `@workspace` commands (GitHub Copilot only)

**Example - Portable vs Platform-Specific:**

```yaml
# Portable (works everywhere)
description: >
  USE WHEN reviewing code. Performs comprehensive code review
  for maintainability and security.

# Platform-specific (requires emulation)
allowed-tools:
  - Read
  - Grep
context: fork
```

### 1.4 Document Platform-Specific Behavior

When using platform-specific features, document the behavior differences:

```markdown
## Platform Notes

### Claude Code
Full feature support with enforced tool restrictions and isolated context.

### Windsurf
Tool restrictions are advisory only. Run in main Cascade session.
Activate agent persona manually with `@rules:agent-{name}`.

### GitHub Copilot
Limited to 10 files in working set. Process large operations in batches.
See coordinator prompt for multi-part execution guidance.
```

---

## 2. Template Organization

### 2.1 When to Use Skills vs Workflows

**Skills** are self-contained, reusable capabilities:
- Code review
- Test running
- Dependency auditing
- Security scanning

**Workflows** are multi-step processes that may invoke multiple skills:
- Release cycle (test -> build -> deploy -> verify)
- Onboarding (create accounts -> setup environment -> run tutorials)
- Large refactoring (analyze -> plan -> execute in phases -> verify)

**Decision Guide:**

| Characteristic | Use Skill | Use Workflow |
|----------------|-----------|--------------|
| Single focused task | Yes | No |
| Multiple distinct phases | No | Yes |
| Reusable across projects | Yes | Maybe |
| Requires coordination | No | Yes |
| Can run independently | Yes | Parts may depend on each other |

### 2.2 Naming Conventions for Discoverability

**Skill Names:**
- Use lowercase with hyphens: `code-review`, `test-runner`, `security-scan`
- Be specific: `react-component-refactor` not `refactor`
- Include domain when relevant: `api-performance-optimizer`

**Workflow Names:**
- Use action-oriented names: `deploy-production.workflow.md`
- Include scope: `release-cycle-major.workflow.md`
- Chain related workflows: `migrate-auth-part-1.workflow.md`

**File Naming:**

```
.ai-templates/
  skills/
    code-review/SKILL.md           # Standard: directory/SKILL.md
    test-runner/SKILL.md
    security-scan/SKILL.md
  workflows/
    deploy-production.workflow.md   # Standard: {name}.workflow.md
    release-cycle.workflow.md
```

### 2.3 Versioning Strategy

Use semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** - Breaking changes to inputs/outputs/behavior
- **MINOR** - New features, backward compatible
- **PATCH** - Bug fixes, documentation updates

```yaml
version: "2.1.0"
```

**Version Bump Guidelines:**

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Add new step | MINOR | 1.0.0 -> 1.1.0 |
| Change output format | MAJOR | 1.1.0 -> 2.0.0 |
| Fix typo in instructions | PATCH | 2.0.0 -> 2.0.1 |
| Add platform support | MINOR | 2.0.1 -> 2.1.0 |
| Remove required field | MAJOR | 2.1.0 -> 3.0.0 |

### 2.4 Directory Structure Recommendations

**Minimal Structure:**

```
.ai-templates/
  skills/
    my-skill/SKILL.md
```

**Full Structure:**

```
.ai-templates/
  skills/
    code-review/
      SKILL.md                    # Main skill definition
      assets/                     # Supporting files
        review-checklist.md
        severity-matrix.md
      CHUNKS/                     # Large content splits
        phase-1-static-analysis.md
        phase-2-security-review.md
    test-runner/
      SKILL.md
  workflows/
    deploy-production.workflow.md
    release-cycle.workflow.md
  agents/                         # Custom agent definitions
    security-specialist.md
    performance-expert.md
```

---

## 3. Cross-Platform Patterns

### Pattern 1: Skill Emulation for Windsurf

**Problem:** Windsurf lacks Claude Code's skills feature - reusable, composable AI instructions that can be invoked by name.

**Solution:** Emulate skills using Windsurf workflows with model decision triggers.

**Standard Format:**

```yaml
---
name: commit-helper
description: USE WHEN creating git commits. Helps write conventional commit messages.
version: "1.0.0"
allowed-tools:
  - Bash(git status)
  - Bash(git diff)
  - Bash(git add)
  - Bash(git commit)
context: inherit
---

# Commit Helper

## Process
1. Run `git status` to see changes
2. Run `git diff` to review modifications
3. Ask user for commit type (feat/fix/docs/etc)
4. Generate conventional commit message
5. Execute commit with user approval
```

**Windsurf Adaptation:**

```yaml
---
description: USE WHEN creating git commits. Helps write conventional commit messages.
trigger: model_decision
labels:
  - git
  - automation
---

# Commit Helper

<!-- Version: 1.0.0 -->
<!-- Adapted from Claude Code skill -->

## Tool Restrictions (Advisory)

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced.

**Allowed Operations:**
- Git status checks (`git status`)
- View changes (`git diff`)
- Stage files (`git add`)
- Create commits (`git commit`)

**Forbidden Operations:**
- File editing
- Non-git shell commands

## Process
1. Run `git status` to see changes
2. Run `git diff` to review modifications
3. Ask user for commit type (feat/fix/docs/etc)
4. Generate conventional commit message
5. Execute commit with user approval

## Invocation

Manual: `/commit-helper`
Auto: Activates when user mentions "commit" or "git commit"
```

**Key Transformations:**
- `name` becomes filename
- `allowed-tools` becomes advisory instructions
- `context` adds execution context notes
- `trigger: model_decision` enables auto-activation

**Limitations:**
- No true subagent isolation
- Permissions not enforced by platform
- Agent personas require manual `@rules:` activation

### Pattern 2: Workflow Emulation for Claude Code

**Problem:** Claude Code skills lack Windsurf's AI-driven activation and automatic multi-file context awareness.

**Solution:** Add explicit context gathering protocol and rich descriptions.

**Windsurf Format:**

```yaml
---
description: USE WHEN refactoring React components
trigger: model_decision
globs:
  - "src/components/**/*.tsx"
labels:
  - refactoring
  - react
---

# Refactor Components

## Steps
1. Analyze components for duplicate logic
2. Extract shared patterns
3. Update imports
4. Verify tests pass
```

**Claude Code Adaptation:**

```yaml
---
name: refactor-components
description: >
  USE WHEN refactoring React components for better modularity.
  Activate when user mentions: refactor components, improve structure,
  extract shared logic, split components, or modularize React code.
version: "1.0.0"
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
context: inherit
permissions:
  allow:
    - Read(src/components/**/*.tsx)
    - Write(src/components/**/*.tsx)
---

# Refactor Components

## Context Gathering Protocol

**IMPORTANT:** Before beginning analysis, gather comprehensive context:

### Step 0: Multi-File Context Acquisition

1. List all component files:
   ```
   Glob: src/components/**/*.tsx
   ```

2. Identify related hooks:
   ```
   Grep: pattern="export.*use[A-Z]" path="src/hooks/"
   ```

**Context Checklist:**
- [ ] All component files identified
- [ ] Related hooks discovered
- [ ] Shared types loaded

**Only proceed to analysis once context gathering is complete.**

## Steps
1. Analyze components for duplicate logic
2. Extract shared patterns
3. Update imports
4. Verify tests pass

## Activation Instructions

Invoke with `/refactor-components` when user mentions refactoring components.
```

**Key Transformations:**
- `trigger: model_decision` becomes rich description with trigger phrases
- `globs` becomes Step 0 context gathering
- Auto-activation becomes manual invocation with guidance

**Limitations:**
- User must manually invoke skill
- Context gathering is sequential, not automatic
- No model decision engine

### Pattern 3: Working Set Limitation for GitHub Copilot

**Problem:** GitHub Copilot has a 10-file working set limit, making large-scale operations difficult.

**Solution:** Decompose large skills into coordinated sub-skills with batch processing.

**Standard Format (Too Large):**

```yaml
---
name: refactor-authentication
description: Refactor authentication system across the entire codebase
version: "1.0.0"
---

# Authentication Refactor

## Scope
25 files across:
- src/auth/ (8 files)
- src/api/auth/ (6 files)
- src/middleware/ (3 files)
- src/models/ (4 files)
- src/services/ (4 files)
```

**GitHub Copilot Adaptation (Decomposed):**

**File 1: `.github/prompts/refactor-auth-coordinator.prompt.md`**

```yaml
---
description: Coordinate full authentication refactor (entry point)
mode: agent
---

# Authentication Refactor - Coordinator

## Overview

This refactor has been decomposed into 4 sequential parts to work within
the 10-file working set limit.

**Original Scope:** 25 files
**Copilot Limit:** 10 files per working set
**Solution:** 4 batched sub-tasks

## Execution Order

1. `/prompt refactor-auth-core` - Part 1 (8 files)
2. `/prompt refactor-auth-api` - Part 2 (7 files)
3. `/prompt refactor-auth-middleware` - Part 3 (4 files)
4. `/prompt refactor-auth-finalize` - Part 4 (9 files)

## Progress Tracking

- [ ] Part 1: Core module
- [ ] Part 2: API routes
- [ ] Part 3: Middleware
- [ ] Part 4: Models & services
```

**File 2: `.github/prompts/refactor-auth-core.prompt.md`**

```yaml
---
description: Refactor core authentication logic (Part 1 of 4)
applyTo:
  - "src/auth/*.ts"
mode: agent
---

# Authentication Refactor - Part 1: Core Logic

## Working Set (8 files)
1. src/auth/auth-service.ts
2. src/auth/jwt-handler.ts
3. src/auth/password-hash.ts
4. src/auth/session-manager.ts
5. src/auth/token-validator.ts
6. src/auth/auth-middleware.ts
7. src/auth/auth-types.ts
8. src/auth/auth-utils.ts

## Objectives
1. Standardize authentication patterns
2. Extract shared logic
3. Ensure consistent error handling

## Checkpoint
Create commit: `refactor(auth): part 1 - standardize core auth module`

## Next Steps
Proceed to Part 2: `/prompt refactor-auth-api`
```

**Key Transformations:**
- Large skill becomes coordinator + sub-prompts
- Each sub-prompt stays within 10-file limit
- Skill chaining with explicit next steps
- Checkpoint commits between parts

**Decision Tree:**

```
Start: Large Operation
        |
        v
Count affected files
        |
   +----+----+
   |         |
   v         v
<=10      >10 files
files         |
   |          v
   v     Can be split?
Single       |
prompt   +---+---+
         |       |
         v       v
        Yes     No
         |       |
         v       v
    Decompose  File
    into       Prioritization
    sub-skills (quality risk)
```

### Anti-Pattern: Platform-Specific Constructs Without Fallback

**Problem:** Templates that rely entirely on platform-specific features without providing alternatives.

**Bad Example:**

```yaml
---
name: parallel-analyzer
description: Analyze code in parallel using subagents
context: fork
agent: analysis-specialist
allowed-tools:
  - Task(analyzer)
  - Task(optimizer)
  - Task(security-checker)
---

# Parallel Analysis

Spawn three subagents to analyze code simultaneously.
```

**Why This Fails:**
- Windsurf cannot spawn parallel subagents
- GitHub Copilot has no subagent concept
- No fallback provided for sequential execution

**Good Example:**

```yaml
---
name: comprehensive-analyzer
description: Analyze code for quality, performance, and security
version: "1.0.0"
context: fork
agent: analysis-specialist

# Cross-platform fields
platforms:
  - claude-code
  - windsurf
  - github-copilot

compatibility:
  claude-code:
    status: full
    notes: "Parallel subagent execution supported"
  windsurf:
    status: partial
    notes: "Sequential execution with context markers"
  github-copilot:
    status: partial
    notes: "Sequential execution in batches"

emulation:
  subagents:
    pattern: sequential-workflow
    fallback: "Execute analysis phases sequentially"
---

# Comprehensive Analysis

## Execution Mode

**Claude Code:** Spawns parallel subagents for each analysis phase.
**Other Platforms:** Execute phases sequentially.

## Phase 1: Static Analysis
[Instructions...]

## Phase 2: Performance Analysis
[Instructions...]

## Phase 3: Security Analysis
[Instructions...]

## Sequential Fallback

If parallel execution is not available, run phases 1-3 in order.
Checkpoint after each phase before proceeding.
```

---

## 4. Semantic Construct Usage

### 4.1 When to Use Agent Spawning

**Use Agent Spawning When:**
- Task requires isolated context (fresh session)
- Task has specialized expertise requirements
- Tasks can run in parallel (Claude Code only)
- You want to prevent context pollution

**Avoid Agent Spawning When:**
- Task is simple and quick
- Context sharing is beneficial
- Target platform is Windsurf or GitHub Copilot (no true spawning)

**Example - Good Use of Agent Spawning:**

```yaml
context: fork
agent: security-specialist

# Body includes:
## Security Review

This task requires isolated context to prevent leaking sensitive information
from the main conversation. The security-specialist agent focuses exclusively
on vulnerability detection.
```

**Example - Unnecessary Agent Spawning:**

```yaml
context: fork
agent: helper

# Body includes:
## List Files

List all TypeScript files in the src directory.
```

Better as a simple skill without spawning.

### 4.2 Tool Call Best Practices

**Be Specific with Tool Restrictions:**

```yaml
# Good - specific tool patterns
allowed-tools:
  - Bash(npm test)
  - Bash(npm run lint)
  - Bash(git status)
  - Bash(git diff)
  - Read
  - Grep

# Bad - too permissive
allowed-tools:
  - Bash
```

**Match Tools to Task Requirements:**

| Task Type | Recommended Tools |
|-----------|-------------------|
| Read-only analysis | Read, Grep, Glob |
| Code modification | Read, Write, Edit |
| Testing | Bash(npm test), Read |
| Git operations | Bash(git *), Read |
| Multi-file refactor | Read, Write, Edit, Grep, Glob |

**Document Tool Usage in Body:**

```markdown
## Tools Used

This skill uses the following tools:
- **Grep** - Search for patterns across files
- **Read** - Examine specific file contents
- **Bash(npm test)** - Execute test suite

Do not use Write or Edit tools during analysis phase.
```

### 4.3 Context Switching Patterns

**Inherit Context (Default):**
- Skill runs in main conversation
- Access to prior conversation history
- Shared state with other skills

```yaml
context: inherit
```

**Fork Context (Isolated):**
- Fresh conversation state
- No access to prior history
- Clean execution environment

```yaml
context: fork
```

**Emulation for Non-Claude Platforms:**

```markdown
## Execution Context

[CONTEXT: Isolated Execution - Treat as fresh session]

{isolated instructions here}

[END CONTEXT: Return to normal session]
```

### 4.4 Working Set Management (GitHub Copilot)

**Respect the 10-File Limit:**

```markdown
## Working Set (9 files)

1. src/auth/auth-service.ts
2. src/auth/jwt-handler.ts
3. src/auth/password-hash.ts
4. src/auth/session-manager.ts
5. src/auth/token-validator.ts
6. src/auth/auth-middleware.ts
7. src/auth/auth-types.ts
8. src/auth/auth-utils.ts
9. tests/auth.test.ts

**Note:** Keeping 1 file buffer for temporary files during refactoring.
```

**Use File Prioritization:**

1. **Priority 1 (Always in Working Set):** Core files, shared types
2. **Priority 2 (Rotate as Needed):** Direct dependents
3. **Priority 3 (Process Last):** Peripheral files, tests

**When to Use @workspace:**

```markdown
## Discovery Phase

Use `@workspace` to search across the codebase:
- `@workspace find all files that import from src/auth/`
- `@workspace show authentication patterns`

@workspace can analyze across multiple batches of search results.

## Implementation Phase

Switch to batched prompts for actual modifications (10-file limit applies).
```

---

## 5. Testing Your Templates

### 5.1 Validation Workflow

**Step 1: YAML Validation**

Ensure frontmatter is valid YAML:

```bash
# Use a YAML linter
yamllint .ai-templates/skills/my-skill/SKILL.md
```

**Step 2: Schema Validation**

Verify required fields are present:

```yaml
# Required for Claude Code
name: required
description: recommended

# Required for Windsurf (trigger: glob)
globs: required-when-trigger-is-glob

# Required for cross-platform
platforms: recommended
```

**Step 3: Conversion Test**

```bash
# Convert and check for warnings
aiw convert .ai-templates/skills/my-skill/SKILL.md --to claude-code --debug
aiw convert .ai-templates/skills/my-skill/SKILL.md --to windsurf --debug
```

**Step 4: Dry Run**

```bash
aiw convert template.md --to claude-code --dry-run
```

### 5.2 Testing on Each Platform

**Claude Code Testing:**

1. Convert template: `aiw convert template.md --to claude-code`
2. Open project in VS Code with Claude extension
3. Invoke skill: `/my-skill`
4. Verify:
   - Skill loads correctly
   - Tool restrictions enforced
   - Context mode works as expected
   - Output matches expected format

**Windsurf Testing:**

1. Convert template: `aiw convert template.md --to windsurf`
2. Open project in Windsurf IDE
3. Trigger workflow:
   - Manual: `/my-workflow`
   - Model decision: Mention trigger keywords
4. Verify:
   - Workflow activates correctly
   - Advisory restrictions followed
   - Agent persona applies (if used)

**GitHub Copilot Testing:**

1. Convert template (when supported)
2. Open project in VS Code with Copilot
3. Invoke prompt: `/prompt my-prompt`
4. Verify:
   - Prompt loads correctly
   - Working set limit respected
   - Batch processing works (if applicable)

### 5.3 Common Pitfalls and How to Avoid Them

**Pitfall 1: Invalid YAML Frontmatter**

```yaml
# Wrong - unquoted string with colon
description: USE WHEN: doing something

# Correct - quoted string
description: "USE WHEN: doing something"

# Also correct - multiline
description: >
  USE WHEN doing something. Helps with specific task.
```

**Pitfall 2: Missing Context Gathering**

```yaml
# Wrong - assumes files are already in context
## Steps
1. Analyze all components
2. Extract shared logic
```

```yaml
# Correct - explicit context gathering
## Step 0: Context Gathering
1. Glob: src/components/**/*.tsx
2. Read each identified file

## Steps
1. Analyze all components (from Step 0 context)
2. Extract shared logic
```

**Pitfall 3: Exceeding Platform Limits**

```markdown
<!-- Wrong - too many files for Copilot -->
## Working Set (15 files)
...

<!-- Correct - respect limit, batch if needed -->
## Working Set (9 files)
...

## Additional Files (Process in Part 2)
...
```

**Pitfall 4: Platform-Specific Syntax in Portable Templates**

```markdown
<!-- Wrong - Windsurf-specific -->
Activate with @rules:agent-security

<!-- Correct - platform-agnostic -->
## Agent Activation

- **Windsurf:** `@rules:agent-security`
- **Claude Code:** Automatically applied via `agent:` field
- **Copilot:** Inline persona in prompt body
```

**Pitfall 5: Forgetting Advisory Warnings**

```markdown
<!-- Wrong - no warning about enforcement -->
## Allowed Tools
- Read
- Grep

<!-- Correct - clear advisory -->
## Tool Restrictions (Advisory)

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.

**Allowed:**
- Read
- Grep
```

---

## 6. Tutorials

### Tutorial A: Your First Cross-Platform Skill

Build a simple test runner skill that works on all three platforms.

#### Step 1: Create Standard Template

Create the directory structure:

```
.ai-templates/
  skills/
    test-runner/
      SKILL.md
```

Write the standard template (`.ai-templates/skills/test-runner/SKILL.md`):

```yaml
---
# ============================================
# CORE FIELDS (Universal)
# ============================================
name: test-runner
description: >
  USE WHEN running tests. Executes test suites and analyzes results.
  Activate when user mentions: run tests, test suite, check tests,
  execute tests, or verify tests pass.
version: "1.0.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Bash(npm test)
  - Bash(npm run test:*)
  - Read
  - Grep
model: claude-sonnet-4-5-20250929
context: inherit
permissions:
  allow:
    - Read(tests/**)
    - Read(src/**)
    - Bash(npm test*)
  deny:
    - Write(**)

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: model_decision
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
labels:
  - testing
  - automation
  - quality

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "**/*.test.ts"
  - "**/*.spec.ts"
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
    notes: "Full support with enforced tool restrictions"
  windsurf:
    status: full
    notes: "Advisory restrictions only"
  github-copilot:
    status: full
    notes: "Works within working set limits"
---

# Test Runner

Execute test suites and provide analysis of results.

## Process

### 1. Identify Tests
- Scan for test files matching `*.test.ts` or `*.spec.ts`
- List available test scripts in `package.json`
- Ask user which tests to run (all, unit, integration, specific)

### 2. Execute Tests
- Run selected test command
- Capture output including passes, failures, and errors
- Monitor for test timeouts or crashes

### 3. Analyze Results
- Parse test output
- Identify failing tests
- Extract error messages and stack traces
- Categorize failures (assertions, errors, timeouts)

### 4. Report Findings
- Summarize: X passed, Y failed out of Z total
- List failing tests with file locations
- Show error messages for failures
- Suggest next steps

## Output Format

```
TEST RESULTS
============
Status: [PASS|FAIL]
Passed: X/Z (XX%)
Failed: Y/Z (XX%)

FAILURES:
---------
1. tests/auth/login.test.ts:42
   Test: "should reject invalid credentials"
   Error: Expected status 401, received 500

NEXT STEPS:
-----------
- Fix specific issues identified above
```

## Invocation

Manual: `/test-runner`
Auto: Activates when user mentions "run tests" or similar
```

#### Step 2: Add Platform-Specific Metadata

The template above already includes all platform-specific fields in organized sections. The key metadata fields are:

- **Claude Code:** `allowed-tools`, `model`, `context`, `permissions`
- **Windsurf:** `trigger`, `globs`, `labels`
- **GitHub Copilot:** `applyTo`, `mode`

#### Step 3: Convert and Test on Claude Code

Convert the template:

```bash
aiw convert .ai-templates/skills/test-runner/SKILL.md --to claude-code
```

Verify output structure:

```
.claude/
  skills/
    test-runner/
      SKILL.md
  settings.json  # Contains merged permissions
```

Test the skill:

1. Open VS Code with Claude Code extension
2. Type `/test-runner`
3. Verify skill activates and follows the process
4. Confirm tool restrictions are enforced (cannot write files)

#### Step 4: Convert and Test on Windsurf

Convert the template:

```bash
aiw convert .ai-templates/skills/test-runner/SKILL.md --to windsurf
```

Verify output structure:

```
.windsurf/
  workflows/
    test-runner.md
```

The converted file will include:
- Advisory tool restrictions section
- Model decision trigger for auto-activation
- Version comment

Test the workflow:

1. Open project in Windsurf
2. Say "help me run the tests"
3. Verify workflow activates via model decision
4. Or manually invoke with `/test-runner`

---

### Tutorial B: Migrating Existing Templates

Migrate a Windsurf-only workflow to work cross-platform.

#### Step 1: Identify Source Platform

Original Windsurf workflow (`.windsurf/workflows/deploy-staging.md`):

```yaml
---
description: Deploy to staging environment
trigger: manual
globs:
  - "deploy/**/*"
  - "k8s/**/*"
labels:
  - deployment
  - staging
author: DevOps Team
---

# Deploy to Staging

## Prerequisites
- Docker images built and tagged
- Kubernetes config updated

## Steps
1. Build Docker images
2. Push to registry
3. Apply Kubernetes manifests
4. Verify deployment health
5. Run smoke tests

## Rollback
If deployment fails, run: `kubectl rollout undo deployment/app`
```

**Source Platform:** Windsurf (identified by `trigger`, `globs`, `labels` fields)

#### Step 2: Extract to Standard Format

Create standard template (`.ai-templates/workflows/deploy-staging.workflow.md`):

```yaml
---
# ============================================
# CORE FIELDS
# ============================================
name: deploy-staging
description: >
  USE WHEN deploying to staging environment. Builds Docker images,
  pushes to registry, applies Kubernetes manifests, and verifies health.
  Activate when user mentions: deploy staging, push to staging,
  staging deployment, or update staging.
version: "1.0.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Bash(docker build *)
  - Bash(docker push *)
  - Bash(kubectl apply *)
  - Bash(kubectl rollout *)
  - Bash(kubectl get *)
  - Read
  - Grep
model: claude-sonnet-4-5-20250929
context: inherit
permissions:
  allow:
    - Read(deploy/**)
    - Read(k8s/**)
    - Read(Dockerfile*)
    - Bash(docker *)
    - Bash(kubectl *)
  deny:
    - Bash(kubectl delete *)
    - Bash(docker rm *)

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: manual
globs:
  - "deploy/**/*"
  - "k8s/**/*"
labels:
  - deployment
  - staging
  - devops
author: DevOps Team

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "deploy/**/*"
  - "k8s/**/*"
  - "Dockerfile*"
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
    notes: "Full support with enforced restrictions on destructive commands"
  windsurf:
    status: full
    notes: "Manual trigger, advisory restrictions"
  github-copilot:
    status: full
    notes: "Works within working set, batch if many config files"

emulation:
  permissions:
    pattern: explicit-rules
    fallback: "Include restriction warnings in body"
---

# Deploy to Staging

Automated workflow for deploying to staging environment.

## Context Gathering Protocol

Before beginning deployment, verify prerequisites:

### Step 0: Pre-Deployment Checks

1. **Verify Docker images exist:**
   ```
   Glob: Dockerfile*
   Grep: pattern="FROM" path="."
   ```

2. **Check Kubernetes configs:**
   ```
   Glob: k8s/**/*.yaml
   Read: k8s/staging/deployment.yaml
   ```

**Prerequisites Checklist:**
- [ ] Dockerfile(s) present
- [ ] Kubernetes manifests found
- [ ] Required secrets configured (verify manually)

## Deployment Steps

### 1. Build Docker Images

```bash
docker build -t app:staging .
docker build -t worker:staging -f Dockerfile.worker .
```

### 2. Push to Registry

```bash
docker push registry.example.com/app:staging
docker push registry.example.com/worker:staging
```

### 3. Apply Kubernetes Manifests

```bash
kubectl apply -f k8s/staging/
```

### 4. Verify Deployment Health

```bash
kubectl get pods -l env=staging
kubectl rollout status deployment/app -n staging
```

### 5. Run Smoke Tests

```bash
curl -f https://staging.example.com/health || echo "Health check failed"
```

## Rollback Procedure

If deployment fails:

```bash
kubectl rollout undo deployment/app -n staging
kubectl rollout undo deployment/worker -n staging
```

## Tool Restrictions (Advisory)

**Allowed:**
- Docker build and push commands
- Kubectl apply and get commands
- Read deployment configurations

**Forbidden:**
- `kubectl delete` - Use rollback instead
- `docker rm` - Clean up manually if needed

## Invocation

- **Manual:** `/deploy-staging`
- **When to use:** After code review approval and CI passes
```

#### Step 3: Add Cross-Platform Compatibility

The template above includes:

1. **Claude Code fields:** `allowed-tools`, `permissions` with explicit allow/deny
2. **Windsurf fields:** Preserved original `trigger`, `globs`, `labels`
3. **GitHub Copilot fields:** Added `applyTo`, `mode`
4. **Cross-platform fields:** `platforms`, `compatibility`, `emulation`
5. **Context gathering:** Step 0 for explicit prerequisite checks
6. **Advisory warnings:** Tool restrictions section for non-enforcing platforms

#### Step 4: Convert to Target Platforms

**Convert to Claude Code:**

```bash
aiw convert .ai-templates/workflows/deploy-staging.workflow.md --to claude-code
```

Output:
```
.claude/
  skills/
    deploy-staging/
      SKILL.md
  settings.json  # Merged permissions
```

**Convert to Windsurf:**

```bash
aiw convert .ai-templates/workflows/deploy-staging.workflow.md --to windsurf
```

Output:
```
.windsurf/
  workflows/
    deploy-staging.md
```

**Convert to GitHub Copilot (when supported):**

```bash
aiw convert .ai-templates/workflows/deploy-staging.workflow.md --to github-copilot
```

Output:
```
.github/
  prompts/
    deploy-staging.prompt.md
```

**Verify Conversions:**

```bash
# Check for warnings
aiw convert .ai-templates/workflows/deploy-staging.workflow.md --to claude-code --debug
aiw convert .ai-templates/workflows/deploy-staging.workflow.md --to windsurf --debug
```

Review any `[EMULATED]` or `[UNSUPPORTED]` warnings and adjust template as needed.

---

## Additional Resources

- [TEMPLATE-USER-GUIDE.md](./TEMPLATE-USER-GUIDE.md) - Template creation and frontmatter reference
- [CLI-CONVERT-REFERENCE.md](./CLI-CONVERT-REFERENCE.md) - Convert command reference
- [WORKAROUND-PATTERNS.md](../WORKAROUND-PATTERNS.md) - Detailed emulation patterns
- [examples/skill-example.md](../examples/skill-example.md) - Complete skill example
- [examples/workflow-example.md](../examples/workflow-example.md) - Complete workflow example

---

## Summary

**Design Principles:**
1. Start with standard format, convert to platforms
2. Use compatibility field proactively
3. Prefer portable constructs
4. Document platform-specific behavior

**Template Organization:**
- Skills for reusable capabilities
- Workflows for multi-step processes
- Semantic versioning
- Clear naming conventions

**Cross-Platform Patterns:**
1. Skill Emulation (Claude Code -> Windsurf)
2. Workflow Emulation (Windsurf -> Claude Code)
3. Working Set Limitation (all -> GitHub Copilot)
4. Avoid platform-specific constructs without fallback

**Testing:**
- Validate YAML frontmatter
- Convert with debug mode
- Test on each target platform
- Watch for common pitfalls

Following these best practices ensures your templates work reliably across all supported platforms while maximizing the unique capabilities of each.
