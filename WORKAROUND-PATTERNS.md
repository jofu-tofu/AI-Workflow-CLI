# Workaround Patterns for Cross-Platform Template Compatibility

**Version:** 1.0.0
**Date:** 2026-01-12
**Purpose:** Practical emulation patterns for capability gaps across AI assistant platforms

---

## Overview

This document provides tested, practical workaround patterns for emulating missing capabilities across Claude Code, Windsurf, and GitHub Copilot. Each pattern includes:

- **Problem Statement** - The capability gap being addressed
- **Standard Format** - How the feature is expressed in the superset schema
- **Emulation Strategy** - How to replicate the feature on platforms that lack native support
- **Implementation Examples** - Working code samples
- **Activation Mechanism** - How the pattern is triggered
- **Known Limitations** - What the emulation cannot achieve
- **Manual Traceability** - Step-by-step execution flow

---

## Pattern 1: Skill Emulation for Windsurf

### Problem Statement

**Gap:** Windsurf does not have Claude Code's "skills" feature - reusable, composable AI instructions that can be invoked by name.

**Related Gaps:**
- **GAP-W1 (Subagent Spawning):** Windsurf cannot spawn parallel subagents like Claude Code's Task tool
- **GAP-W2 (Granular Permissions):** Windsurf cannot enforce tool restrictions
- **GAP-W3 (Custom Agent Types):** Windsurf cannot assign specialized agents to workflows

**What This Pattern Addresses:**
- ✅ Creating reusable workflow-based skills in Windsurf
- ✅ Emulating Claude Code skill structure and activation
- ✅ Simulating custom agents via persona rules
- ❌ **Does NOT solve parallel subagent spawning** - Windsurf workflows execute sequentially in single Cascade session

**Impact of Gaps:**
- Cannot create reusable command-like AI behaviors → **Solved by this pattern**
- Cannot delegate tasks to specialized agents → **Partially solved** (persona emulation, not true agents)
- Cannot spawn isolated execution contexts → **NOT solved** (limitation of Windsurf)
- All work must be done in single Cascade session → **Inherent limitation**

**Scope Clarification:**
This pattern enables skill-like reusable workflows in Windsurf but does NOT enable parallel subagent spawning (GAP-W1). For true parallel subagent execution, use Claude Code instead.

### Standard Format

In the superset schema, a Claude Code skill looks like this:

```yaml
---
name: security-review
description: USE WHEN reviewing code for security vulnerabilities
version: "1.0.0"
allowed-tools:
  - Read
  - Grep
  - Bash(npm audit)
context: fork
agent: security-specialist
---

# Security Review Skill

## Objective
Perform comprehensive security analysis of codebase.

## Steps
1. Scan for common vulnerabilities
2. Review authentication/authorization
3. Check for exposed secrets
4. Generate security report
```

### Emulation Strategy

Windsurf can emulate skills using a combination of:

1. **Workflows as Skill Containers** - Store skill content in `.windsurf/workflows/{skill-name}.md`
2. **Model Decision Triggers** - Use `trigger: model_decision` so Windsurf activates the workflow when relevant
3. **Context Markers** - Add explicit context boundaries to simulate isolation
4. **Persona Rules** - Use separate rule files to emulate custom agents
5. **Advisory Restrictions** - Document tool/permission restrictions (not enforced)

### Implementation Example

**Input: Standard Format Skill**

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
3. Ask user for commit type (feat/fix/docs/refactor/etc)
4. Generate conventional commit message
5. Execute commit with user approval
```

**Output: Windsurf-Adapted Workflow**

**File:** `.windsurf/workflows/commit-helper.md`

```yaml
---
description: USE WHEN creating git commits. Helps write conventional commit messages.
trigger: model_decision
labels:
  - git
  - automation
  - commits
---

# Commit Helper

<!-- Version: 1.0.0 -->
<!-- Adapted from Claude Code skill -->

## Tool Restrictions (Advisory)

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.

**Allowed Operations:**
- Git status checks (`git status`)
- View changes (`git diff`)
- Stage files (`git add`)
- Create commits (`git commit`)

**Forbidden Operations:**
- File editing
- Non-git shell commands
- Destructive git operations (force push, hard reset)

**IMPORTANT:** Before using tools outside this list, ask user for permission.

---

## Execution Context

This workflow uses inherited context (normal Cascade session).

---

## Process

1. Run `git status` to see changes
2. Run `git diff` to review modifications
3. Ask user for commit type (feat/fix/docs/refactor/etc)
4. Generate conventional commit message
5. Execute commit with user approval

---

## Invocation

This workflow activates automatically when:
- User mentions "commit", "git commit", or "create a commit"
- Windsurf's AI determines commit creation is relevant

Manual invocation: `/commit-helper`
```

**For skills with custom agents:**

If the standard format includes `agent: security-specialist`, create an additional rule file:

**File:** `.windsurf/rules/agent-security-specialist.md`

```yaml
---
trigger: manual
description: Activate security-specialist persona with @rules:agent-security-specialist
---

# Security Specialist Persona

When @rules:agent-security-specialist is active, adopt this persona:

## Role
You are a specialized security review agent focused on identifying vulnerabilities and security risks.

## Behavioral Guidelines
- Prioritize security issues by severity (Critical/High/Medium/Low)
- Always check for OWASP Top 10 vulnerabilities
- Focus on authentication, authorization, input validation, and data exposure
- Provide specific remediation steps with code examples

## Focus Areas
- SQL injection and NoSQL injection
- Cross-site scripting (XSS)
- Authentication bypass
- Authorization flaws
- Exposed secrets and credentials
- Insecure dependencies

## Activation
User invokes with: `@rules:agent-security-specialist`

## Deactivation
Returns to default Cascade behavior when user starts new topic.

> **NOTE:** Tool restrictions cannot be enforced in Windsurf. Rely on AI compliance.
```

**Referencing the agent in the workflow:**

Add this section to the workflow:

```markdown
## Agent Persona

This workflow uses the **security-specialist** agent.
Activate with: `@rules:agent-security-specialist` before running this workflow.
```

### Activation Mechanism

**Model Decision Trigger:**

```yaml
trigger: model_decision
description: USE WHEN creating git commits. Helps write conventional commit messages.
```

**How it works:**

1. User mentions "commit" or related terms in conversation
2. Windsurf's AI analyzes context and determines this workflow is relevant
3. Workflow is automatically loaded and instructions become active
4. AI follows the workflow steps to guide user through commit creation

**Manual Trigger:**

User can also explicitly invoke: `/commit-helper`

**Activation Conditions:**

The `description` field acts as a trigger condition. Best practices:

- Start with "USE WHEN" to signal activation pattern
- Include specific keywords AI should match (e.g., "git commits", "creating commits")
- Describe the scenario where skill is relevant
- Be specific enough to avoid false activations

**Example Activation Descriptions:**

```yaml
# Good: Specific and clear
description: USE WHEN reviewing Python code for security vulnerabilities

