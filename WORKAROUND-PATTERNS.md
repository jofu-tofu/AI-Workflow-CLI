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

**Gap:** Windsurf does not have Claude Code's "skills" feature - reusable, composable AI instructions that can be invoked by name and support subagent spawning.

**Reference:** GAP-ANALYSIS.md Gap #W1 (Subagent Spawning)

**Impact:**
- Cannot create reusable command-like AI behaviors
- Cannot delegate tasks to specialized agents
- Cannot spawn isolated execution contexts
- All work must be done in single Cascade session

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

**Reference:** PLATFORM-ADAPTERS.md Section 4.1 (Claude Code Adapter)

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
- **PLATFORM-ADAPTERS.md** - Section 4.1 (Claude Code Adapter) - Workflow transformation rules
- **STANDARD-SCHEMA.md** - Skill field definitions
- **STANDARD-STRUCTURE.md** - Workflow file organization
- **examples/workflow-example.md** - Complete working example of workflow emulation

---

## Sources

- RESEARCH-windsurf.md (Windsurf workflow capabilities, model decision triggers, multi-file context)
- RESEARCH-claude-code.md (Claude Code skill system, manual invocation)
- GAP-ANALYSIS.md (Capability gaps)
- PLATFORM-ADAPTERS.md (Transformation rules, Claude Code adapter)
