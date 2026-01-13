# GSD Workflow: Plan Fix

## Purpose

Create targeted fix plans to address issues found during UAT (User Acceptance Testing) or verification.

## Prerequisites

- Issues have been identified and documented (from `/gsd:verify-work` or user report)
- _GSD_OUTPUT/ISSUES.md contains issue descriptions
- User wants to fix issues now (not defer)

## Process

### Step 1: Issue Analysis

Read issue documentation from:
1. `_GSD_OUTPUT/ISSUES.md` - Issue descriptions
2. `_GSD_OUTPUT/VERIFICATION-phase-{N}.md` - Failed verification criteria
3. Recent git log - Commits that may have introduced issues

For each issue, understand:
- What's broken?
- What was expected?
- When did it break?
- What might have caused it?

### Step 2: Root Cause Investigation

Investigate the issue:

1. **Reproduce the Issue:**
   - Follow steps to reproduce
   - Confirm issue still exists
   - Document exact behavior

2. **Identify Root Cause:**
   - Which file(s) are involved?
   - Which function(s) are problematic?
   - Is it a logic error, typo, missing code, or configuration?

3. **Assess Impact:**
   - Is this a regression or new bug?
   - Does it affect other features?
   - What's the severity?

### Step 3: Fix Strategy

Determine fix approach:

**Quick Fix (< 15 minutes):**
- Single file change
- Simple logic correction
- Typo or configuration fix
- Can fix directly without formal plan

**Complex Fix (> 15 minutes):**
- Multiple file changes
- Architecture issues
- Requires testing multiple scenarios
- Should create formal fix plan

### Step 4: Create Fix Plan (if needed)

For complex fixes, create `_GSD_OUTPUT/PLAN-fix-{issue-id}.md`:

```markdown
# Fix Plan - Issue {ID}

## Issue Description
{Copy from ISSUES.md}

## Root Cause
{Analysis from investigation}

## Fix Strategy
{High-level approach to fixing}

## Tasks

### Task 1: {Fix Component X}
**Objective:** {What this fixes}

**Implementation:**
```xml
<task>
  <action>
    Specific changes to make:
    - File: path/to/file.ts
    - Function: functionName
    - Change: What to modify
  </action>
  <verification>
    - Run specific test
    - Check specific behavior
    - Verify no regressions
  </verification>
  <rollback>
    git revert HEAD
  </rollback>
</task>
```

**Acceptance Criteria:**
- [ ] Issue no longer reproduces
- [ ] Original functionality still works
- [ ] Tests passing

---

## Verification

**Fix Complete When:**
- [ ] All tasks completed
- [ ] Issue verified fixed
- [ ] No new regressions introduced
- [ ] Tests updated if needed

```

### Step 5: Execute Fix

**For Quick Fixes:**
1. Make the change directly
2. Test the fix
3. Run verification
4. Create atomic commit:
   ```
   Fix: [Brief description]

   Resolves issue: [Issue ID/description]

   Changes:
   - [Specific change]

   Verified: [How it was tested]
   ```

**For Complex Fixes:**
1. Create fix plan (_GSD_OUTPUT/PLAN-fix-{id}.md)
2. Show plan to user for approval
3. Execute via `/gsd:execute-plan` pattern
4. Verify fix resolves issue

### Step 6: Re-verification

After fix is applied:

1. **Reproduce Original Issue:**
   - Follow same steps
   - Confirm issue is gone

2. **Regression Testing:**
   - Run full test suite
   - Test related functionality
   - Ensure nothing else broke

3. **Update Documentation:**
   - Update _GSD_OUTPUT/ISSUES.md (mark as resolved)
   - Update _GSD_OUTPUT/VERIFICATION report if it exists
   - Update _GSD_OUTPUT/STATE.md with fix notes

### Step 7: Completion Decision

Ask user:
- "Issue fixed and verified. Ready to continue with verification?"
- If yes: Return to `/gsd:verify-work {N}`
- If more issues: Continue with next issue

## Output Files

- `_GSD_OUTPUT/PLAN-fix-{id}.md` - Fix plan (if complex)
- Updated `_GSD_OUTPUT/ISSUES.md` - Mark issue as resolved
- Updated `_GSD_OUTPUT/STATE.md` - Document fix
- Git commit - Atomic fix commit

## Success Criteria

- [ ] Root cause identified
- [ ] Fix strategy clear
- [ ] Fix applied successfully
- [ ] Issue verified resolved
- [ ] No regressions introduced
- [ ] Documentation updated

## Notes

**Fix First, Optimize Later:**
- Focus on resolving the issue
- Don't over-engineer the fix
- Simplest solution that works is best
- Can refactor later if needed

**Communication:**
- Keep user informed of progress
- Explain what was broken and why
- Show what was changed to fix it
- Confirm fix resolves their concern
