# Example: Windsurf Workflow → Claude Code Skill

**Purpose:** Demonstrates how to convert a Windsurf workflow with AI-driven activation and multi-file context into a Claude Code skill.

---

## Original Windsurf Workflow

**File:** `.windsurf/workflows/refactor-components.md`

```yaml
---
description: USE WHEN refactoring React components for better modularity and reusability
trigger: model_decision
globs:
  - "src/components/**/*.tsx"
  - "src/components/**/*.ts"
labels:
  - refactoring
  - react
  - components
author: "Engineering Team"
---

# Refactor Components Workflow

## Context

This workflow analyzes multiple React component files to identify refactoring opportunities, extract shared logic, and improve component modularity.

## Prerequisites

Windsurf's multi-file context automatically gathers:
- All components in src/components/
- Related hooks and utilities
- Component test files
- Shared types and interfaces

## Workflow Steps

### Step 1: Component Analysis
Analyze all components in src/components/ to:
- Identify duplicate logic patterns
- Find components violating Single Responsibility Principle
- Locate shared UI patterns that could be extracted

### Step 2: Extraction Planning
Create refactoring plan:
- List components to be split
- Identify shared hooks to extract
- Document new component hierarchy

### Step 3: Implementation
Execute refactoring:
- Extract shared logic to custom hooks
- Split large components into smaller ones
- Create shared UI components
- Update imports across files

### Step 4: Verification
Ensure refactoring success:
- Run TypeScript compiler to check types
- Execute tests to verify functionality
- Review component tree for improved structure

## AI Activation Triggers

This workflow activates when user mentions:
- "refactor components"
- "improve component structure"
- "extract shared logic"
- "split this component"
- "modularize React code"

Cascade's model decision engine evaluates context and activates this workflow automatically.
```

---

## Adapted Claude Code Skill

**File:** `.claude/skills/refactor-components/SKILL.md`

```yaml
---
name: refactor-components
description: >
  USE WHEN refactoring React components for better modularity and reusability.
  Analyzes component structure, extracts shared logic, and improves modularity.
  Activate when user mentions: refactor components, improve component structure,
  extract shared logic, split components, or modularize React code.
version: "1.0.0"
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(npm run tsc)
  - Bash(npm test)
context: inherit
permissions:
  allow:
    - Read(src/components/**/*.tsx)
    - Read(src/components/**/*.ts)
    - Read(src/hooks/**/*.ts)
    - Read(src/types/**/*.ts)
    - Write(src/components/**/*.tsx)
    - Write(src/hooks/**/*.ts)
  deny:
    - Write(src/components/index.ts)
---

# Refactor Components Skill

## Purpose

Analyze React component structure to identify refactoring opportunities, extract shared logic, and improve component modularity.

**Emulated Multi-File Context:** This skill replicates Windsurf's multi-file awareness by explicitly gathering context from related files before proceeding with refactoring steps.

---

## Context Gathering Protocol

**IMPORTANT:** Before beginning refactoring analysis, gather comprehensive context:

### Step 0: Multi-File Context Acquisition

Execute these Read/Grep operations to simulate Windsurf's automatic multi-file context:

1. **List all component files:**
   ```bash
   Glob: src/components/**/*.tsx
   Glob: src/components/**/*.ts
   ```

2. **Identify related hooks:**
   ```bash
   Grep: pattern="export.*use[A-Z]" path="src/hooks/"
   ```

3. **Find shared types:**
   ```bash
   Read: src/types/components.ts
   Read: src/types/common.ts
   ```

4. **Locate component tests:**
   ```bash
   Glob: src/components/**/*.test.tsx
   ```

**Context Checklist:**
- [ ] All component files identified
- [ ] Related hooks discovered
- [ ] Shared types loaded
- [ ] Test files mapped

**Only proceed to analysis once context gathering is complete.**

---

## Workflow Steps

### Step 1: Component Analysis

Analyze gathered components to:
- Identify duplicate logic patterns
- Find components violating Single Responsibility Principle
- Locate shared UI patterns that could be extracted

**Files to examine:**
- All files from Step 0 context gathering
- Focus on components with >150 lines
- Components with similar naming patterns (e.g., UserCard, ProductCard, OrderCard)

### Step 2: Extraction Planning

Create refactoring plan document: `REFACTORING-PLAN.md`

Include:
- Components to be split (with rationale)
- Shared hooks to extract (with proposed names)
- New component hierarchy diagram
- Impact assessment (which files will change)

**Ask user for approval before proceeding.**

### Step 3: Implementation

Execute refactoring based on approved plan:

1. Extract shared logic to custom hooks
2. Split large components into smaller ones
3. Create shared UI components
4. Update imports across files

**Work incrementally:**
- Refactor one component at a time
- Commit after each successful refactoring
- Run tests between changes

### Step 4: Verification

Ensure refactoring success:

```bash
# Type check
npm run tsc

