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

## Pattern Summary Table

| Pattern Name | Platform | Gap Addressed | Emulation Approach | Key Limitations |
|-------------|----------|---------------|-------------------|-----------------|
| **Skill Emulation** | Windsurf | No skills/subagents | Workflows + Model Decision + Persona Rules | No true isolation, no permission enforcement, manual agent activation |

---

## Cross-References

- **GAP-ANALYSIS.md** - Gap #W1 (Subagent Spawning)
- **PLATFORM-ADAPTERS.md** - Section 2.2 (Windsurf Emulation Patterns)
- **STANDARD-SCHEMA.md** - Skill field definitions

---

## Sources

- RESEARCH-windsurf.md (Windsurf workflow capabilities)
- RESEARCH-claude-code.md (Claude Code skill system)
- GAP-ANALYSIS.md (Capability gaps)
- PLATFORM-ADAPTERS.md (Transformation rules)
