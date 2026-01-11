# GSD: Verify Work

User acceptance testing for completed phases to ensure quality before proceeding.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/verify-work.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/verify-work.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Read PLAN-phase-{N}.md acceptance criteria
2. Run automated checks (tests, linting, build)
3. Guide manual verification with specific steps
4. Create VERIFICATION-phase-{N}.md report
5. Update ROADMAP.md if phase approved

## Usage

```
/gsd-verify-work [phase number]
```

Example: `/gsd-verify-work 1` verifies Phase 1 completion.
