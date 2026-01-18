# GSD Workflow: New Milestone

## Purpose

Start a new version/milestone after completing the current one. Preserves history and initializes fresh roadmap for v2, v3, etc.

## Prerequisites

- Current milestone complete (all phases verified)
- `/gsd:complete-milestone` has been run

## Process

### Step 1: Load Current State

Read project state to understand:
- Current version
- Completed features
- Deferred items from ISSUES.md
- Lessons learned

### Step 2: Define New Milestone

```markdown
## New Milestone: v{N+1}

**Previous Version:** v{N}
**Completed:** {Date}

**Carried Forward from v{N}:**
- {Deferred item 1 from ISSUES.md}
- {Deferred item 2 from ISSUES.md}

**New Goals for v{N+1}:**
1. {New goal 1}
2. {New goal 2}
```

### Step 3: Initialize New Roadmap

1. Archive current PROJECT.md → archive/v{N}/
2. Create fresh PROJECT-v{N+1}.md
3. Create fresh ROADMAP-v{N+1}.md
4. Create fresh STATE-v{N+1}.md
5. Import deferred items

### Step 4: Confirmation

```markdown
## Milestone v{N+1} Initialized

**Files Created:**
- .planning/PROJECT.md (v{N+1})
- .planning/ROADMAP.md (v{N+1})
- .planning/STATE.md (v{N+1})

**Archived:**
- .planning/archive/v{N}/

**Ready to start planning!**
Run `/gsd:plan-phase 1` to begin.
```

## Output

- Fresh `.planning/PROJECT.md`
- Fresh `.planning/ROADMAP.md`
- Fresh `.planning/STATE.md`
- Archived previous version