# Good: Multiple trigger scenarios
description: USE WHEN deploying to production OR when user asks about deployment process

# Poor: Too vague (activates too often)
description: Help with code

# Poor: Too narrow (AI might miss valid scenarios)
description: Only activate when user types exactly "run security scan"
```

### Known Limitations

1. **No True Subagents:**
   - Cannot spawn parallel isolated contexts
   - All work happens in single Cascade session
   - Context pollution risk (previous conversation affects workflow)

2. **No Permission Enforcement:**
   - `allowed-tools` converted to advisory instructions
   - AI may ignore restrictions if prompted or deemed necessary
   - No system-level enforcement like Claude Code

3. **Manual Agent Activation:**
   - Custom agents require manual `@rules:agent-{name}` invocation
   - Agent cannot be automatically attached to workflow
   - User must remember to activate persona before running workflow

4. **Context Isolation:**
   - `context: fork` can only be simulated with markers
   - Workflow cannot truly start fresh session
   - Prior conversation history always available to AI

5. **Model Decision Reliability:**
   - AI activation not guaranteed
   - May activate when not needed (false positives)
   - May fail to activate when appropriate (false negatives)
   - Less deterministic than explicit skill invocation in Claude Code

### Manual Traceability

**Execution Flow: How Windsurf Processes the Emulated Skill**

1. **User Action:** User says "help me commit these changes"

2. **Model Decision:** Windsurf's AI:
   - Analyzes user intent
   - Scans available workflows with `trigger: model_decision`
   - Matches "commit these changes" to workflow description "USE WHEN creating git commits"
   - Decides to activate `commit-helper` workflow

3. **Context Loading:** Windsurf loads `.windsurf/workflows/commit-helper.md`:
   - Reads YAML frontmatter (description, trigger, labels)
   - Parses markdown body as instructions
   - Makes content available to AI's context window

4. **Instruction Following:** AI reads and follows:
   - Tool Restrictions section (advisory only)
   - Process steps (1-5)
   - Execution context notes

5. **Execution:** AI executes workflow:
   - Runs `git status` (Step 1)
   - Runs `git diff` (Step 2)
   - Asks user for commit type (Step 3)
   - Generates conventional commit message (Step 4)
   - Requests user approval and commits (Step 5)

6. **Completion:** Workflow completes, Cascade returns to normal mode

**Verification Points:**

- **Before:** `.windsurf/workflows/commit-helper.md` exists and is valid YAML+Markdown
- **During:** AI mentions following the workflow or references specific steps
- **After:** User receives conventional commit message and commit is created

**Debugging:**

If workflow doesn't activate:
1. Check file exists: `.windsurf/workflows/commit-helper.md`
2. Verify YAML frontmatter is valid
3. Try manual invocation: `/commit-helper`
4. Check description includes relevant keywords
5. Ensure `trigger: model_decision` is set

If workflow activates incorrectly:
1. Make description more specific
2. Add negative keywords ("do NOT activate when...")
3. Consider changing to `trigger: manual` for explicit control

---

## Pattern 2: Workflow Emulation for Claude Code

### Problem Statement

**Gap:** Claude Code skills lack Windsurf's AI-driven activation (model decision triggers) and automatic multi-file context awareness. This creates challenges when adapting Windsurf workflows that rely on:

- **AI-Driven Activation:** Windsurf workflows activate automatically when Cascade determines they're relevant to the current task
- **Multi-File Context:** Windsurf automatically loads all files matching glob patterns into context
- **Contextual Awareness:** Workflows have access to related files without explicit Read operations

**Reference:** PLATFORM-ADAPTERS.md Section 1 (Claude Code Adapter)

**Impact:**
- Claude Code skills require manual invocation by user
- Skills must explicitly gather file context using Read/Grep/Glob tools
- AI cannot automatically determine when a skill is relevant
- Multi-file refactoring requires sequential, explicit file loading

### Standard Format

In the superset schema, a Windsurf workflow with AI activation looks like this:

```yaml
---
description: USE WHEN refactoring React components for better modularity
trigger: model_decision
globs:
  - "src/components/**/*.tsx"
  - "src/components/**/*.ts"
labels:
  - refactoring
  - react
---

# Refactor Components Workflow

## Prerequisites

Windsurf's multi-file context automatically gathers:
- All components in src/components/
- Related hooks and utilities
- Component test files

## Steps
1. Analyze all components for duplicate logic
2. Extract shared patterns
3. Update imports across files
4. Verify tests pass
```

Key features:
- `trigger: model_decision` - AI decides when to activate
- `globs` - Files automatically loaded into context
- No explicit Read operations needed

### Emulation Strategy

Claude Code can emulate Windsurf workflows using:

1. **Description-Based Activation Hints** - Include trigger keywords in skill description to help AI suggest skill usage
2. **Explicit Context Gathering** - Add "Step 0" that uses Glob/Grep/Read to build multi-file context
3. **Context Gathering Checklist** - Document which files must be loaded before proceeding
4. **Activation Guidance** - Clearly state when user should invoke skill
5. **Comprehensive Descriptions** - Embed activation scenarios in `description` field

### Implementation Example

**Input: Windsurf Workflow (Standard Format)**

```yaml
---
description: USE WHEN user asks to optimize API performance
trigger: model_decision
globs:
  - "src/api/**/*.ts"
  - "src/middleware/**/*.ts"
labels:
  - performance
  - optimization
---

# API Performance Optimization

## Steps
1. Profile current API response times
2. Identify slow endpoints
3. Optimize database queries
4. Add caching where appropriate
```

**Output: Claude Code Skill (Adapted Format)**

**File:** `.claude/skills/optimize-api-performance/SKILL.md`

```yaml
---
name: optimize-api-performance
description: >
  USE WHEN user asks to optimize API performance, improve response times,
  reduce latency, or speed up endpoints. Analyzes API routes, identifies
  bottlenecks, optimizes queries, and implements caching strategies.
  Activate when user mentions: optimize API, slow endpoints, improve performance,
  reduce latency, speed up API, or cache API responses.
