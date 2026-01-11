# GSD Workflow: Resume Work

## Purpose

Restore context from handoff documentation and seamlessly continue suspended work.

## Prerequisites

- `HANDOFF.md` exists (created by `/gsd:pause-work`)
- OR resuming from backup/clone
- OR returning after break

## Process

### Step 1: Locate Handoff Documentation

Find the most recent handoff:

```bash
# Check for HANDOFF.md
if exists HANDOFF.md:
  - Read it
  - This is the primary handoff

# Check for dated handoffs
ls -la HANDOFF-*.md 2>/dev/null
  - If multiple exist, use most recent

# No handoff found
if no handoff exists:
  - Offer to reconstruct from STATE.md
  - Or run /gsd:progress to orient
```

### Step 2: Read Handoff Document

Present handoff to user:

1. Show complete HANDOFF.md
2. Highlight key sections:
   - Current status
   - What was being done
   - What's next
   - Blockers

3. Ask user to confirm:
   - "Have you read the handoff document?"
   - "Do you understand where we left off?"
   - "Are you ready to continue?"

### Step 3: Environment Verification

Verify environment is ready:

**Check Dependencies:**
```bash
# Verify tools are available
node --version  # or python --version, etc.
npm --version   # or pip --version, etc.

# Verify matches handoff documentation
```

**Check Git Status:**
```bash
git status

# Compare with handoff documentation
# Note any differences
```

**Run Tests:**
```bash
{test command from handoff}

# Ensure tests pass before continuing
# If tests fail: Environment issue or code issue?
```

### Step 4: Restore Working State

Based on how work was saved:

**If WIP was committed:**
```bash
git log -1
# Verify WIP commit is current HEAD
# Continue from here
```

**If changes were stashed:**
```bash
# Find stash reference from HANDOFF.md
git stash list
git stash pop {stash-ref}

# Review restored changes
git diff
```

**If WIP branch was created:**
```bash
# Get branch name from HANDOFF.md
git checkout {wip-branch-name}

# Review current state
git log -1
git status
```

### Step 5: Rebuild Mental Model

Help user reconstruct context:

1. **Show Recent Work:**
   ```bash
   git log -10 --oneline --graph
   ```

2. **Summarize Progress:**
   - Read ROADMAP.md - show which phases complete
   - Read STATE.md - show current decisions
   - Read current PLAN-phase-{N}.md - show task progress

3. **Highlight Changes:**
   ```bash
   # Show what changed since pause
   git diff {pause-commit}..HEAD

   # If significant time passed, summarize
   ```

4. **Review "Mental Model" Section:**
   - From HANDOFF.md
   - Explain the approach that was being taken
   - Refresh understanding of decisions made

### Step 6: Address Blockers

Check if blockers are resolved:

**For each blocker in HANDOFF.md:**

```markdown
Blocker: {Blocker Title}
Status: {Still blocked / Resolved / Unknown}

{If still blocked:}
- What's the current status?
- Can we work around it?
- Should we pause again or pivot?

{If resolved:}
- How was it resolved?
- Update STATE.md with resolution
- Continue with work
```

### Step 7: Orient to Next Steps

From "What I Was About To Do Next" section:

1. **Show next steps:**
   ```markdown
   ## Next Actions (from handoff)

   1. {Step 1}
   2. {Step 2}
   3. {Step 3}
   ```

2. **Verify still relevant:**
   - Has anything changed?
   - Are these still the right next steps?
   - Any new information?

3. **Create immediate plan:**
   - What should we do first?
   - What's the expected outcome?
   - How will we verify it works?

### Step 8: Complete Resumption Checklist

Work through checklist from HANDOFF.md:

```markdown
## Resumption Checklist

- [ ] Read this entire handoff document
- [ ] Read PROJECT.md, ROADMAP.md, STATE.md
- [ ] Review recent commits (git log)
- [ ] Restore uncommitted changes (if stashed/branched)
- [ ] Run tests to verify environment works
- [ ] Verify blockers are resolved (if any)
- [ ] Understand "What I Was About To Do Next"
- [ ] Ready to continue!
```

Show progress on checklist as items complete.

### Step 9: Update STATE.md

Mark work as resumed:

```markdown
## Current Status

**Status:** 🔄 IN PROGRESS (Resumed)
**Resumed:** {Date}
**Paused Duration:** {Time between pause and resume}
**Working On:** {Current task from handoff}

{Previous pause note - move to history section}
```

### Step 10: Archive Handoff

Don't delete - move to archive:

```bash
mkdir -p .gsd-handoffs
mv HANDOFF.md .gsd-handoffs/HANDOFF-{date}.md

# Add note to STATE.md
echo "Handoff archived: .gsd-handoffs/HANDOFF-{date}.md" >> STATE.md
```

### Step 11: Confirmation

Show user ready state:

```markdown
✅ Work Resumed Successfully!

## Context Restored

- ✅ Environment verified (tests passing)
- ✅ Working state restored
- ✅ Mental model rebuilt
- ✅ Blockers {resolved / still present}
- ✅ Next steps identified

## Current Position

**Phase:** {N} - {Phase Name}
**Task:** {Current task}
**Next Action:** {Immediate next step}

## Ready to Continue

{Show immediate next action from handoff}

Would you like to:
1. Continue with planned next steps
2. Review current progress first
3. Adjust plan based on new information
```

## Success Criteria

- [ ] Handoff document read and understood
- [ ] Environment verified working
- [ ] Working state restored (uncommitted changes, branch, etc.)
- [ ] Mental model reconstructed
- [ ] Blockers addressed or acknowledged
- [ ] Next steps clear
- [ ] STATE.md updated to "In Progress"
- [ ] User ready to continue work

## Fallback: No Handoff Document

If HANDOFF.md doesn't exist:

1. **Reconstruct from Git:**
   ```bash
   git log -5
   git status
   git diff
   ```

2. **Read Project Files:**
   - PROJECT.md
   - ROADMAP.md
   - STATE.md
   - Latest PLAN-phase-{N}.md

3. **Run Progress:**
   - Use `/gsd:progress` to orient

4. **Ask User:**
   - "Where did you leave off?"
   - "What were you working on?"
   - "What were you about to do next?"

5. **Create Reconstructed Context:**
   - Document current understanding
   - Verify with user
   - Proceed cautiously

## Notes

**Resume After Long Break:**
- Take time to rebuild context
- Review more history
- Run more tests
- Consider re-verifying recent work
- Don't rush - context is critical

**Resume on Different Machine:**
- Verify same environment setup
- Check tool versions match
- May need to reinstall dependencies
- Verify git config is correct

**Resume by Different Person:**
- Extra important to read all docs
- Ask questions if anything unclear
- Don't assume - verify understanding
- Original author may have context not documented
