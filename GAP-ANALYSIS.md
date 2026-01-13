# Capability Gap Analysis and Workaround Patterns

**Date:** 2026-01-12
**Purpose:** Identify capability gaps between Claude Code and Windsurf, and propose emulation patterns

---

## Executive Summary

Both Claude Code and Windsurf have unique capabilities that don't directly translate. This document analyzes those gaps and provides workaround patterns to emulate missing features across platforms.

**Priority Ranking:**
1. **HIGH** - Critical for functionality, severely limits portability
2. **MEDIUM** - Important but workarounds exist
3. **LOW** - Nice-to-have, minimal impact on core functionality

---

## Gaps: Missing in Windsurf

### GAP-W1: Subagent Spawning
**Priority:** 🔴 HIGH
**Claude Code Feature:** Task tool spawns parallel subagents with isolated contexts
**Windsurf Limitation:** No subagent support, single Cascade context only

**Impact:**
- Cannot delegate tasks to specialized agents
- Cannot execute parallel research/work
- All work must be sequential in single context
- Context degradation from long-running sessions

**Workaround Pattern:**

```yaml
# Strategy 1: Sequential Execution with Context Markers
---
trigger: manual
description: Emulate subagent work with context isolation markers
---

# Research Task Emulation

## Phase 1: Research (Simulated Subagent 1)
[CONTEXT: Acting as research agent with read-only focus]
- Search codebase for authentication patterns
- Document findings in RESEARCH.md
[END CONTEXT]

## Phase 2: Implementation (Simulated Subagent 2)
[CONTEXT: Acting as implementation agent with write access]
- Implement authentication based on RESEARCH.md
- Create necessary files
[END CONTEXT]

## Phase 3: Verification (Simulated Subagent 3)
[CONTEXT: Acting as test agent]
- Run tests on authentication
- Verify implementation
[END CONTEXT]
```

```yaml
# Strategy 2: Multiple Workflow Files (Pseudo-Parallel)
# File: .windsurf/workflows/research-auth.md
---
description: Research authentication patterns
---
Search codebase and document findings in RESEARCH-auth.md

# File: .windsurf/workflows/implement-auth.md
---
description: Implement authentication
---
Read RESEARCH-auth.md and implement based on findings

# File: .windsurf/workflows/test-auth.md
---
description: Test authentication
---
Verify authentication implementation

# User runs: /research-auth, then /implement-auth, then /test-auth
```

**Limitations:**
- Not truly parallel (sequential only)
- No isolated contexts (risk of context pollution)
- Requires manual workflow orchestration
- Cannot maintain separate conversation threads