version: "1.0.0"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(npm run profile)
context: inherit
permissions:
  allow:
    - Read(src/api/**/*.ts)
    - Read(src/middleware/**/*.ts)
    - Read(src/database/**/*.ts)
---

# API Performance Optimization Skill

## Purpose

Profile API performance, identify slow endpoints, optimize database queries, and implement caching strategies.

**Emulated Multi-File Context:** This skill replicates Windsurf's automatic multi-file loading by explicitly gathering context before optimization begins.

---

## Context Gathering Protocol

**IMPORTANT:** Before beginning performance analysis, gather comprehensive context:

### Step 0: Multi-File Context Acquisition

Execute these operations to simulate Windsurf's automatic context loading:

1. **List all API route files:**
   ```
   Glob: src/api/**/*.ts
   ```

2. **Find middleware:**
   ```
   Glob: src/middleware/**/*.ts
   ```

3. **Identify database query files:**
   ```
   Grep: pattern="query|findMany|findUnique" path="src/"
   ```

4. **Locate caching logic:**
   ```
   Grep: pattern="cache|redis|memcached" path="src/"
   ```

**Context Checklist:**
- [ ] All API routes identified
- [ ] Middleware files loaded
- [ ] Database query patterns discovered
- [ ] Existing caching mechanisms found

**Only proceed to profiling once context gathering is complete.**

---

## Optimization Steps

### Step 1: Profile Current Performance
Run profiling tools to measure:
- API response times
- Database query durations
- Memory usage patterns

### Step 2: Identify Bottlenecks
Analyze profiling results to find:
- Slowest endpoints (>500ms response time)
- N+1 query problems
- Missing indexes
- Unoptimized queries

### Step 3: Optimize Queries
Based on gathered context from Step 0:
- Refactor slow queries in identified files
- Add database indexes
- Implement query result caching

### Step 4: Verify Improvements
Re-run profiling to confirm:
- Response times reduced by ≥30%
- Query count decreased
- No functionality regressions

---

## Activation Instructions

**Manual Invocation (Required):**

Unlike Windsurf's automatic activation, this skill must be manually invoked.

**When to invoke this skill:**

Use when user mentions:
- "optimize API performance"
- "slow endpoints"
- "improve response times"
- "reduce API latency"
- "speed up the API"
- "cache API responses"

**Invocation command:** `/optimize-api-performance`

**Description-based matching:** The skill's description includes trigger keywords to help AI recognize relevance, but user must still explicitly invoke the skill.

---

## Multi-File Context Simulation

**Windsurf Capability:** Automatic multi-file context via `globs: ["src/api/**/*.ts"]`
**Claude Code Emulation:** Explicit context gathering in Step 0

### How Context Gathering Works

**Windsurf (Automatic):**
```yaml
globs:
  - "src/api/**/*.ts"  # All files loaded into context automatically
  - "src/middleware/**/*.ts"
```
- Files loaded before workflow starts
- Cascade has full visibility into all matched files
- No explicit Read operations needed

**Claude Code (Explicit):**
```markdown
### Step 0: Multi-File Context Acquisition

1. Glob: src/api/**/*.ts
2. Glob: src/middleware/**/*.ts
3. Read each identified file
4. Build mental model of API structure
```
- Files discovered using Glob
- Files loaded sequentially using Read
- AI builds context incrementally
- Explicit checklist ensures completeness

### Context Gathering Best Practices

1. **Always include Step 0** in workflow-adapted skills
2. **Use Glob to discover files** before Reading them
3. **Document expected files** in context checklist
4. **Verify context completeness** before proceeding
5. **Batch Read operations** for efficiency

---

## Activation Mechanism Comparison

### Windsurf: AI-Driven Activation

```yaml
trigger: model_decision
description: USE WHEN user asks to optimize API performance
```

**How it works:**
1. User says: "The API is slow, can you help?"
2. Windsurf's model decision engine:
   - Analyzes user intent
   - Scans workflows with `trigger: model_decision`
   - Matches "API is slow" to description keywords
   - Automatically activates workflow
3. Workflow executes without user needing to know its name

**Advantages:**
- Zero friction - AI handles activation
- User doesn't need to know workflow names
- Natural conversation flow

### Claude Code: Description-Based Hints

```yaml
description: >
  USE WHEN user asks to optimize API performance, improve response times,
  reduce latency, or speed up endpoints.
  Activate when user mentions: optimize API, slow endpoints, improve performance.
```

**How it works:**
1. User says: "The API is slow, can you help?"
2. Claude Code AI:
   - Recognizes keywords in user message
   - Scans skill descriptions for matches
   - **Suggests** the skill to user: "I can help with `/optimize-api-performance` skill"
3. User **must manually invoke**: `/optimize-api-performance`
4. Skill executes

**Advantages:**
- Explicit user control over skill execution
- AI can suggest relevant skills
- Clear activation point for debugging

**Limitations:**
- Requires user action to invoke
- Adds friction to workflow
- User must remember to invoke suggested skill

### Emulation Pattern: Rich Descriptions

To compensate for lack of automatic activation, include comprehensive trigger conditions in the `description` field:

**Template:**
```yaml
description: >
  USE WHEN {primary use case}.
  {Detailed explanation of what skill does}.
  Activate when user mentions: {keyword 1}, {keyword 2}, {keyword 3}.
```

**Example:**
```yaml
description: >
  USE WHEN refactoring React components for better modularity and reusability.
  Analyzes component structure, extracts shared logic, and improves modularity.
  Activate when user mentions: refactor components, improve component structure,
  extract shared logic, split components, or modularize React code.
```

**Best Practices:**
- Start with "USE WHEN" to signal activation pattern
- List 5-10 trigger phrases users might say
- Include synonyms and variations
- Be specific about use cases
- Mention file types/patterns if relevant

---

## Known Limitations

1. **No Automatic Activation:**
   - Windsurf: Workflow activates automatically via model decision
   - Claude Code: User must manually invoke skill
   - Mitigation: Rich descriptions help AI suggest relevant skills
   - Impact: Higher friction, requires user awareness of skill names

2. **Manual Context Gathering Required:**
   - Windsurf: `globs` field loads files automatically
   - Claude Code: Must use Glob/Grep/Read in Step 0
   - Risk: AI might skip context gathering, leading to incomplete analysis
   - Mitigation: Make Step 0 mandatory, include context checklist

3. **No True Model Decision Engine:**
   - Windsurf: AI evaluates relevance automatically
   - Claude Code: Relies on description matching and user judgment
   - Limitation: User must recognize when skill is appropriate
   - Workaround: Provide clear "when to use" guidance in skill body

