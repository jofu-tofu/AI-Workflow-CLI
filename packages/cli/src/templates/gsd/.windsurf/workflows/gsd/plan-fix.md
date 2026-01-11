# GSD: Plan Fix

Create targeted fix plans to address issues found during UAT or verification.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/plan-fix.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/plan-fix.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Read issues from ISSUES.md or verification reports
2. Reproduce and investigate root cause
3. Determine fix strategy (quick vs complex)
4. Create PLAN-fix-{id}.md if needed
5. Execute fix and re-verify

## Usage

```
/gsd-plan-fix [plan or issue id]
```

Example: `/gsd-plan-fix phase-1` creates fix plan for Phase 1 issues.
