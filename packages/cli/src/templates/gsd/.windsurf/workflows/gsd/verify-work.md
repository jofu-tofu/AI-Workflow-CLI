# GSD: Verify Work

User acceptance testing for completed phases with conversational walkthrough, automated checks, failure detection, and integrated auto-diagnosis with fix plan generation.

## Workflow Source

This workflow is defined in detail at `.aiwcli/_gsd/workflows/verify-work.md`.

**CRITICAL:** Load the FULL content from `@.aiwcli/_gsd/workflows/verify-work.md`, READ its entire contents, and follow its directions exactly!

## Quick Reference

This command will:
1. Extract testable deliverables from requirements
2. Run automated verification (tests, linting, build)
3. Conversational UAT walkthrough with user
4. Failure detection and classification
5. Auto-diagnosis for failures
6. Fix plan generation when issues found

## Key Features

- **Conversational UAT:** One-by-one verification with user
- **Auto-Diagnosis:** Automatically investigates failures
- **Fix Plan Generation:** Creates actionable fix tasks
- **Absorbs plan-fix:** No separate workflow needed

## Usage

```
/gsd-verify-work 1
```

Then walk through verification items conversationally.

## Output

- `_output/gsd/.planning/VERIFICATION-phase-{N}.md` - Full report
- `_output/gsd/.planning/PLAN-fix-phase-{N}.md` - Fix plan (if issues)