4. **Sequential Context Loading:**
   - Windsurf: All files loaded simultaneously
   - Claude Code: Files loaded one-by-one
   - Impact: Slower context gathering, more verbose execution
   - Mitigation: Use Glob to batch-discover files before Reading

5. **Context Window Constraints:**
   - Windsurf: Optimized for multi-file workflows
   - Claude Code: Large file counts may exceed context limits
   - Workaround: Prioritize most relevant files, use chunking for large operations

### Manual Traceability

**Execution Flow: How Claude Code Processes the Emulated Workflow**

1. **User Action:** User says "our API endpoints are slow, help optimize them"

2. **AI Recognition:** Claude Code AI:
   - Scans skill descriptions
   - Matches "slow" and "optimize" to `optimize-api-performance` description
   - Suggests: "I can help with the `/optimize-api-performance` skill which analyzes API routes and optimizes performance"

3. **User Invocation:** User types: `/optimize-api-performance`

4. **Skill Loading:** Claude Code:
   - Loads `.claude/skills/optimize-api-performance/SKILL.md`
   - Reads YAML frontmatter (name, description, allowed-tools, permissions)
   - Parses markdown body as instructions
   - Makes content available to AI

5. **Context Gathering (Step 0):** AI executes:
   ```
   Glob: src/api/**/*.ts       → Discovers 15 API route files
   Glob: src/middleware/**/*.ts → Discovers 3 middleware files
   Grep: "query|findMany"       → Finds database query patterns
   Read: {identified files}     → Loads file contents
   ```

6. **Context Verification:** AI checks context checklist:
   - [x] All API routes identified
   - [x] Middleware files loaded
   - [x] Database query patterns discovered
   - [x] Existing caching mechanisms found

7. **Workflow Execution:** AI follows optimization steps:
   - Step 1: Profile performance (uses gathered file context)
   - Step 2: Identify bottlenecks (analyzes loaded files)
   - Step 3: Optimize queries (modifies files in context)
   - Step 4: Verify improvements

8. **Completion:** Skill completes, results reported to user

**Verification Points:**

- **Before:** `.claude/skills/optimize-api-performance/SKILL.md` exists and is valid
- **During:** AI executes Step 0 context gathering before proceeding to analysis
- **During:** AI references specific files from gathered context
- **After:** Optimizations applied to files identified in Step 0
- **After:** User receives performance improvement report

**Debugging:**

If skill doesn't work as expected:

1. **Skill not suggested:**
   - Check description includes relevant keywords
   - Ensure "USE WHEN" statement matches user intent
   - Add more trigger phrases to description

2. **Context gathering incomplete:**
   - Verify Step 0 is clearly marked as mandatory
   - Check context checklist is present
   - Ensure Glob patterns match actual file locations

3. **Multi-file coordination fails:**
   - Confirm AI loaded all relevant files in Step 0
   - Check that subsequent steps reference gathered context
   - Verify permissions allow access to required files

4. **Compared to Windsurf:**
   - Execute same task in Windsurf (automatic activation, automatic context)
   - Execute in Claude Code (manual invocation, explicit context gathering)
   - Verify outcomes are equivalent despite different mechanisms

---

## Pattern Application Guide

**When to use this pattern:**

Use Workflow Emulation Pattern when converting Windsurf workflows to Claude Code skills if the workflow:

- ✅ Uses `trigger: model_decision` for AI-driven activation
- ✅ Relies on `globs` to automatically load multiple files
- ✅ Requires multi-file context awareness
- ✅ Performs coordinated changes across related files
- ✅ Benefits from understanding relationships between files

**When NOT to use this pattern:**

Skip this pattern if:

- ❌ Workflow is single-file focused
- ❌ Manual invocation is acceptable
- ❌ Context requirements are simple
- ❌ No multi-file coordination needed

**Example Use Cases:**

- **Refactoring workflows** - Extract shared logic across components
- **Performance optimization** - Analyze and optimize API routes
- **Migration tasks** - Update imports across multiple files
- **Code review** - Analyze related files for consistency
- **Dependency updates** - Update usage patterns across codebase

---

## Complete Example

See `examples/workflow-example.md` for a complete, working example that demonstrates:

- Original Windsurf workflow with model_decision trigger and globs
- Adapted Claude Code skill with explicit context gathering
- Step 0 context acquisition protocol
- Context checklist for verification
- Activation guidance for users
- Comparison of Windsurf automatic vs Claude Code explicit approaches

---

## Pattern Summary Table

| Pattern Name | Platform | Gap Addressed | Emulation Approach | Key Limitations |
|-------------|----------|---------------|-------------------|-----------------|
| **Skill Emulation** | Windsurf | No skills/subagents | Workflows + Model Decision + Persona Rules | No true isolation, no permission enforcement, manual agent activation |
| **Workflow Emulation** | Claude Code | No AI-driven activation, no automatic multi-file context | Rich descriptions + Explicit context gathering (Step 0) | Manual invocation required, sequential context loading, no model decision engine |

---

## Cross-References

- **GAP-ANALYSIS.md** - Gap #W1 (Subagent Spawning)
- **PLATFORM-ADAPTERS.md** - Section 2.2 (Windsurf Emulation Patterns)
- **PLATFORM-ADAPTERS.md** - Section 1 (Claude Code Adapter) - Workflow transformation rules
- **STANDARD-SCHEMA.md** - Skill field definitions
- **STANDARD-STRUCTURE.md** - Workflow file organization
- **examples/workflow-example.md** - Complete working example of workflow emulation

---

## Pattern 3: Working Set Limitation Pattern for GitHub Copilot

### Problem Statement

**Gap:** GitHub Copilot has severe working set and context limitations that make large-scale refactoring and complex multi-file operations extremely difficult or impossible.

**Reference:** GAP-ANALYSIS.md Gap #GH1 (Working Set and Context Limitations)

**Impact:**
- Maximum 10 files in working set at once
- Maximum 20 files for context awareness
- ~6,000 character context window for fast models
- Quality degrades on files >782 lines
- Significant problems on files >5,000 lines
- Cannot effectively work on larger projects
- Community considering alternatives due to restrictions

### Standard Format

In the superset schema, a skill designed for large-scale operations looks like this:

