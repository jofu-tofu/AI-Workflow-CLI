# GSD Workflow: Debug

## Purpose

Systematic debugging workflow for tracking down issues. Uses structured approach to isolate and fix bugs.

## Process

### Step 1: Describe the Issue

```markdown
## Bug Report

**What's happening:** {Description}
**Expected behavior:** {What should happen}
**Steps to reproduce:**
1. {Step 1}
2. {Step 2}
3. {Step 3}

**Environment:**
- Branch: {Current branch}
- Last commit: {Hash}
- Relevant files: {List}
```

### Step 2: Gather Evidence

1. **Check logs/errors:**
   - Console output
   - Error messages
   - Stack traces

2. **Identify scope:**
   - Which component?
   - Which file(s)?
   - Recent changes?

3. **Review git history:**
   - When did it last work?
   - What changed since?

### Step 3: Form Hypothesis

```markdown
## Hypothesis

**Likely cause:** {What might be wrong}
**Evidence:** {Why I think this}
**How to verify:** {Test to confirm}
```

### Step 4: Test Hypothesis

1. Create minimal reproduction
2. Add diagnostic logging if needed
3. Test the theory
4. Confirm or reject

### Step 5: Implement Fix

If hypothesis confirmed:
1. Make targeted fix
2. Verify fix resolves issue
3. Check for regressions
4. Create commit

### Step 6: Document

```markdown
## Bug Resolution

**Root Cause:** {What was wrong}
**Fix:** {What was changed}
**Commit:** {Hash}
**Verified:** {How tested}
```

## Output

- Fixed code
- Commit with clear message
- Updated `.planning/STATE.md` with notes
