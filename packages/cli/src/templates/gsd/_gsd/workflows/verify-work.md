# GSD Workflow: Verify Work

## Purpose

User acceptance testing for completed phases or plans to ensure quality before proceeding.

## Prerequisites

- Phase {N} plan has all tasks marked complete
- All commits have been made
- User is ready to verify work

## Process

### Step 1: Read Completion Context

Gather verification materials:
1. Read `PLAN-phase-{N}.md` - All tasks and acceptance criteria
2. Read `ROADMAP.md` - Phase completion criteria
3. Read `SUMMARY.md` - Commits made during phase
4. Review git log for phase commits

### Step 2: Prepare Verification Checklist

Create comprehensive checklist from multiple sources:

**From PLAN.md - Task Acceptance Criteria:**
- [ ] Task 1: Criterion 1
- [ ] Task 1: Criterion 2
- [ ] Task 2: Criterion 1
- [ ] Task 2: Criterion 2
- [ ] Task 3: Criterion 1
- [ ] Task 3: Criterion 2

**From ROADMAP.md - Phase Verification Criteria:**
- [ ] Phase criterion 1
- [ ] Phase criterion 2
- [ ] Phase criterion 3

**Standard Verification (Always Check):**
- [ ] All tests passing (if tests exist)
- [ ] No console errors/warnings
- [ ] Code follows project patterns
- [ ] Documentation updated
- [ ] No regressions introduced
- [ ] Git commits are atomic and clear

### Step 3: Automated Verification

Run automated checks if available:

1. **Tests:**
   ```bash
   npm test
   # or
   pytest
   # or
   cargo test
   # etc.
   ```

2. **Linting:**
   ```bash
   npm run lint
   # or
   eslint .
   # etc.
   ```

3. **Build:**
   ```bash
   npm run build
   # Ensure build succeeds
   ```

4. **Type Checking:**
   ```bash
   tsc --noEmit
   # or
   mypy .
   # etc.
   ```

Document all automated check results.

### Step 4: Manual Verification

Guide user through manual verification:

**For Each Acceptance Criterion:**
1. Explain what to check
2. Provide specific steps to verify
3. Show expected outcomes
4. Ask user to confirm: ✅ Pass or ❌ Fail

**Example:**
```
Verifying: "User can log in with email and password"

Steps to test:
1. Navigate to /login
2. Enter valid email and password
3. Click "Log In" button
4. Should redirect to dashboard

Expected outcome: User sees dashboard with welcome message

Does this work as expected? (yes/no)
```

### Step 5: Record Verification Results

Create verification report:

```markdown
# Verification Report - Phase {N}

**Phase:** {Phase Name}
**Date:** {Date}
**Verifier:** User

## Automated Checks
- ✅ Tests: All passing (42/42)
- ✅ Linting: No issues
- ✅ Build: Success
- ✅ Type Check: No errors

## Manual Verification
- ✅ Feature 1: Works as expected
- ✅ Feature 2: Works as expected
- ❌ Feature 3: Issue found - [description]

## Issues Found
{List any issues discovered}

## Decision
- [x] APPROVED - Phase complete, proceed to next
- [ ] NEEDS FIXES - Issues must be resolved

---
**Next Steps:** {Based on decision}
```

### Step 6: Handle Verification Outcome

**If ALL verifications pass:**
1. Update ROADMAP.md:
   - Move Phase {N} to "Completed Phases" section
   - Update status to ✅ Complete
   - Add completion date
2. Update STATE.md:
   - Add to completed work
   - Set next phase as current
3. Recommend: `/gsd:plan-phase {N+1}` to start next phase

**If ANY verifications fail:**
1. Document issues in ISSUES.md
2. Create issue descriptions with:
   - What failed
   - Expected vs actual behavior
   - Steps to reproduce
   - Severity (Blocker, Major, Minor)
3. Ask user: "Fix now or defer?"
   - If fix now: Recommend `/gsd:plan-fix phase-{N}`
   - If defer: Add to ISSUES.md with "Deferred" tag

### Step 7: Celebration (if passed)

Acknowledge the completion:
```
🎉 Phase {N} Complete!

Summary:
- {X} tasks completed
- {Y} commits made
- {Z} files changed
- All verification criteria met

Ready to start Phase {N+1}?
```

## Output Files

- `VERIFICATION-phase-{N}.md` - Detailed verification report
- Updated `ROADMAP.md` - Phase marked complete
- Updated `STATE.md` - Progress updated
- Updated `ISSUES.md` - Any new issues found

## Success Criteria

- [ ] All acceptance criteria verified
- [ ] Automated tests passing
- [ ] Manual testing completed
- [ ] User explicitly approves or requests fixes
- [ ] Verification report created
- [ ] Project state updated accordingly

## Notes

**User Acceptance is Critical:**
- Never mark phase complete without explicit user approval
- User knows their requirements better than AI
- Verification catches issues before they compound
- Better to fix now than discover problems later
