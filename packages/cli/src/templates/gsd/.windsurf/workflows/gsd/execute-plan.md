# GSD: Execute Plan

Execute task plans via fresh subagent contexts to prevent degradation and ensure focused work.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/execute-plan.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/execute-plan.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Find active PLAN-phase-{N}.md file
2. Execute each task in fresh 200k token context
3. Run verification steps after each task
4. Create atomic git commits per task
5. Update SUMMARY.md and STATE.md with progress

## Usage

```
/gsd-execute-plan
```

Executes the most recent plan file. Each task gets fresh context to prevent degradation.
