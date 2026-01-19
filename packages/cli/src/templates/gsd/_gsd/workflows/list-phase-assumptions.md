# GSD Workflow: List Phase Assumptions

## Purpose

Display all assumptions made for a phase, their validation status, and impact if wrong.

## Process

### Step 1: Load Assumptions

Read `_output/gsd/.planning/CONTEXT.md` and extract assumptions for the specified phase.

### Step 2: Display Assumptions

```markdown
## Assumptions - Phase {N}

| # | Assumption | Status | Impact if Wrong |
|---|------------|--------|-----------------|
| 1 | {Assumption} | ✅ Confirmed | {Impact} |
| 2 | {Assumption} | ⚠️ Unverified | {Impact} |
| 3 | {Assumption} | ❌ Invalidated | {Impact} |

### Unverified Assumptions

These assumptions have not been validated:

1. **{Assumption}**
   - Impact: {What changes if wrong}
   - Validation: {How to verify}

### Actions

- [ ] Validate assumption #2
- [ ] Update CONTEXT.md with validation results
```

### Step 3: Offer Actions

- Validate specific assumptions
- Update assumption status
- Add new assumptions

## Output

Display only (no file changes unless updating)
