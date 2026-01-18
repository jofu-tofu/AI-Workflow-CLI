# GSD Workflow: Verify Work

## Purpose

User acceptance testing for completed phases with conversational walkthrough, automated checks, failure detection, and integrated auto-diagnosis with fix plan generation.

## Overview

This workflow verifies completed work through:
1. Extracting testable deliverables from requirements
2. Running automated verification (tests, linting, build)
3. Conversational UAT walkthrough with user
4. Failure detection and classification
5. Auto-diagnosis for failures (absorbs plan-fix)
6. Fix plan generation when issues found

**Absorbs:** `/gsd:plan-fix` functionality (now deprecated)

## Prerequisites

- Phase {N} plan has all tasks marked complete
- All commits have been made
- User is ready to verify work

## Process

### Step 1: Load Verification Context

Gather verification materials:

1. Read `.planning/PLAN-phase-{N}.md` - Tasks and acceptance criteria
2. Read `.planning/ROADMAP.md` - Phase completion criteria
3. Read `.planning/REQUIREMENTS.md` - Requirements for this phase
4. Read `.planning/SUMMARY.md` - Commits made during phase
5. Review git log for phase commits

**Create Verification Summary:**
```markdown
## Verification Context - Phase {N}

### Tasks Completed
| Task | Commits | Requirements |
|------|---------|--------------|
| Task 1 | abc123 | V1-F01, V1-N01 |
| Task 2 | def456 | V1-F02 |
| Task 3 | ghi789 | V1-F03 |

### Requirements to Verify
- V1-F01: {Description}
- V1-F02: {Description}
- V1-N01: {Description}

### Phase Verification Criteria
- {Criterion from ROADMAP.md}
```

### Step 2: Extract Testable Deliverables

Transform requirements and criteria into specific, testable items:

**For Each Requirement:**
```markdown
### V1-F01: {Requirement}

**Testable Deliverables:**
1. {Specific behavior to verify}
2. {Expected output/result}
3. {Edge case to test}

**How to Test:**
- Automated: {Test command if applicable}
- Manual: {Steps to verify manually}
```

**Generate Verification Checklist:**
```markdown
## Verification Checklist

### Automated Checks
- [ ] Tests pass: `npm test`
- [ ] Linting clean: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Type checking: `tsc --noEmit`

### V1-F01: {Requirement}
- [ ] {Testable item 1}
- [ ] {Testable item 2}

### V1-F02: {Requirement}
- [ ] {Testable item 1}
- [ ] {Testable item 2}

### Phase Criteria
- [ ] {Phase criterion 1}
- [ ] {Phase criterion 2}
```

### Step 3: Automated Verification

Run all automated checks:

**Test Suite:**
```bash
npm test
# or pytest, cargo test, etc.
```

**Linting:**
```bash
npm run lint
# or eslint, pylint, etc.
```

**Build:**
```bash
npm run build
```

**Type Checking:**
```bash
tsc --noEmit
# or mypy, etc.
```

**Record Results:**
```markdown
## Automated Check Results

| Check | Status | Details |
|-------|--------|---------|
| Tests | ✅ Pass (47/47) | All passing |
| Lint | ✅ Pass | No issues |
| Build | ✅ Pass | Completed |
| Types | ✅ Pass | No errors |
```

**If Any Fail:**
- Record failure details
- Continue to capture full picture
- Will address in diagnosis step

### Step 4: Conversational UAT Walkthrough

Guide user through manual verification with conversational approach.

**For Each Testable Item:**

```markdown
## Verifying: V1-F01 - {Requirement}

### Test 1: {Testable Item}

**What to Check:**
{Clear description of expected behavior}

**Steps:**
1. {Step 1}
2. {Step 2}
3. {Step 3}

**Expected Result:**
{What you should see/experience}

---

**Did this work as expected?**
- ✅ Yes, it works
- ❌ No, there's an issue
- ⚠️ Partial - works but has problems
```

**If User Reports Issue:**
```markdown
**Issue Reported for: {Item}**

Tell me more:
1. What did you expect to happen?
2. What actually happened?
3. Steps to reproduce?
4. Severity: Blocker / Major / Minor?

{Capture user response}
```