**See Also:** [WORKAROUND-PATTERNS.md - Pattern 1: Skill Emulation](WORKAROUND-PATTERNS.md#pattern-1-skill-emulation-for-windsurf) - Complete implementation guide with examples

---

### GAP-W2: Granular Permission Control
**Priority:** 🟡 MEDIUM
**Claude Code Feature:** Fine-grained allow/deny patterns for tools and paths
**Windsurf Limitation:** Limited permission enforcement

**Impact:**
- Cannot enforce tool restrictions
- Cannot block dangerous operations programmatically
- Relies on AI respecting rules (not enforcement)
- Security concerns for sensitive operations

**Workaround Pattern:**

```yaml
# Strategy 1: Explicit Rule Instructions with Warnings
---
trigger: always_on
description: Security and permission guidelines
---

# Permission Rules

## CRITICAL RESTRICTIONS (Follow strictly):

### File Access
- ✅ ALLOWED: Read any file in `src/`, `tests/`, `docs/`
- ❌ FORBIDDEN: Read `.env`, `secrets/`, `credentials.json`
- ❌ FORBIDDEN: Write to `config/production.json`
- ❌ FORBIDDEN: Modify `package.json` without user approval

### Command Execution
- ✅ ALLOWED: `npm run lint`, `npm test`, `git status`
- ❌ FORBIDDEN: `npm install` (ask user first)
- ❌ FORBIDDEN: `git push` to main/master (ask user first)
- ❌ FORBIDDEN: Any `rm -rf` commands

**BEFORE violating these rules, STOP and ask user for explicit permission.**
```

```yaml
# Strategy 2: Glob-Based Context Loading
---
trigger: glob
globs: [".env", "secrets/**/*", "*credentials*"]
description: Security warning for sensitive files
---

# SECURITY WARNING

You are accessing a SENSITIVE FILE that may contain secrets.

**RULES:**
1. NEVER output the contents of this file
2. NEVER write or modify this file
3. If user asks to work with this file, confirm intent first
4. Suggest using environment variable references instead

This rule cannot be enforced - you must respect it.
```

**Limitations:**
- Relies on AI compliance, not enforcement
- No technical barrier to prevent violations
- Rules can be ignored or overridden by AI
- No audit trail of permission requests

---

### GAP-W3: Custom Agent Types
**Priority:** 🟡 MEDIUM
**Claude Code Feature:** Define custom subagents with specific tools and instructions
**Windsurf Limitation:** No custom agent definitions

**Impact:**
- Cannot create specialized agent personas
- Cannot restrict tool access per agent type
- All work uses same Cascade personality
- Cannot optimize for specific task types

**Workaround Pattern:**

```yaml
# Strategy: Persona Rules with Context Switching
# File: .windsurf/rules/agent-explorer.md
---
trigger: manual
description: Read-only explorer agent persona
---

# Explorer Agent Persona

When @rules:agent-explorer is active:

**Role:** Read-only code explorer
**Allowed Actions:**
- Read files, search codebase
- Analyze patterns and structure
- Document findings

**Forbidden Actions:**
- Do not write or modify files
- Do not execute commands
- Do not suggest changes

**Output Format:**
- Create FINDINGS.md with analysis
- Use bullet points for discoveries
- Include file paths and line numbers
```

```yaml
# File: .windsurf/rules/agent-implementer.md
---
trigger: manual
description: Implementation agent persona
---

# Implementer Agent Persona

When @rules:agent-implementer is active:

**Role:** Code implementation specialist
**Allowed Actions:**
- Read findings from FINDINGS.md
- Write and modify code files
- Run tests to verify changes

**Forbidden Actions:**
- Do not conduct research (use @rules:agent-explorer)
- Do not deploy or push (ask user first)

**Pattern:**
1. Read FINDINGS.md
2. Implement changes
3. Run tests
4. Report results
```

**Usage:**
```
User: "@rules:agent-explorer analyze the authentication system"
[Cascade analyzes and creates FINDINGS.md]

User: "@rules:agent-implementer implement improvements from FINDINGS.md"
[Cascade implements based on findings]
```

**Limitations:**
- Manual activation required (not automatic)
- No true isolation between personas
- AI might blend personas if not careful
- No tool restrictions enforced

---

### GAP-W4: Skill Customization Layer
**Priority:** 🟢 LOW
**Claude Code Feature:** SKILLCUSTOMIZATIONS/ for user-specific extensions
**Windsurf Limitation:** No customization overlay system

**Impact:**
- Cannot extend base workflows without modifying them
- Team workflows and personal preferences conflict
- Difficult to maintain upstream updates

**Workaround Pattern:**

```yaml
# Strategy: Personal Rules That Override Defaults
# File: .windsurf/rules/personal-overrides.md (gitignored)
---
trigger: always_on
description: Personal preferences and overrides
---

# Personal Overrides

These rules override team defaults:

## Testing Preferences
- Use `npm run test:watch` instead of `npm test`
- Skip integration tests during rapid development

## Commit Style
- Prefer detailed commit messages over brief ones
- Include ticket numbers in format: [PROJ-123]

## Code Style
- Use single quotes (override team's double quotes)
- Prefer arrow functions over function keyword
```

**Setup:**
```bash
# Add to .gitignore
echo ".windsurf/rules/personal-overrides.md" >> .gitignore

# Team shares base rules, individuals add personal overrides
```

**Limitations:**
- Must manually maintain gitignore
- No merge mechanism for base + personal
- Can't selectively override specific rules
- All-or-nothing rule application

---

### GAP-W5: Progressive Disclosure
**Priority:** 🟢 LOW
**Claude Code Feature:** Layered context loading (Level 1, 2, 3+)
**Windsurf Limitation:** No progressive loading system

**Impact:**
- All workflow content loaded immediately
- Cannot defer loading of detailed resources
- 12,000 character limit makes this less critical

**Workaround Pattern:**

```yaml
# Strategy: Reference External Documentation
# File: .windsurf/workflows/complex-workflow.md
---
description: Complex workflow with detailed steps
---

# Complex Workflow

## Quick Start
1. Run initial setup
2. Execute main tasks
3. Verify completion

## Detailed Instructions
For detailed step-by-step instructions, see:
- `docs/workflows/complex-workflow-details.md`
- `docs/workflows/troubleshooting.md`

## Reference Materials
Load as needed:
- API documentation: `docs/api/README.md`
- Code examples: `examples/complex-workflow/`
```

**Limitations:**
- Requires manual file reading
- No automatic context loading
- AI must explicitly read referenced files
- Adds overhead to workflow execution

---

### GAP-W6: Lifecycle Hook System
**Priority:** 🟡 MEDIUM
**Claude Code Feature:** Comprehensive hooks (PreToolUse, PostToolUse, Stop, etc.)
**Windsurf Limitation:** Limited event system

**Impact:**
- Cannot intercept tool execution
- Cannot run cleanup on session end
- Cannot validate inputs before execution
- Limited automation opportunities

**Workaround Pattern:**

```yaml
# Strategy: Explicit Workflow Steps with Validation
# File: .windsurf/workflows/safe-commit.md
---
description: Git commit with pre-commit validation
---

# Safe Commit Workflow

## Pre-Commit Validation (Manual Hook)
Before committing:
1. Run linter: `npm run lint`
2. Run tests: `npm test`
3. Check for secrets: grep -r "API_KEY" src/
4. STOP if any validation fails

## Commit
If all validations pass:
```bash
git add .
git commit -m "$1"
```

## Post-Commit Actions (Manual Hook)
After commit:
1. Show commit summary: `git log -1`
2. Check branch status: `git status`
3. Remind user to push if needed
```

```yaml
# Strategy: Always-On Rule for Validation Reminders
# File: .windsurf/rules/validation-reminders.md
---
trigger: always_on
description: Remind about validation before operations
---

# Validation Reminders

Before executing these operations, ALWAYS:

**Before `git commit`:**
- Run linter
- Run tests
- Check for sensitive data

**Before `npm install`:**
- Review package being installed
- Check for known vulnerabilities
- Confirm with user

**After writing code:**
- Run relevant tests
- Check for TypeScript errors
- Verify formatting
```

**Limitations:**
- Manual compliance, not automatic
- No technical enforcement
- Easy to forget validation steps
- No rollback mechanism

---

## Gaps: Missing in Claude Code

### GAP-C1: AI-Driven Rule Activation (Model Decision)
**Priority:** 🟡 MEDIUM
**Windsurf Feature:** AI decides when to activate rules based on context
**Claude Code Limitation:** Rules always active or manually invoked

**Impact:**
- Rules are either always-on or require explicit invocation
- Cannot have context-aware rule activation
- Clutters context with potentially irrelevant rules

**Workaround Pattern:**

```yaml
# Strategy: Multiple Specific Skills with Clear Descriptions
# File: ~/.claude/skills/python-style/SKILL.md
---
name: python-style
description: USE WHEN working with Python files. Provides Python style guidelines and best practices.
---

# Python Style Guide

[Python-specific instructions]
```

```yaml
# File: ~/.claude/skills/javascript-style/SKILL.md
---
name: javascript-style
description: USE WHEN working with JavaScript or TypeScript files. Provides JS/TS style guidelines.
---

# JavaScript Style Guide

[JavaScript-specific instructions]
```

**How it works:**
- Claude's auto-invoke matches description to context
- `USE WHEN` pattern helps Claude decide relevance
- More specific descriptions = better auto-activation

**Limitations:**
- Less sophisticated than true AI decision
- Based on description matching, not deep context analysis
- May activate when not needed or miss activation
- Relies on skill description quality

---

### GAP-C2: Cascade Memories (Pattern Learning)
**Priority:** 🟡 MEDIUM
**Windsurf Feature:** Learns patterns across sessions
**Claude Code Limitation:** No persistent memory/learning

**Impact:**
- Cannot learn user preferences over time
- Repeats same questions across sessions
- No pattern recognition across projects

**Workaround Pattern:**

```yaml
# Strategy: Explicit Preference Documentation
# File: CLAUDE.local.md (gitignored personal preferences)

# My Personal Preferences

## Code Style
- I prefer arrow functions over function keyword
- I use single quotes for strings
- I prefer detailed commit messages

## Development Workflow
- I always run tests before committing
- I prefer feature branches over main
- I like to see diffs before approving changes

## Recent Project Patterns
*(Update this manually as you discover patterns)*

### Authentication Pattern (2026-01-12)
- Using JWT tokens stored in httpOnly cookies
- Refresh tokens in Redis with 7-day expiration
- Access tokens expire in 15 minutes

### Database Pattern (2026-01-10)
- Using Prisma ORM with PostgreSQL
- Migrations in `prisma/migrations/`
- Seed data in `prisma/seed.ts`
```

```yaml
# Strategy: Session State Files
# File: .claude/state/project-context.json

{
  "lastWorkingArea": "authentication-module",
  "recentDecisions": [
    {
      "date": "2026-01-12",
      "decision": "Use bcrypt for password hashing",
      "rationale": "More secure than basic SHA-256"
    }
  ],
  "preferredPatterns": {
    "testing": "Jest with React Testing Library",
    "styling": "Tailwind CSS",
    "stateManagement": "Zustand"
  }
}
```

**Usage in Skill:**
```yaml
---
name: context-loader
description: Load project context and user preferences at session start
---

# Context Loader

Read the following files to understand context:
1. `CLAUDE.local.md` - User preferences
2. `.claude/state/project-context.json` - Project state
3. `STATE.md` - Current project status

Apply these preferences and patterns throughout the session.
```

**Limitations:**
- Manual updates required
- No automatic pattern detection
- Can become stale if not maintained
- No cross-project learning

---

### GAP-C3: Multiple Simultaneous Conversations
**Priority:** 🟢 LOW
**Windsurf Feature:** Multiple Cascade conversations in parallel
**Claude Code Limitation:** Single session per project

**Impact:**
- Cannot work on multiple features simultaneously
- Cannot compare approaches in parallel
- Must finish one conversation before starting another

**Workaround Pattern:**

```bash
# Strategy: Multiple Terminal Windows/Sessions
# Terminal 1: Working on Feature A
cd ~/project
claude code

# Terminal 2: Working on Feature B (different directory context)
cd ~/project-feature-b
claude code

# Or use named sessions (if supported)
claude code --session feature-a
claude code --session feature-b
```

```yaml
# Strategy: Session State Management
# File: .claude/skills/session-manager/SKILL.md
---
name: session-manager
description: Manage multiple work streams by saving/loading session state
---

# Session Manager

## Save Session State
When switching contexts:
1. Document current work in `SESSION-[feature-name].md`
2. Commit current changes
3. Note next steps in file

## Load Session State
When resuming:
1. Read `SESSION-[feature-name].md`
2. Review current changes since last session
3. Continue from noted next steps
```

**Limitations:**
- Requires manual session management
- Not truly parallel (must switch between sessions)
- Context switching overhead
- State management burden on user

---

### GAP-C4: Native IDE Integration
**Priority:** 🟢 LOW
**Windsurf Feature:** Built-in IDE with integrated AI
**Claude Code Limitation:** CLI-first, relies on external editor

**Impact:**
- Must switch between terminal and editor
- Less seamless inline assistance
- More manual file navigation

**Workaround Pattern:**

```yaml
# Strategy: Optimize CLI Workflow
# File: ~/.claude/skills/editor-integration/SKILL.md
---
name: editor-integration
description: Optimize workflows for external editor usage
---

# Editor Integration Patterns

## When making changes:
1. Use Edit tool to show exact changes
2. Provide file path with line numbers
3. User can jump to location in editor

## For large refactors:
1. Create `REFACTOR-PLAN.md` with all changes
2. List files and specific line numbers
3. User can work through plan in editor

## Output format:
Always include: `file.ts:123` format for clickable links
```

**Limitations:**
- Not as seamless as native IDE
- Requires context switching
- Cannot see editor state directly
- Manual synchronization needed

---

## Gaps: Missing in GitHub Copilot

### GAP-GH1: Working Set and Context Limitations
**Priority:** 🔴 HIGH
**Claude Code/Windsurf Feature:** Unlimited working sets and files
**GitHub Copilot Limitation:** 10 file max working set, 6,000 char context window, 20 file max context

**Impact:**
- Severely limits large-scale refactoring
- Cannot work effectively on larger projects
- Quality degrades quickly on medium-sized features
- Community considering alternatives due to restrictions

**Workaround Pattern:**

```yaml
# Strategy: Sequential Batch Processing
# Break large refactors into multiple smaller working sets

## Batch 1 (Files 1-10):
# Phase 1: Core authentication files
- src/auth/login.ts
- src/auth/register.ts
- src/auth/session.ts
- src/auth/middleware.ts
- src/auth/types.ts
- src/auth/utils.ts
- src/auth/validators.ts
- src/auth/errors.ts
- tests/auth/login.test.ts
- tests/auth/register.test.ts

## Batch 2 (Files 11-20):
# Phase 2: Integration points
- src/api/routes/auth.ts
- src/api/controllers/user.ts
# ... continue with next 10 files
```

```markdown
# Strategy: Incremental Refactoring with Checkpoints

## Workflow:
1. Identify refactoring scope
2. Break into 10-file chunks
3. Refactor Batch 1, commit
4. Refactor Batch 2, commit
5. Continue until complete
6. Final integration pass

## Benefits:
- Works within Copilot limits
- Git history shows clear progression
- Can rollback individual batches
- Easier code review
```

**Limitations:**
- Time-consuming manual batching
- Risk of inconsistencies across batches
- Cannot see full picture in single view
- Breaks flow state

---

### GAP-GH2: Lifecycle Hooks
**Priority:** 🟡 MEDIUM
**Claude Code Feature:** 10+ customizable lifecycle hooks (PreToolUse, PostToolUse, etc.)
**GitHub Copilot Limitation:** No configurable lifecycle hooks

**Impact:**
- Cannot automate pre/post-execution workflows
- Cannot validate before tool use
- Cannot provide feedback after tool use
- Limited automation opportunities

**Workaround Pattern:**

```yaml
# Strategy: Explicit Workflow Steps in Custom Instructions
# File: .github/copilot-instructions.md

# Workflow Validation Standards

## Before Making Changes:
Always perform these steps BEFORE editing files:
1. Run linter to check current state
2. Run tests to establish baseline
3. Review related files for dependencies

## After Making Changes:
Always perform these steps AFTER editing files:
1. Run linter to check for issues
2. Run tests to verify no regressions
3. Show summary of changes made

## Before Git Operations:
BEFORE running `git commit`:
1. Run full test suite
2. Check for sensitive data (API keys, passwords)
3. Verify commit message follows conventions
```

```yaml
# Strategy: Custom Prompt for Validation
# File: .github/prompts/safe-refactor.prompt.md

# Safe Refactoring Protocol

Follow this protocol for all refactoring:

**Pre-Refactor Checklist:**
- [ ] Tests pass
- [ ] Linter clean
- [ ] No TypeScript errors

**Refactoring:**
[Make changes]

**Post-Refactor Validation:**
- [ ] Tests still pass
- [ ] Linter still clean
- [ ] No new TypeScript errors
- [ ] Manual smoke test completed

**Rollback Plan:**
If validation fails: `git checkout -- .`
```

**Limitations:**
- Manual compliance required
- No automatic enforcement
- Easy to skip steps
- No technical barrier to prevent violations

---

### GAP-GH3: Large File Handling
**Priority:** 🟡 MEDIUM
**Claude Code Feature:** No file size limits
**GitHub Copilot Limitation:** Quality degrades >782 lines, significant problems >5,000 lines

**Impact:**
- Cannot effectively refactor large files
- Poor suggestions on complex files
- May cut files in half
- Forces artificial file splitting

**Workaround Pattern:**

```yaml
# Strategy: File Decomposition
# Before refactoring large file, decompose it

## Step 1: Analyze Large File
Identify logical boundaries in large file:
- Class/module definitions
- Related function groups
- Data structures and types

## Step 2: Extract Modules
Create separate files for each logical unit:
- user-service.ts (core logic)
- user-types.ts (type definitions)
- user-validators.ts (validation functions)
- user-utils.ts (helper functions)

## Step 3: Update Imports
Refactor imports to use new structure

## Step 4: Refactor Smaller Files
Now each file is <500 lines and Copilot works well
```

```yaml
# Strategy: Window-Based Editing
# For files that must stay large

## Approach:
1. Open only the section you're editing
2. Use Copilot on that section
3. Close and save
4. Open next section
5. Repeat

## Keep Context Small:
- Work on one function at a time
- Minimize visible code
- Use "fold" features to hide irrelevant sections
```

**Limitations:**
- Artificial file splitting may harm architecture
- Window-based editing is tedious
- Loses full-file context
- Not suitable for all refactorings

---

### GAP-GH4: Multi-Repository Support
**Priority:** 🟢 LOW
**Claude Code Feature:** Can work across multiple repositories
**GitHub Copilot Limitation:** Agent can only modify single repository, opens exactly 1 PR per task

**Impact:**
- Cannot coordinate changes across multiple repos
- Microservice refactorings require multiple tasks
- Shared library updates need separate runs

**Workaround Pattern:**

```bash
# Strategy: Sequential Multi-Repo Execution

## Workflow:
1. Create task list for all affected repos
2. Run Copilot Agent on Repo 1, create PR
3. Run Copilot Agent on Repo 2, create PR
4. Run Copilot Agent on Repo 3, create PR
5. Merge PRs in dependency order

## Coordination:
- Document cross-repo dependencies in each PR
- Link PRs together in descriptions
- Merge in correct order (dependencies first)
```

```markdown
# Strategy: Monorepo Migration (if feasible)

If multi-repo coordination is frequent pain point:
1. Consider migrating to monorepo
2. Single repository = single Copilot run
3. Atomic cross-package changes
4. Better for tightly-coupled services

Trade-offs:
+ Single PR for cross-service changes
+ Easier refactoring
- Larger repository
- May not fit all architectures
```

**Limitations:**
- Monorepo not always feasible
- Sequential execution is slow
- Risk of inconsistencies if PRs merge out of order
- Manual coordination required

---

## Workaround Pattern Library

### Pattern 1: Emulating Claude Skills in Windsurf

**Goal:** Make Claude Code skills work in Windsurf

**Approach:**
```yaml
# Original Claude Skill: ~/.claude/skills/commit/SKILL.md
---
name: commit
description: Create conventional git commits
allowed-tools: Bash(git *)
---

# Commit Skill
[Instructions for creating commits]
```

**Windsurf Translation:**
```yaml
# .windsurf/workflows/commit.md
---
description: Create conventional git commits
labels: git, automation
trigger: manual
---

# Commit Workflow
[Same instructions from Claude skill]

# Invoke with: /commit
```

**Key Changes:**
1. Move to `.windsurf/workflows/`
2. Filename becomes command name
3. Remove `allowed-tools` (not enforced)
4. Add `trigger` and `labels`
5. Keep instructions identical

---

### Pattern 2: Emulating Windsurf Workflows in Claude Code

**Goal:** Make Windsurf workflows work in Claude Code

**Approach:**
```yaml
# Original Windsurf Workflow: .windsurf/workflows/deploy.md
---
trigger: manual
description: Deploy to production
labels: deployment
---

# Deploy
[Deployment instructions]
```

**Claude Translation:**
```yaml
# .claude/skills/deploy/SKILL.md
---
name: deploy
description: Deploy to production
allowed-tools: Bash
---

# Deploy Skill
[Same instructions from Windsurf workflow]
```

**Alternative (simpler):**
```yaml
# .claude/commands/deploy.md
---
description: Deploy to production
allowed-tools: Bash
---

[Same instructions from Windsurf workflow]
```

**Key Changes:**
1. Choose between skill (complex) or command (simple)
2. Add skill structure if using skills
3. Add `allowed-tools` for safety
4. Remove Windsurf-specific fields
5. Keep instructions identical

---

### Pattern 3: Emulating Windsurf Always-On Rules in Claude

**Goal:** Make Windsurf always-on rules work in Claude Code

**Approach:**
```yaml
# Original Windsurf Rule: .windsurf/rules/code-style.md
---
trigger: always_on
description: Code style guidelines
---

# Code Style
- Use single quotes
- Prefer const over let
```

**Claude Translation:**
```markdown
# CLAUDE.md (add to project root)

# Code Style
- Use single quotes
- Prefer const over let
```

**Key Changes:**
1. Combine all always-on rules into CLAUDE.md
2. Remove front matter (optional in CLAUDE.md)
3. Keep instructions identical
4. CLAUDE.md is always loaded (like always_on)

---

### Pattern 4: Emulating Windsurf Glob Triggers in Claude

**Goal:** Activate rules based on file patterns

**Approach:**
```yaml
# Original Windsurf Rule: .windsurf/rules/python-rules.md
---
trigger: glob
globs: ["*.py", "**/*.py"]
description: Python-specific rules
---

# Python Rules
[Python instructions]
```

**Claude Translation:**
```yaml
# .claude/skills/python-rules/SKILL.md
---
name: python-rules
description: USE WHEN working with Python files (*.py). Python-specific coding rules and standards.
---

# Python Rules
[Same Python instructions]
```

**Key Changes:**
1. Use "USE WHEN" with file pattern in description
2. Claude's auto-invoke will activate for Python work
3. Less precise than glob, but functional
4. Relies on context matching

---

### Pattern 5: Cross-Platform CLAUDE.md/Rules Strategy

**Goal:** Single source of truth for project instructions

**Approach:**
```markdown
# CLAUDE.md (works in both!)

# Project Instructions

## Code Style
- Use TypeScript strict mode
- Prefer functional programming
- Use Tailwind for styling

## Testing
- Jest for unit tests
- Playwright for E2E
- 80% coverage minimum

## Git Workflow
- Conventional commits
- Feature branches
- Squash merge to main
```

**Windsurf Supplement:**
```yaml
# .windsurf/rules/claude-md-loader.md
---
trigger: always_on
description: Load CLAUDE.md as base rules
---

# Project Rules

Follow all instructions in the root CLAUDE.md file.
See @CLAUDE.md for complete project guidelines.
```

**Benefits:**
- Single file for basic project rules
- Works in both platforms
- Version controlled
- Team can share

---

### Pattern 6: Shared Workflow Format

**Goal:** Write once, run everywhere

**Standard Template:**
```yaml
# Header comment: Works in Claude Code as skill or Windsurf as workflow
# ---
# Claude Code: Place in .claude/skills/SKILL-NAME/SKILL.md with name: field
# Windsurf: Place in .windsurf/workflows/WORKFLOW-NAME.md
# ---
name: standard-workflow              # Claude only
description: Standard workflow that works on both platforms
allowed-tools: Read,Write,Bash       # Claude only (ignored by Windsurf)
trigger: manual                      # Windsurf only (ignored by Claude)
labels: cross-platform, standard     # Windsurf only (ignored by Claude)
---

# Standard Workflow

This workflow works on both Claude Code and Windsurf.

[Platform-agnostic instructions]

## Platform-Specific Notes

**Claude Code:** Uses allowed-tools for permission control
**Windsurf:** Invoke with /workflow-name
```

**Benefits:**
- Portable across platforms
- Extra metadata ignored by each platform
- Clear documentation of platform differences
- Single source for logic

---

## Priority Gap Summary

### High Priority (Must Address)
1. **GAP-W1: Subagent Spawning** (Windsurf) - Sequential workflow emulation
2. **GAP-GH1: Working Set Limitations** (GitHub Copilot) - Sequential batch processing
3. *No high-priority gaps in Claude Code*

### Medium Priority (Important)
**Windsurf:**
1. **GAP-W2: Granular Permissions** - Explicit rule instructions
2. **GAP-W3: Custom Agent Types** - Persona rules
3. **GAP-W6: Lifecycle Hooks** - Manual validation steps

**GitHub Copilot:**
4. **GAP-GH2: Lifecycle Hooks** - Explicit workflow steps in instructions
5. **GAP-GH3: Large File Handling** - File decomposition or window-based editing

**Claude Code:**
6. **GAP-C1: AI-Driven Activation** - Better descriptions
7. **GAP-C2: Pattern Learning** - Manual preference docs

### Low Priority (Nice-to-Have)
1. **GAP-W4: Customization Layer** (Windsurf) - Personal override rules
2. **GAP-W5: Progressive Disclosure** (Windsurf) - Reference external docs
3. **GAP-C3: Multiple Conversations** (Claude Code) - Session management
4. **GAP-C4: Native IDE** (Claude Code) - Optimized CLI workflow
5. **GAP-GH4: Multi-Repository Support** (GitHub Copilot) - Sequential multi-repo execution

---

## Platform Gap Overview

| Platform | High Priority Gaps | Medium Priority Gaps | Low Priority Gaps |
|----------|-------------------|---------------------|------------------|
| **Claude Code** | 0 | 2 | 2 |
| **Windsurf** | 1 | 3 | 2 |
| **GitHub Copilot** | 1 | 2 | 1 |

**Analysis:**
- **Claude Code** has the fewest and least severe gaps (most complete feature set)
- **Windsurf** has the most medium-priority gaps (missing core features like subagents, permissions, hooks)
- **GitHub Copilot** has one critical gap (working set limits) that significantly impacts usability

---

## Next Steps for Phase 2

Based on this gap analysis covering **three platforms** (Claude Code, Windsurf, GitHub Copilot), Phase 2 (Standard Template Design) should focus on:

1. **Choose Standard Format:**
   - **Option A:** Claude Code as base (most complete, preserves maximum features)
   - **Option B:** Intersection standard (only features all three platforms support)
   - **Option C:** Superset standard (include all features with platform tags)
   - **Recommendation:** Option C (Superset) allows maximum expressiveness with clear platform compatibility markers

2. **Define Required Fields:**
   - Minimal common fields all three platforms support
   - Optional fields for platform-specific features (tagged with platform)
   - Clear documentation showing feature compatibility matrix

3. **Workaround Documentation:**
   - Document emulation patterns for each gap
   - Provide conversion examples for all three platforms
   - Test patterns on real projects

4. **File Structure:**
   - Standard directory layout compatible with all platforms
   - Naming conventions (avoid platform-specific restrictions)
   - Metadata schema supporting all three frontmatter formats

5. **Platform Tags:**
   - Define tagging system for platform-specific features
   - Example: `platforms: [claude-code, windsurf]` or `copilot-only: true`
   - Enable tools to filter/adapt based on target platform

---

## Sources

- RESEARCH-claude-code.md
- RESEARCH-windsurf.md
- RESEARCH-github-copilot.md
- CAPABILITY-MATRIX.md
- TERMINOLOGY-MAPPING.md
- Real-world testing and analysis
- Community feedback and issue trackers
