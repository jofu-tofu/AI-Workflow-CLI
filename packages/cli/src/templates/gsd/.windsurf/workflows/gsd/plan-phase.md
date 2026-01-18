# GSD: Plan Phase

Create atomic task plans for specific phases with XML-formatted execution details, wave groupings for parallel execution, and verification against requirements.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/plan-phase.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/plan-phase.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Validate phase and load context (CONTEXT.md, REQUIREMENTS.md)
2. Conduct targeted research for technical unknowns
3. Break phase into maximum 3 atomic tasks
4. Group tasks into waves for parallel execution
5. Verify tasks trace back to requirements
6. Generate PLAN-phase-{N}.md

## Key Features

- **Wave Analysis:** Groups tasks for parallel execution
- **Requirements Traceability:** Links tasks to V1/V2 requirements
- **Research Integration:** Spawns research agents when needed
- **Context Loading:** Applies decisions from discuss-phase

## Usage

```
/gsd-plan-phase 1
```

Then review the generated plan with wave groupings.

## Output

`.planning/PLAN-phase-{N}.md` - Complete execution plan with waves