**Continue Through All Items:**
- One item at a time
- Wait for user confirmation
- Capture all issues found
- Note partial successes

### Step 5: Failure Detection and Classification

After all checks complete, classify results:

```markdown
## Verification Results - Phase {N}

### Summary

| Category | Pass | Fail | Partial |
|----------|------|------|---------|
| Automated | {N} | {N} | - |
| V1-F01 | {N} | {N} | {N} |
| V1-F02 | {N} | {N} | {N} |
| Phase Criteria | {N} | {N} | {N} |
| **Total** | {N} | {N} | {N} |

### Overall Status

{If all pass:}
✅ **VERIFIED** - All checks passed

{If failures:}
❌ **ISSUES FOUND** - {N} items need attention
```

**Classify Each Failure:**
```markdown
### Issue #{N}: {Brief Description}

**Category:** {Automated / Requirement / Phase Criteria}
**Severity:** {Blocker / Major / Minor}
**Requirement:** {V1-F01}

**Expected:** {What should happen}
**Actual:** {What happened}
**Steps to Reproduce:** {How to see the issue}

**Classification:**
- [ ] Code Bug - Logic error
- [ ] Missing Feature - Not implemented
- [ ] Integration Issue - Components not connected
- [ ] Configuration - Settings/environment
- [ ] Test Issue - Test itself is wrong
```

### Step 6: Auto-Diagnosis (Absorbs plan-fix)

For each failure, automatically investigate root cause:

**Diagnosis Process:**

```markdown
## Auto-Diagnosis: Issue #{N}

### Investigation

**1. Locate Relevant Code:**
- Search for files related to: {feature/component}
- Found: {list of relevant files}

**2. Analyze Recent Changes:**
- Commits affecting this area:
  - {commit hash}: {description}
  - {commit hash}: {description}

**3. Root Cause Analysis:**
- File: `path/to/file.ts`
- Function: `functionName()`
- Issue: {What's wrong}

**4. Proposed Fix:**
- {Specific change needed}
- {How to verify fix}
```

**For Each Issue:**
1. Search codebase for related files
2. Review recent commits
3. Identify likely root cause
4. Draft fix approach

### Step 7: Generate Fix Plan

If issues exist, automatically create fix plan:

```markdown
## Fix Plan - Phase {N} Issues

**Generated:** {Date}
**Issues to Fix:** {count}

### Issue #1: {Brief Description}

**Severity:** {Level}
**Root Cause:** {From diagnosis}

**Fix Tasks:**

<task id="fix-1">
  <objective>Fix {issue description}</objective>

  <action>
    1. Open `path/to/file.ts`
    2. Modify function `functionName()`:
       - Change: {specific change}
       - Add: {what to add}
    3. Update tests in `path/to/test.ts`
  </action>

  <verification>
    - [ ] `npm test` passes
    - [ ] Manual verification: {steps}
    - [ ] Issue no longer reproduces
  </verification>

  <rollback>
    git revert HEAD
  </rollback>
</task>

---

### Issue #2: {Brief Description}

{Same format}

---

## Execution

**Option 1: Fix Now**
Execute fixes immediately via subagent

**Option 2: Save Plan**
Write plan to `.planning/PLAN-fix-phase-{N}.md` for later

**Which would you like?**
```

### Step 8: Fix Execution (If Chosen)

If user chooses to fix now:

**For Each Fix:**
1. Spawn fresh subagent with fix task
2. Execute fix
3. Run verification
4. Create commit: `Fix: {description}`
5. Re-run affected automated checks

**After All Fixes:**
- Loop back to Step 4 (Conversational UAT)
- Re-verify fixed items
- Continue until all pass or user defers

### Step 9: Record Verification Results

Create verification report:

**File: `.planning/VERIFICATION-phase-{N}.md`**

