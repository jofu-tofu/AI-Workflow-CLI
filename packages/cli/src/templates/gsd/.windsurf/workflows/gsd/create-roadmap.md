# GSD: Create Roadmap

Generate phased roadmap based on PROJECT.md goals and establish persistent state tracking.

## Workflow Source

This workflow is defined in detail at `_gsd/workflows/create-roadmap.md`.

**CRITICAL:** Load the FULL content from `@_gsd/workflows/create-roadmap.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Analyze PROJECT.md scope and goals
2. Break project into logical phases (typically 3-8 phases)
3. Define tasks and verification criteria for each phase
4. Generate ROADMAP.md with complete phase breakdown
5. Initialize STATE.md with current position tracking

## Usage

```
/gsd-create-roadmap
```

Requires PROJECT.md to exist first (run `/gsd-new-project` if needed).
