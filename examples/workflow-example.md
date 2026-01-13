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

## Manual Traceability Test

**Concrete Scenario:** Developer wants to refactor three component files (ProductCard.tsx, UserCard.tsx, OrderCard.tsx) that share common card layout logic but have inconsistent implementations.

### Step-by-Step Execution Trace

**Step 1: User Invocation**
```
User: "/refactor-components"
```
- User explicitly invokes the skill (manual activation in Claude Code)
- AI recognizes the skill name and loads SKILL.md into context

**Step 2: Skill Loaded**
- AI now has in context:
  - Skill description: "USE WHEN refactoring React components for better modularity"
  - All workflow steps (Step 0: Context Gathering, Step 1-4: Process)
  - Tool permissions: Read, Grep, Edit allowed
  - Output format templates

**Step 3: Step 0 - Context Gathering (Explicit)**
AI executes context gathering commands:
```bash
# AI runs:
Glob("src/components/**/*.tsx")
# Returns: [ProductCard.tsx, UserCard.tsx, OrderCard.tsx, Button.tsx, ...]

Glob("src/components/**/*.ts")
# Returns: [types.ts, utils.ts, hooks.ts]

Grep("export.*Card", path="src/components", output_mode="files_with_matches")
# Returns: [ProductCard.tsx, UserCard.tsx, OrderCard.tsx]
```

**Intermediate State After Step 0:**
- AI has identified 3 Card components
- AI has located shared hooks: useCardLayout.ts
- AI has found type definitions in types.ts
- AI has built mental model: "Three card components with similar structure"

**Step 4: Step 1 - Component Analysis**
AI analyzes components:
```
- ProductCard.tsx (52 lines): Uses custom layout logic (inline styles)
- UserCard.tsx (48 lines): Uses CSS classes for layout
- OrderCard.tsx (55 lines): Uses custom layout logic (inline styles, similar to ProductCard)
```
AI identifies:
- Duplicate pattern: ProductCard and OrderCard have nearly identical layout logic
- Inconsistency: UserCard uses different approach
- Opportunity: Extract to shared BaseCard component

**Step 5: Step 2 - Extraction Planning**
AI creates refactoring plan and asks user:
```
AI: "I've analyzed the components and found:

Refactoring Plan:
1. Create BaseCard component extracting common layout (header, body, footer structure)
2. Create useCardLayout hook for responsive layout logic
3. Refactor ProductCard to use BaseCard (reduces from 52 to 28 lines)
4. Refactor UserCard to use BaseCard (reduces from 48 to 25 lines)
5. Refactor OrderCard to use BaseCard (reduces from 55 to 30 lines)
6. Update imports in parent components

Estimated impact:
- 155 lines → 113 lines (27% reduction)
- Single source of truth for card layout
- Consistent styling across all cards

Proceed with this plan? (yes/no)"
```

**Step 6: User Approval**
```
User: "yes"
```

**Step 7: Step 3 - Implementation**
AI executes refactoring:
```
1. Write(src/components/shared/BaseCard.tsx) - Creates new component
2. Write(src/hooks/useCardLayout.ts) - Extracts layout hook
3. Edit(src/components/ProductCard.tsx) - Refactors to use BaseCard
4. Edit(src/components/UserCard.tsx) - Refactors to use BaseCard
5. Edit(src/components/OrderCard.tsx) - Refactors to use BaseCard
6. Grep("import.*ProductCard|UserCard|OrderCard") - Finds parent components
7. Edit(src/pages/Dashboard.tsx) - Updates imports (if needed)
```

**Intermediate State After Step 7:**
- BaseCard.tsx created (30 lines)
- useCardLayout.ts created (15 lines)
- All 3 card components refactored and using BaseCard
- Imports updated in parent components

**Step 8: Step 4 - Verification**
AI runs verification:
```bash
# AI checks:
- No import errors (all components import BaseCard correctly)
- Type safety maintained (TypeScript compiles)
- Props match new API
```

**Step 9: Completion Report**
```
AI: "✅ Refactoring Complete

Summary:
- Created BaseCard component (src/components/shared/BaseCard.tsx)
- Created useCardLayout hook (src/hooks/useCardLayout.ts)
- Refactored 3 components (ProductCard, UserCard, OrderCard)
- Updated 1 parent component import (Dashboard.tsx)
- Reduced code from 155 → 113 lines (27% reduction)

Changes:
- src/components/shared/BaseCard.tsx (new)
- src/hooks/useCardLayout.ts (new)
- src/components/ProductCard.tsx (modified)
- src/components/UserCard.tsx (modified)
- src/components/OrderCard.tsx (modified)
- src/pages/Dashboard.tsx (modified)

Next Steps:
- Run tests to verify functionality
- Review BaseCard API for further refinements
- Consider extracting additional patterns if more cards are added
```

**Step 10: Skill Completes**
- Skill context released
- User returns to normal Claude Code session
- All changes committed to working directory

### Verification Checklist

Manual trace verification:

- ✅ Concrete scenario provided (3 specific card components)
- ✅ Step-by-step execution flow (Steps 0-4 from workflow)
- ✅ Intermediate states shown (after context gathering, after analysis, after implementation)
- ✅ Actual tool calls documented (Glob, Grep, Edit, Write)
- ✅ User interaction points clear (invocation, approval)
- ✅ Output format matches template
- ✅ Can mentally walk through without running code

### Comparison: Windsurf vs Claude Code

| Aspect | Windsurf Workflow | Claude Code Skill (This Example) |
|--------|-------------------|----------------------------------|
| **Activation** | AI auto-detects "refactor React components" → triggers workflow | User explicitly invokes `/refactor-components` |
| **Context Gathering** | Automatic - Windsurf loads all components/hooks when workflow triggers | Explicit - Step 0 runs Glob/Grep to gather context |
| **Multi-File Awareness** | Native - all `src/components/**/*.tsx` files in context automatically | Simulated - Step 0 checklist ensures all relevant files loaded |
| **Execution** | Steps 1-4 execute with full context already loaded | Steps 1-4 execute after explicit context gathering |
| **Outcome** | Same refactoring result | Same refactoring result |

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