```markdown
# Verification Report - Phase {N}

**Phase:** {Phase Name}
**Date:** {Date}
**Verifier:** User + AI Assistant

## Automated Checks

| Check | Status | Notes |
|-------|--------|-------|
| Tests | ✅ Pass | 47/47 |
| Lint | ✅ Pass | Clean |
| Build | ✅ Pass | Success |
| Types | ✅ Pass | No errors |

## Requirements Verification

### V1-F01: {Requirement}
| Item | Status | Notes |
|------|--------|-------|
| {Item 1} | ✅ Pass | Works as expected |
| {Item 2} | ✅ Pass | Works as expected |

### V1-F02: {Requirement}
| Item | Status | Notes |
|------|--------|-------|
| {Item 1} | ✅ Pass | Fixed in commit xyz |

## Phase Criteria

| Criterion | Status | Notes |
|-----------|--------|-------|
| {Criterion 1} | ✅ Pass | |
| {Criterion 2} | ✅ Pass | |

## Issues Found and Resolved

| Issue | Severity | Resolution |
|-------|----------|------------|
| {Issue 1} | Major | Fixed: commit abc |
| {Issue 2} | Minor | Deferred to Phase N+1 |

## Decision

- [x] **APPROVED** - Phase complete
- [ ] **NEEDS FIXES** - Blockers remain

---

**Verified by:** User
**Date:** {Date}
```

### Step 10: Update Project State

**If Approved:**

1. Update `.planning/ROADMAP.md`:
   - Move Phase {N} to "Completed Phases"
   - Status: ✅ Complete
   - Completion date

2. Update `.planning/STATE.md`:
   - Add to completed work
   - Set next phase as current
   - Clear blockers

3. Update `.planning/REQUIREMENTS.md`:
   - Mark implemented requirements as ✅ Complete

**If Deferred Issues:**

1. Update `.planning/ISSUES.md`:
   - Add deferred items with context
   - Tag with "Deferred from Phase {N}"
   - Priority for future

### Step 11: Completion Summary

```markdown
## Verification Complete - Phase {N}

### Status: {APPROVED / NEEDS FIXES}

### Results Summary

| Category | Status |
|----------|--------|
| Automated Checks | ✅ All Pass |
| Requirements | ✅ {X}/{Y} Verified |
| Phase Criteria | ✅ All Met |
| Issues Found | {N} found, {N} fixed, {N} deferred |

### Files Updated

- `.planning/VERIFICATION-phase-{N}.md` - Full report
- `.planning/ROADMAP.md` - Phase marked complete
- `.planning/STATE.md` - Status updated
- `.planning/REQUIREMENTS.md` - Requirements marked implemented

### Next Steps

{If approved:}
🎉 **Phase {N} Complete!**

Ready for Phase {N+1}?
**Run `/gsd:plan-phase {N+1}`** to continue

{If needs fixes:}
⚠️ **Blockers Remain**

Run fixes: `.planning/PLAN-fix-phase-{N}.md` contains fix plan
```

## Output Files

- `.planning/VERIFICATION-phase-{N}.md` - Full verification report
- `.planning/PLAN-fix-phase-{N}.md` - Fix plan (if issues found)
- Updated `.planning/ROADMAP.md` - Phase status
- Updated `.planning/STATE.md` - Current position
- Updated `.planning/REQUIREMENTS.md` - Implementation status
- Updated `.planning/ISSUES.md` - Deferred items

## Success Criteria

- [ ] All automated checks run
- [ ] All requirements verified conversationally
- [ ] All phase criteria checked
- [ ] Issues classified and diagnosed
- [ ] Fix plan generated for failures
- [ ] User explicitly approves or requests fixes
- [ ] Verification report created
- [ ] Project state updated correctly

## Notes

**Why Conversational UAT?**
- User knows their requirements best
- Catches edge cases automation misses
- Builds confidence in deliverables
- Documents user acceptance

**Why Auto-Diagnosis?**
- Faster issue resolution
- No separate workflow needed
- Context preserved from verification
- Fix plans are actionable

**Deprecates plan-fix:**
- All plan-fix functionality now in verify-work
- Diagnosis and fix generation integrated
- Single workflow for verify + fix cycle