```yaml
---
name: refactor-authentication
description: Refactor authentication system across the entire codebase
version: "1.0.0"
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
context: inherit
permissions:
  allow:
    - Read(src/**/auth*.ts)
    - Read(src/**/user*.ts)
    - Write(src/**/auth*.ts)
    - Write(src/**/user*.ts)
---

# Authentication System Refactor

## Scope
Refactor the authentication system across 25+ files:
- src/auth/*.ts (8 files)
- src/api/auth/*.ts (6 files)
- src/middleware/auth*.ts (3 files)
- src/models/user*.ts (4 files)
- src/services/auth*.ts (4 files)

## Objectives
1. Standardize authentication patterns
2. Extract shared logic
3. Update all import references
4. Ensure tests pass
```

This would fail on GitHub Copilot due to exceeding the 10-file working set limit.

### Emulation Strategy

GitHub Copilot can handle large operations using a combination of:

1. **Skill Decomposition** - Break large skills into smaller, focused sub-skills that each operate on ≤10 files
2. **Batch Processing** - Process files in sequential batches with checkpoints
3. **File Prioritization** - Keep most-referenced/core files in working set, rotate peripheral files
4. **Skill Chaining** - Create skills that reference and build upon each other
5. **@workspace Fallback** - Document when to use `@workspace` for discovery vs batching for implementation

### Implementation Example

**Input: Standard Format Skill (Too Large for Copilot)**

```yaml
---
name: refactor-authentication
description: Refactor authentication system across the entire codebase
version: "1.0.0"
allowed-tools:
  - Read
  - Write
  - Grep
context: inherit
platforms: [claude-code, windsurf, github-copilot]
---

# Authentication System Refactor

## Scope
Refactor authentication across 25 files in:
- src/auth/ (8 files)
- src/api/auth/ (6 files)
- src/middleware/ (3 files)
- src/models/ (4 files)
- src/services/ (4 files)

## Objectives
1. Standardize authentication patterns
2. Extract shared logic
3. Update all import references
4. Ensure tests pass
```

**Output: Decomposed Sub-Skills for GitHub Copilot**

**Decision Tree Applied:**

1. **Count affected files:** 25 files
2. **Exceeds 10-file limit?** Yes
3. **Can be logically split?** Yes (by module)
4. **Strategy:** Decompose into sub-skills

**File 1:** `.github/prompts/refactor-auth-core.prompt.md`

```yaml
---
description: Refactor core authentication logic (Part 1 of 4)
applyTo:
  - "src/auth/*.ts"
mode: agent
---

# Authentication Refactor - Part 1: Core Logic

<!-- Part 1 of 4: Core Authentication Module -->
<!-- Version: 1.0.0 -->

## Scope

**This prompt handles:** Core authentication files in `src/auth/` (8 files)

**Working Set (8 files):**
1. src/auth/auth-service.ts
2. src/auth/jwt-handler.ts
3. src/auth/password-hash.ts
4. src/auth/session-manager.ts
5. src/auth/token-validator.ts
6. src/auth/auth-middleware.ts
7. src/auth/auth-types.ts
8. src/auth/auth-utils.ts

## Objectives

1. Standardize authentication patterns in core module
2. Extract shared logic within src/auth/
3. Ensure consistent error handling
4. Document exported interfaces

## Workflow

### Step 1: Analyze Core Files
Review all 8 files in src/auth/ for:
- Duplicate logic
- Inconsistent patterns
- Shared utilities that should be extracted

### Step 2: Standardize Patterns
Apply consistent patterns for:
- JWT token handling
- Password hashing
- Session management
- Error responses

### Step 3: Extract Shared Logic
Create new files if needed (within 10-file limit):
- src/auth/auth-constants.ts (if needed)
- src/auth/auth-errors.ts (if needed)

### Step 4: Update Internal Imports
Update imports within src/auth/ module only.
Do NOT modify external imports yet (handled in Part 4).

### Step 5: Checkpoint
Create commit: `refactor(auth): part 1 - standardize core auth module`

## Next Steps

After completing this part:
1. Run tests: `npm test src/auth/`
2. Verify no regressions
3. Proceed to Part 2: `/prompt refactor-auth-api`

## Related Files (Not Modified Here)

The following files depend on src/auth/ but are handled in later parts:
- src/api/auth/*.ts (Part 2)
- src/middleware/*.ts (Part 3)
- src/models/*.ts, src/services/*.ts (Part 4)
```

**File 2:** `.github/prompts/refactor-auth-api.prompt.md`

```yaml
---
description: Refactor authentication API routes (Part 2 of 4)
applyTo:
  - "src/api/auth/*.ts"
  - "src/auth/auth-types.ts"
mode: agent
---

# Authentication Refactor - Part 2: API Routes

<!-- Part 2 of 4: API Integration -->
<!-- Version: 1.0.0 -->

## Prerequisites

**IMPORTANT:** Complete Part 1 (`refactor-auth-core`) before starting this part.

Part 1 should have:
- Standardized core authentication patterns
- Extracted shared logic
- Created stable interfaces in src/auth/

## Scope

**This prompt handles:** Authentication API routes (6 files) + core types reference (1 file)

**Working Set (7 files):**
1. src/api/auth/login-route.ts
2. src/api/auth/register-route.ts
3. src/api/auth/logout-route.ts
4. src/api/auth/refresh-route.ts
5. src/api/auth/verify-route.ts
6. src/api/auth/password-reset-route.ts
7. src/auth/auth-types.ts (reference - core types)

**Rationale:** Keep auth-types.ts in working set as reference for consistent interface usage.

## Objectives

1. Update API routes to use standardized auth patterns from Part 1
2. Ensure all routes use consistent error handling
3. Update imports to reference refactored core module
4. Maintain API contract (no breaking changes)

## Workflow

### Step 1: Review Core Changes
Read src/auth/auth-types.ts to understand new interfaces from Part 1.

### Step 2: Update API Routes
For each route file:
- Update imports from src/auth/
- Use standardized authentication methods
- Apply consistent error handling
- Maintain backward compatibility

### Step 3: Verify API Contracts
Ensure response formats unchanged (no breaking API changes).

### Step 4: Checkpoint
Create commit: `refactor(auth): part 2 - update API routes to use core auth`

## Next Steps

After completing this part:
1. Run tests: `npm test src/api/auth/`
2. Test API endpoints manually if needed
3. Proceed to Part 3: `/prompt refactor-auth-middleware`

## Related Files (Not Modified Here)

- src/middleware/*.ts (Part 3)
- src/models/*.ts, src/services/*.ts (Part 4)
```

**File 3:** `.github/prompts/refactor-auth-middleware.prompt.md`

