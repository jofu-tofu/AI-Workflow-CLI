# GSD Workflow: Complete Milestone

## Purpose

Archive project versions, create release documentation, and prepare for potential sequel projects.

## Use Case

Run this workflow when:
- All roadmap phases complete
- Major version achieved
- Project reaches natural stopping point
- Ready to deploy/ship/release

## Process

### Step 1: Final Verification

Before marking complete, verify:

1. **All Phases Complete:**
   - Read ROADMAP.md
   - Confirm all phases marked ✅ Complete
   - All verification reports exist

2. **Quality Checks:**
   - All tests passing
   - No critical issues in ISSUES.md
   - Documentation complete
   - Build succeeds

3. **Project Goals Met:**
   - Read PROJECT.md
   - Verify all success criteria achieved
   - Confirm all must-have goals completed

### Step 2: Generate Final Summary

Create comprehensive project summary:

**File: `MILESTONE-{version}.md`**

```markdown
# Milestone Complete - {{PROJECT_NAME}} v{version}

## Achievement Summary

**Completion Date:** {Date}
**Total Phases:** {N}
**Total Commits:** {N}
**Duration:** {Start Date} - {End Date}

## Goals Achieved

{From PROJECT.md - check off all completed goals}
- ✅ Goal 1
- ✅ Goal 2
- ✅ Goal 3

## Phases Completed

### Phase 1: {Name}
- **Completed:** {Date}
- **Commits:** {N}
- **Key Deliverables:** {List}

### Phase 2: {Name}
- **Completed:** {Date}
- **Commits:** {N}
- **Key Deliverables:** {List}

{Continue for all phases}

## Statistics

- **Files Changed:** {N}
- **Lines Added:** {N}
- **Lines Removed:** {N}
- **Contributors:** {List}

## Key Decisions

{From STATE.md - major decisions made}

1. **{Decision Title}**
   - Rationale: {Why}
   - Impact: {What changed}

## Outstanding Items

{From ISSUES.md - deferred or future work}

### Future Enhancements
- [ ] Enhancement 1
- [ ] Enhancement 2

### Known Limitations
- Limitation 1
- Limitation 2

## Lessons Learned

### What Worked Well
- {Success 1}
- {Success 2}

### What Could Improve
- {Improvement 1}
- {Improvement 2}

### Recommendations for Future
- {Recommendation 1}
- {Recommendation 2}

---

**Project Status:** COMPLETE ✅
```

### Step 3: Create Release Tag

Create git tag for milestone:

```bash
git tag -a v{version} -m "Milestone: {Project Name} v{version}

{Brief description of milestone}

See MILESTONE-{version}.md for complete details."

git push origin v{version}
```

### Step 4: Archive Project State

Create archive directory:

```bash
mkdir -p archive/v{version}
```

Copy final state files:
```bash
cp PROJECT.md archive/v{version}/
cp ROADMAP.md archive/v{version}/
cp STATE.md archive/v{version}/
cp SUMMARY.md archive/v{version}/
cp ISSUES.md archive/v{version}/
cp MILESTONE-{version}.md archive/v{version}/
```

### Step 5: Update Project Status

**Update PROJECT.md:**
```markdown
**Status:** Complete ✅
**Version:** v{version}
**Completed:** {Date}
```

**Update STATE.md:**
```markdown
## Project Complete

**Milestone:** v{version}
**Date:** {Date}
**Final Status:** All goals achieved

See MILESTONE-{version}.md for complete summary.
```

### Step 6: Prepare for Sequel (Optional)

If continuing with v2/sequel project:

1. **Create Sequel Vision:**
   ```markdown
   # {{PROJECT_NAME}} v{next-version} - Vision

   ## Building On

   v{current-version} achieved:
   - {Achievement 1}
   - {Achievement 2}

   ## Next Evolution

   v{next-version} will add:
   - {New goal 1}
   - {New goal 2}

   ## Carried Forward

   From ISSUES.md:
   - {Deferred enhancement 1}
   - {Deferred enhancement 2}
   ```

2. **Initialize New Cycle:**
   - Create PROJECT-v{next}.md
   - Create fresh ROADMAP-v{next}.md
   - Create fresh STATE-v{next}.md
   - Preserve archive of v{current}

### Step 7: Celebration & Reflection

Generate completion message:

```markdown
🎉 MILESTONE ACHIEVED! 🎉

{{PROJECT_NAME}} v{version} is complete!

## By The Numbers
- ✅ {N} phases completed
- 💾 {N} commits made
- 📝 {N} files created/modified
- ⏱️ {Duration} from start to finish

## What You Built
{Brief description of accomplishment}

## Next Steps
{Recommendations for deployment, usage, or v2}

Thank you for using Get Shit Done! 🚀
```

## Output Files

- `MILESTONE-{version}.md` - Complete project summary
- Git tag `v{version}` - Release marker
- `archive/v{version}/` - Archived state
- Updated `PROJECT.md` - Marked complete
- Updated `STATE.md` - Final status

## Success Criteria

- [ ] All phases verified complete
- [ ] Final summary generated
- [ ] Git tag created
- [ ] Project state archived
- [ ] Lessons learned documented
- [ ] User celebrates achievement!

## Notes

**Milestone != End:**
- Projects can have multiple milestones
- v1.0, v2.0, v3.0, etc.
- Each milestone builds on previous
- Archive preserves history

**Why Archive?**
- Provides rollback point
- Documents evolution
- Helps future planning
- Preserves decisions and context