# Run tests
npm test
```

**Verification checklist:**
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] No duplicate logic remains
- [ ] Component tree improved
- [ ] Imports updated correctly

---

## Activation Instructions

**Manual Invocation (Required):**

Unlike Windsurf's automatic activation, this skill must be manually invoked.

**When to invoke this skill:**

Use this skill when user mentions any of these phrases:
- "refactor components"
- "improve component structure"
- "extract shared logic"
- "split this component"
- "modularize React code"
- "clean up components"

**Invocation command:** `/refactor-components`

**Description-based matching:** The skill's `description` field includes trigger keywords that help AI determine relevance, but the user must still explicitly invoke the skill.

---

## Multi-File Context Simulation

**Windsurf Capability:** Automatic multi-file context awareness
**Claude Code Emulation:** Explicit context gathering via Read/Grep/Glob

### Context Gathering Strategy

Instead of Windsurf's automatic multi-file loading, this skill uses explicit context gathering:

**Phase 1: Discovery**
- Use `Glob` to find all relevant files
- Use `Grep` to identify patterns across files
- Use `Read` to load file contents

**Phase 2: Analysis**
- Process gathered files to build mental model
- Identify relationships between files
- Map dependencies and imports

**Phase 3: Execution**
- Make changes based on comprehensive context
- Update multiple files in coordinated fashion
- Maintain consistency across file boundaries

**Limitation:** Context gathering is sequential and explicit, not automatic like Windsurf. The AI must remember to execute Step 0 before proceeding with analysis.

---

## Known Limitations

1. **No AI-Driven Activation:**
   - Windsurf: Cascade automatically activates workflow when relevant
   - Claude Code: User must manually invoke skill with `/refactor-components`
   - Mitigation: Include trigger keywords in description to help AI suggest skill usage

2. **Manual Context Gathering:**
   - Windsurf: Multi-file context loaded automatically via `globs` field
   - Claude Code: Must explicitly use Glob/Grep/Read in Step 0
   - Risk: AI might skip context gathering and make uninformed decisions

3. **No Model Decision Engine:**
   - Windsurf: AI evaluates whether workflow is relevant to current task
   - Claude Code: Relies on user to recognize when skill is appropriate
   - Workaround: Comprehensive description with activation scenarios

4. **Shared Context (Not Isolated):**
   - Using `context: inherit` means skill runs in main session
   - Prior conversation history affects execution
   - Alternative: Use `context: fork` for isolation, but loses multi-file context

---

## Verification Steps

**How to verify this emulation pattern works:**

1. **Test context gathering:**
   - Run Step 0 commands
   - Verify AI gathers all component files before analysis
   - Confirm AI has loaded hooks, types, tests

2. **Test multi-file refactoring:**
   - Provide skill with multiple related components
   - Verify it extracts shared logic across files
   - Check that imports are updated consistently

3. **Test activation description:**
   - Ask AI "how should I refactor my React components?"
   - Verify AI suggests invoking this skill
   - Confirm description helps AI match user intent

4. **Compare to Windsurf:**
   - Execute same refactoring in Windsurf (auto-activation)
   - Execute in Claude Code (manual invocation + context gathering)
   - Verify outcomes are equivalent despite different activation methods

---

## Migration Notes

**Converting Windsurf workflows to Claude Code skills:**

This example demonstrates the transformation pattern:

| Windsurf Feature | Claude Code Equivalent | Implementation |
|-----------------|----------------------|----------------|
| `trigger: model_decision` | Manual invocation | Add activation keywords to `description` |
| `globs: [patterns]` | Explicit context gathering | Step 0: Use Glob/Grep to find files |
| Automatic context loading | Sequential Read operations | Document files to read in workflow |
| AI-driven activation | User-driven invocation | Provide clear "when to use" guidance |
| Multi-file awareness | Explicit file mapping | Build file relationships in analysis phase |

**Key Principle:** Make implicit capabilities explicit through structured instructions.