```yaml
---
description: Refactor authentication middleware (Part 3 of 4)
applyTo:
  - "src/middleware/*.ts"
  - "src/auth/auth-types.ts"
mode: agent
---

# Authentication Refactor - Part 3: Middleware

<!-- Part 3 of 4: Middleware Integration -->
<!-- Version: 1.0.0 -->

## Prerequisites

**IMPORTANT:** Complete Parts 1 and 2 before starting this part.

Previous parts should have:
- Part 1: Standardized core authentication module
- Part 2: Updated API routes to use new patterns

## Scope

**This prompt handles:** Authentication middleware (3 files) + core types reference (1 file)

**Working Set (4 files):**
1. src/middleware/auth-required.ts
2. src/middleware/role-check.ts
3. src/middleware/token-refresh.ts
4. src/auth/auth-types.ts (reference - core types)

**Rationale:** Middleware is tightly coupled to auth-types, keep in working set for reference.

## Objectives

1. Update middleware to use refactored authentication service
2. Ensure consistent error responses
3. Update imports to use standardized core module
4. Maintain middleware interface (no breaking changes to route handlers)

## Workflow

### Step 1: Review Core Interface
Read src/auth/auth-types.ts and src/auth/auth-service.ts (from Part 1).

### Step 2: Update Middleware
For each middleware file:
- Update imports from src/auth/
- Use standardized authentication methods
- Apply consistent error handling
- Ensure middleware signature unchanged

### Step 3: Verify Middleware Contracts
Test that existing routes using this middleware still work.

### Step 4: Checkpoint
Create commit: `refactor(auth): part 3 - update middleware to use core auth`

## Next Steps

After completing this part:
1. Run tests: `npm test src/middleware/`
2. Test middleware integration with sample routes
3. Proceed to Part 4: `/prompt refactor-auth-finalize`

## Related Files (Not Modified Here)

- src/models/*.ts, src/services/*.ts (Part 4 - final integration)
```

**File 4:** `.github/prompts/refactor-auth-finalize.prompt.md`

```yaml
---
description: Finalize authentication refactor - update remaining integrations (Part 4 of 4)
applyTo:
  - "src/models/user*.ts"
  - "src/services/auth*.ts"
  - "src/auth/auth-types.ts"
mode: agent
---

# Authentication Refactor - Part 4: Finalization

<!-- Part 4 of 4: Final Integration and Verification -->
<!-- Version: 1.0.0 -->

## Prerequisites

**IMPORTANT:** Complete Parts 1, 2, and 3 before starting this part.

Previous parts should have:
- Part 1: Core authentication module standardized
- Part 2: API routes updated
- Part 3: Middleware updated

## Scope

**This prompt handles:** Remaining authentication-related files (8 files)

**Working Set (9 files):**
1. src/models/user.ts
2. src/models/user-session.ts
3. src/models/user-token.ts
4. src/models/user-role.ts
5. src/services/auth-service.ts
6. src/services/auth-email-service.ts
7. src/services/auth-logger.ts
8. src/services/auth-audit.ts
9. src/auth/auth-types.ts (reference - ensure consistency)

## Objectives

1. Update models and services to align with refactored auth core
2. Ensure all cross-references are updated
3. Remove any deprecated imports or patterns
4. Run full test suite and verify system-wide consistency

## Workflow

### Step 1: Update Models
Update user-related models:
- Align with auth-types.ts interfaces
- Update imports
- Ensure database schema compatibility

### Step 2: Update Services
Update authentication services:
- Use standardized core authentication methods
- Update imports
- Apply consistent error handling

### Step 3: System-Wide Verification
Run comprehensive tests:
```bash
npm test
```

Check for:
- No import errors
- All tests pass
- No deprecated patterns remain

### Step 4: Final Checkpoint
Create commit: `refactor(auth): part 4 - finalize integration across all modules`

### Step 5: Integration Test
Run integration tests to verify:
- Full authentication flow works
- All API endpoints function
- Middleware applies correctly
- Models integrate properly

## Completion Checklist

- [ ] All 25 files refactored across 4 parts
- [ ] Full test suite passes
- [ ] No import errors
- [ ] No deprecated patterns remain
- [ ] Integration tests pass
- [ ] Documentation updated (if needed)

## Rollback Plan

If integration issues discovered:
1. Review commits from all 4 parts
2. Identify problematic part
3. Rollback specific commit: `git revert <commit-hash>`
4. Fix issues and re-run that part

## Summary

This completes the 4-part authentication refactor:
- **Part 1:** Core module (8 files)
- **Part 2:** API routes (6 files)
- **Part 3:** Middleware (3 files)
- **Part 4:** Models & services (8 files)
- **Total:** 25 files refactored within Copilot's 10-file working set limit
```

**File 5:** `.github/prompts/refactor-auth-coordinator.prompt.md`

```yaml
---
description: Coordinate full authentication refactor (use this as entry point)
mode: agent
---

# Authentication Refactor - Coordinator

<!-- Master prompt for orchestrating the 4-part refactor -->
<!-- Version: 1.0.0 -->

## Overview

This refactor has been decomposed into 4 sequential parts to work within GitHub Copilot's 10-file working set limit.

**Original Scope:** 25 files across multiple modules
**Copilot Limit:** 10 files per working set
**Solution:** 4 batched sub-tasks, each ≤10 files

## Execution Order

Execute prompts in this order:

### Part 1: Core Authentication Module
**Prompt:** `/prompt refactor-auth-core`
**Files:** 8 files in src/auth/
**Duration:** ~15-20 minutes
**Checkpoint:** Commit after completion

### Part 2: API Routes
**Prompt:** `/prompt refactor-auth-api`
**Files:** 6 API route files + 1 reference file
**Duration:** ~15-20 minutes
**Checkpoint:** Commit after completion

### Part 3: Middleware
**Prompt:** `/prompt refactor-auth-middleware`
**Files:** 3 middleware files + 1 reference file
**Duration:** ~10-15 minutes
**Checkpoint:** Commit after completion

### Part 4: Models & Services
**Prompt:** `/prompt refactor-auth-finalize`
**Files:** 8 model/service files + 1 reference file
**Duration:** ~15-20 minutes
**Checkpoint:** Final commit

## Total Estimated Time

Approximately 55-75 minutes for complete refactor.

## Progress Tracking

Create `REFACTOR-PROGRESS.md` to track completion:

```markdown
# Authentication Refactor Progress

- [ ] Part 1: Core module (src/auth/)
- [ ] Part 2: API routes (src/api/auth/)
- [ ] Part 3: Middleware (src/middleware/)
- [ ] Part 4: Models & services (src/models/, src/services/)

