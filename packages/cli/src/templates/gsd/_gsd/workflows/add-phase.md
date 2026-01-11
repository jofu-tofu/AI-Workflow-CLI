# GSD Workflow: Add Phase

## Purpose

Append new phases to the end of an existing roadmap when scope expands or new requirements emerge.

## Use Case

Use this when:
- Original roadmap complete but more work needed
- New features requested after initial planning
- Project scope expands
- Enhancement ideas mature into full phases

## Process

### Step 1: Current State Analysis

Read project state:
1. `ROADMAP.md` - Current phases and status
2. `PROJECT.md` - Original goals and vision
3. `STATE.md` - Recent decisions and context
4. `ISSUES.md` - Deferred enhancements that might become phases

Determine:
- How many phases currently exist?
- What's the last phase number?
- Are all current phases complete or in progress?

### Step 2: Understand New Requirements

Ask user questions to define new phase:

1. **What's the goal?**
   - What should this phase accomplish?
   - Why is this needed?

2. **Dependencies?**
   - Does this depend on current phases?
   - Can it run in parallel or must be sequential?

3. **Scope?**
   - What's included?
   - What's explicitly not included?

4. **Priority?**
   - Should this be next, or later?
   - Any time constraints?

### Step 3: Design New Phase

Create phase specification:

```markdown
### Phase {N+1}: {Phase Name}
- **Status:** ⏳ Pending
- **Description:** {What this phase accomplishes}
- **Dependencies:** {Previous phases or "None"}
- **Tasks:**
  - [ ] Task 1
  - [ ] Task 2
  - [ ] Task 3
- **Verification Criteria:**
  - [ ] Criterion 1
  - [ ] Criterion 2
```

### Step 4: Integration Strategy

Decide where to add:

**Append to End (Default):**
- New phase becomes Phase {N+1}
- Added to bottom of phase sequence
- Doesn't affect current work

**Insert (If urgent):**
- If phase is urgent and can't wait
- Use `/gsd:insert-phase` instead
- Renumbers subsequent phases

### Step 5: Update ROADMAP.md

Add new phase to ROADMAP.md:

1. Read current ROADMAP.md
2. Find "Phase Sequence" section
3. Append new phase after last phase
4. Maintain formatting consistency

Example:
```markdown
### Phase 4: Authentication System
...

### Phase 5: User Profiles  <-- Existing last phase
...

### Phase 6: Email Notifications  <-- NEW PHASE
- **Status:** ⏳ Pending
- **Description:** Add email notification system for user events
- **Dependencies:** Phase 5 (User Profiles)
- **Tasks:**
  - [ ] Set up email service integration
  - [ ] Create email templates
  - [ ] Implement notification triggers
- **Verification Criteria:**
  - [ ] Users receive welcome emails
  - [ ] Notification preferences work
```

### Step 6: Update PROJECT.md (if needed)

If new phase expands original vision:

1. Add to goals if it's a new goal:
   ```markdown
   ## Goals
   - ✅ Goal 1 (completed)
   - ✅ Goal 2 (completed)
   - [ ] Goal 3 (in progress)
   - [ ] Goal 4 - Email notifications (NEW)
   ```

2. Update success criteria if needed

3. Don't remove old goals - mark them complete

### Step 7: Update STATE.md

Document the addition:

```markdown
## Key Decisions

### Decision: Add Email Notifications Phase
- **Date:** {Date}
- **Decision:** Added Phase 6 for email notification system
- **Rationale:** User feedback requested notification features
- **Implications:** Extends timeline by estimated {duration}
```

### Step 8: Confirmation

Show user:
- Updated roadmap with new phase
- Updated phase count
- Impact on timeline/scope
- Next steps

Ask: "Does this capture the new phase correctly?"

## Output Files

- Updated `ROADMAP.md` - New phase appended
- Updated `PROJECT.md` - Goals adjusted if needed
- Updated `STATE.md` - Decision documented

## Success Criteria

- [ ] New phase clearly defined
- [ ] Phase number correct (N+1)
- [ ] Dependencies identified
- [ ] Tasks outlined
- [ ] Verification criteria specified
- [ ] ROADMAP.md updated
- [ ] User confirms accuracy

## Example

**Before:**
```markdown
## Phase Sequence

### Phase 1: Setup ✅ Complete
### Phase 2: Core Features ✅ Complete
### Phase 3: Polish 🔄 In Progress
```

**After:**
```markdown
## Phase Sequence

### Phase 1: Setup ✅ Complete
### Phase 2: Core Features ✅ Complete
### Phase 3: Polish 🔄 In Progress
### Phase 4: Analytics Dashboard ⏳ Pending  <-- ADDED
```

## Notes

**When NOT to Add Phase:**
- If work fits in existing phase - just add tasks instead
- If it's a bug fix - use `/gsd:plan-fix` instead
- If it's a tiny enhancement - add to ISSUES.md as future work

**Add Phase When:**
- Work is substantial (>3 tasks)
- Logically separate from existing phases
- Has its own verification criteria
- Could be deployed independently
