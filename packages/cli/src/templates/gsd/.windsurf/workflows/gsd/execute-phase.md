# GSD: Execute Phase

Execute task plans via wave-based parallel execution, using fresh subagent contexts for each task to prevent degradation and maximize throughput.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/execute-phase.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/execute-phase.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Load plan with wave groupings from PLAN-phase-{N}.md
2. Execute Wave 1 tasks in parallel
3. Wait for Wave 1 completion, then execute Wave 2
4. Create atomic commits per task
5. Track progress in STATE.md and SUMMARY.md
6. Halt on failures for diagnosis

## Key Features

- **Wave-Based Execution:** Parallel within waves, sequential between waves
- **Fresh Context:** 200k tokens per task, no degradation
- **Atomic Commits:** One commit per task for easy rollback
- **Failure Isolation:** Stops on failure, recommends diagnosis

## Usage

```
/gsd-execute-phase
```

Or specify phase:
```
/gsd-execute-phase 1
```

## Supersedes

This workflow replaces `/gsd:execute-plan` (sequential execution).

## Output

- Updated `.planning/PLAN-phase-{N}.md` - Task statuses
- Updated `.planning/SUMMARY.md` - Commit history
- Updated `.planning/STATE.md` - Progress
- Git commits - One per task