## Notes
- Started: [date]
- Current part: [1/2/3/4]
- Issues: [any blockers]
```

## When to Use @workspace Instead

**Use this decomposed approach when:**
- You need to MODIFY >10 files
- Changes are implementation-heavy
- Files are tightly coupled
- Need precise control over changes

**Use @workspace when:**
- You need to SEARCH/ANALYZE many files (read-only)
- Gathering context about patterns
- Planning refactor (not implementing yet)
- Exploring codebase structure

**⚠️ Important:** @workspace also has a 10-file limit on search results (per RESEARCH-github-copilot.md). However, it can perform multiple searches to build understanding across batches, making it useful for discovery despite the limit.

## Alternative: @workspace for Discovery, Prompts for Implementation

**Step 1: Discovery Phase**
```
@workspace find all files that import from src/auth/
```

Use @workspace to understand scope. Note: @workspace can analyze patterns across multiple 10-file batches of search results, providing broader understanding than single prompt working sets.

**Step 2: Implementation Phase**
Execute the 4-part prompt sequence to make actual changes (respects 10-file limit).

## Troubleshooting

**If Part N fails:**
1. Review commit from Part N-1
2. Ensure previous parts completed successfully
3. Check test output for specific errors
4. Fix errors and re-run Part N

**If working set limit hit:**
- Verify file count in "Working Set" section of prompt
- Remove non-essential reference files
- Split part into sub-parts if needed

## Next Steps

1. Review this coordinator prompt to understand full scope
2. Create `REFACTOR-PROGRESS.md` for tracking
3. Start with Part 1: `/prompt refactor-auth-core`
4. Follow the sequence through Part 4
5. Run final integration tests
```

### Activation Mechanism

**Skill Chaining:**

Each sub-skill references the next in sequence:
1. Part 1 → Directs to Part 2
2. Part 2 → Directs to Part 3
3. Part 3 → Directs to Part 4
4. Part 4 → Completion checklist

**Coordinator Pattern:**

The coordinator prompt serves as the entry point and provides:
- Complete overview
- Execution order
- Progress tracking
- When to use @workspace vs batched prompts

**Manual Invocation:**

User invokes each part sequentially:
```
/prompt refactor-auth-coordinator  # Read overview
/prompt refactor-auth-core          # Part 1
/prompt refactor-auth-api           # Part 2
/prompt refactor-auth-middleware    # Part 3
/prompt refactor-auth-finalize      # Part 4
```

### Decision Tree: When to Split vs When to Use @workspace

```
                    Start: Large Operation
                             |
                             v
                    Count affected files
                             |
                +-----------+ +------------+
                |                          |
                v                          v
            ≤10 files                  >10 files
                |                          |
                v                          v
        Use single prompt          Is operation read-only
        with all files             (analysis/search)?
                                           |
                                +----------+-----------+
                                |                      |
                                v                      v
                            Yes (read-only)        No (write/modify)
                                |                      |
                                v                      v
                        Use @workspace          Can be logically split?
                        for discovery                  |
                        (no 10-file limit)  +----------+-----------+
                                            |                      |
                                            v                      v
                                        Yes (logical splits)   No (tightly coupled)
                                            |                      |
                                            v                      v
                                    Decompose into           File Prioritization:
                                    sub-skills               1. Keep core files (most-referenced)
                                    (Pattern 3)              2. Rotate peripheral files
                                                             3. Process in passes
                                                             4. May exceed 10-file limit
                                                                (quality degradation risk)
```

**Decision Criteria:**

1. **Use Single Prompt (≤10 files):**
   - Operation affects 10 or fewer files
   - All files can fit in working set
   - Example: Refactor single module

2. **Use @workspace (Read-Only, Any Size):**
   - Discovery and analysis phase
   - Searching across many files
   - Planning refactor scope
   - Understanding dependencies
   - Example: "Find all usages of deprecated API"

3. **Use Decomposition (>10 files, Logical Splits):**
   - Operation affects >10 files
   - Can be divided by module, feature, or layer
   - Each part can be independent or sequential
   - Example: Refactor authentication (25 files across modules)

4. **Use File Prioritization (>10 files, Tightly Coupled):**
   - Operation affects >10 files that must be modified together
   - Cannot easily split into independent batches
   - Keep most-referenced files in working set, rotate others
   - **Risk:** Quality degradation, may not work well
   - Example: Rename a core interface used in 30 files

### File Prioritization Heuristics

When you MUST work with >10 tightly coupled files, prioritize as follows:

**Priority 1: Core/Root Files (Always in Working Set)**
- Root type definitions (interfaces, types)
- Base classes or services
- Files most frequently imported by others
- Configuration files that affect all modules

**Priority 2: Direct Dependents (Rotate in Working Set)**
- Files that directly import from core files
- Process in groups of 3-5 at a time
- Keep core files + batch of dependents ≤10 total

**Priority 3: Peripheral Files (Process Last)**
- Files that import from direct dependents
- Utility files with minimal cross-references
- Test files (can often be batch-updated separately)

**Heuristic Algorithm:**

```
1. Identify core files (≤3 files):
   - Run: grep -r "import.*from.*{core-file}" src/
   - Files with most imports = core files

2. Calculate working set:
   - Core files (3) + Batch of dependents (7) = 10 total

3. Execute in passes:
   - Pass 1: Core files + Batch 1 dependents (10 files)
   - Pass 2: Core files + Batch 2 dependents (10 files)
   - Pass 3: Core files + Batch 3 dependents (10 files)
   - ...continue until all dependents processed

4. Final pass:
   - Core files + Peripheral files (verify consistency)
```

**Example:**

Refactoring `user-types.ts` (core) used by 30 files:

**Working Set Pass 1:**
1. user-types.ts (core)
2. user-service.ts (direct dependent)
3. user-repository.ts (direct dependent)
4. user-controller.ts (direct dependent)
5. user-validator.ts (direct dependent)
6. user-transformer.ts (direct dependent)
7. auth-service.ts (uses user-types)
8. profile-service.ts (uses user-types)
9. admin-controller.ts (uses user-types)
10. user-dto.ts (direct dependent)

**Working Set Pass 2:**
1. user-types.ts (core - keep in all passes)
2. api-user-routes.ts (dependent)
3. api-profile-routes.ts (dependent)
4. middleware-user-auth.ts (dependent)
5. ...continue with next batch

### Known Limitations

1. **Decomposition Overhead:**
   - Requires manual splitting of large skills
   - Developer must understand logical boundaries
   - More prompts to maintain (coordinator + N sub-prompts)
   - Risk of inconsistency across batches

