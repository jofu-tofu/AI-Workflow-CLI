# GSD: New Project

Initialize a complete project from ideation to roadmap. This unified workflow guides discovery, conducts optional research, generates requirements, and produces a complete project plan.

## Workflow Source

This workflow is defined in detail at `.aiwcli/_gsd/workflows/new-project.md`.

**CRITICAL:** Load the FULL content from `@.aiwcli/_gsd/workflows/new-project.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Create `_output/gsd/.planning/` directory structure
2. Ask guided discovery questions about your project
3. Conduct optional research for unfamiliar technologies
4. Generate REQUIREMENTS.md with V1/V2 separation
5. Generate PROJECT.md with complete vision
6. Generate ROADMAP.md with phase breakdown
7. Initialize STATE.md, ISSUES.md, SUMMARY.md

## Outputs

All files created in `_output/gsd/.planning/` directory:
- `PROJECT.md` - Vision and goals
- `REQUIREMENTS.md` - V1/V2 requirements
- `ROADMAP.md` - Phase breakdown
- `STATE.md` - Project state tracking
- `ISSUES.md` - Future enhancements
- `SUMMARY.md` - Change history

## Usage

```
/gsd-new-project
```

Then answer the discovery questions to define your project vision and roadmap.
