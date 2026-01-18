# GSD: Discuss Phase

Capture pre-planning decisions, clarify ambiguities, and resolve gray areas before detailed task planning.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/discuss-phase.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/discuss-phase.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Validate and load phase from ROADMAP.md
2. Identify gray areas by category (Visual, API, Content, Organization)
3. Generate focused questions for each ambiguity
4. Capture decisions with rationale
5. Document assumptions
6. Generate CONTEXT.md

## When to Use

Use BEFORE `/gsd:plan-phase` when:
- Phase scope has ambiguities
- Design decisions need clarification
- Technical approach is unclear
- User preferences matter for implementation

## Usage

```
/gsd-discuss-phase 1
```

Then answer questions about the phase to capture decisions before planning.

## Outputs

- `.planning/CONTEXT.md` - Decisions captured for the phase
- Updated `.planning/STATE.md` - Discussion status