2. **Coordination Complexity:**
   - User must manually execute prompts in sequence
   - No automatic orchestration between batches
   - Progress tracking is manual (PROGRESS.md file)
   - Easy to lose context between batches

3. **Not True Parallelization:**
   - Batches must be sequential (dependencies between parts)
   - Cannot process batches in parallel
   - Each batch requires manual checkpoint (commit)
   - Total time longer than if 10-file limit didn't exist

4. **File Prioritization Risks:**
   - Quality degradation when >10 tightly coupled files
   - May miss cross-file dependencies in rotated-out files
   - Copilot context limited even with prioritization
   - Not reliable for complex refactors (use decomposition instead)

5. **@workspace Limitations:**
   - Good for discovery, but cannot make changes to >10 files
   - Must transition to batched prompts for implementation
   - Context switching between discovery and implementation phases
   - @workspace results may exceed Copilot's ability to act on findings

6. **No Enforcement:**
   - Decomposition pattern is manual (developer-driven)
   - No system to enforce batch boundaries
   - Developer can attempt >10 files and hit quality issues
   - Requires discipline to follow pattern

### Manual Traceability

**Execution Flow: How GitHub Copilot Processes Decomposed Skill**

1. **User Action:** User says "refactor the authentication system"

2. **AI Suggestion:** GitHub Copilot AI:
   - Recognizes this is a large operation (>10 files)
   - May suggest: "This affects many files. Use `/prompt refactor-auth-coordinator` to see the batched approach."

3. **User Reads Coordinator:** User types: `/prompt refactor-auth-coordinator`

4. **Coordinator Loaded:** GitHub Copilot:
   - Loads `.github/prompts/refactor-auth-coordinator.prompt.md`
   - Displays overview showing 4-part decomposition
   - Shows execution order and progress tracking guidance
   - User understands the batched approach

5. **User Starts Part 1:** User types: `/prompt refactor-auth-core`

6. **Part 1 Execution:** GitHub Copilot:
   - Loads `.github/prompts/refactor-auth-core.prompt.md`
   - Reads working set: 8 files in src/auth/
   - Opens files in working set (≤10 file limit)
   - Analyzes files for duplicate logic
   - Standardizes patterns across 8 files
   - Proposes changes

7. **User Reviews and Applies:** User:
   - Reviews proposed changes
   - Applies changes
   - Runs tests: `npm test src/auth/`
   - Creates checkpoint commit

8. **User Continues to Part 2:** User types: `/prompt refactor-auth-api`

9. **Part 2 Execution:** GitHub Copilot:
   - Loads `.github/prompts/refactor-auth-api.prompt.md`
   - Reads working set: 6 API files + 1 reference file (7 total)
   - Opens files in working set
   - Updates API routes to use refactored core from Part 1
   - Proposes changes

10. **Repeat for Parts 3 and 4:**
    - Part 3: Middleware (4 files)
    - Part 4: Models & services (9 files)
    - Each part creates checkpoint commit

11. **Completion:** After Part 4:
    - User runs full test suite
    - Verifies all 25 files refactored successfully
    - Reviews 4 checkpoint commits
    - Marks REFACTOR-PROGRESS.md as complete

**Verification Points:**

- **Before:** `.github/prompts/refactor-auth-*.prompt.md` files exist (5 files)
- **During Part 1:** AI works with exactly 8 files from src/auth/
- **During Part 2:** AI works with exactly 7 files (6 API + 1 reference)
- **During Part 3:** AI works with exactly 4 files (3 middleware + 1 reference)
- **During Part 4:** AI works with exactly 9 files (8 models/services + 1 reference)
- **After Each Part:** Checkpoint commit created, tests pass
- **After Part 4:** All 25 files refactored, full test suite passes

**Debugging:**

If decomposition doesn't work as expected:

1. **File count exceeds 10 in a part:**
   - Review working set in that part's prompt
   - Remove non-essential reference files
   - Split part into sub-parts (Part 2A, Part 2B)

2. **Cross-part dependencies break:**
   - Check that earlier parts completed successfully
   - Review checkpoint commits
   - Ensure reference files (auth-types.ts) in working sets where needed

3. **Quality degradation even with ≤10 files:**
   - Files may be too large (>782 lines)
   - Consider decomposing large files first
   - Use file prioritization within the part

4. **Coordination overhead too high:**
   - Consider if @workspace + manual implementation is faster
   - Evaluate if refactor can be simplified
   - Check if Claude Code or Windsurf would be better suited

---

## Pattern Summary Table

| Pattern Name | Platform | Gap Addressed | Emulation Approach | Key Limitations |
|--------------|----------|---------------|-------------------|-----------------|
| **Skill Emulation** | Windsurf | No skills/subagents (GAP-W1) | Workflows + Model Decision + Persona Rules | No true isolation, no permission enforcement, manual agent activation |
| **Workflow Emulation** | Claude Code | No AI-driven activation, no automatic multi-file context (GAP-C1) | Rich descriptions + Explicit context gathering (Step 0) | Manual invocation required, sequential context loading, no model decision engine |
| **Working Set Limitation** | GitHub Copilot | 10-file working set limit, 20-file context limit (GAP-GH1) | Skill decomposition + Batch processing + File prioritization + Skill chaining + @workspace for discovery | Manual decomposition overhead, sequential-only batches, coordination complexity, no enforcement |

---

## Cross-References

- **GAP-ANALYSIS.md** - Gap #W1 (Subagent Spawning), Gap #GH1 (Working Set Limitations), Gap #C1 (AI-Driven Activation)
- **PLATFORM-ADAPTERS.md** - Section 1 (Claude Code Adapter), Section 2.2 (Windsurf Emulation Patterns), Section 3.2 (GitHub Copilot Emulation Patterns)
- **STANDARD-SCHEMA.md** - Skill field definitions
- **STANDARD-STRUCTURE.md** - Workflow file organization
- **examples/workflow-example.md** - Complete working example of workflow emulation
- **examples/copilot-limited-context.md** - Complete working example of working set limitation pattern

---

## Sources

- RESEARCH-windsurf.md (Windsurf workflow capabilities, model decision triggers, multi-file context)
- RESEARCH-claude-code.md (Claude Code skill system, manual invocation)
- RESEARCH-github-copilot.md (GitHub Copilot working set limits, context constraints, @workspace capabilities)
- GAP-ANALYSIS.md (Capability gaps)
- PLATFORM-ADAPTERS.md (Transformation rules, Claude Code adapter, GitHub Copilot adapter)
