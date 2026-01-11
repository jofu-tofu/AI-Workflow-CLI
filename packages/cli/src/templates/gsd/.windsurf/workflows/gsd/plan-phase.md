# GSD: Plan Phase

Create atomic task plans for specific phases with XML-formatted execution details. Maximum 3 tasks per plan.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/plan-phase.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/plan-phase.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Validate requested phase exists and is ready
2. Gather context from PROJECT.md, ROADMAP.md, STATE.md
3. Break phase into maximum 3 atomic tasks
4. Create XML-formatted specifications with verification steps
5. Generate PLAN-phase-{N}.md for execution

## Usage

```
/gsd-plan-phase [phase number]
```

Example: `/gsd-plan-phase 1` creates plan for Phase 1.
