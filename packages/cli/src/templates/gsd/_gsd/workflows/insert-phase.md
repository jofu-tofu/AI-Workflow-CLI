# GSD Workflow: Insert Phase

## Purpose

Inject urgent work between existing phases by renumbering subsequent phases.

## Use Case

Use this when:
- Critical work discovered mid-project
- Blocker requires immediate attention
- Dependency discovered that must be addressed before current phase
- Can't wait until end of roadmap

## WARNING

⚠️ **This operation renumbers phases and can be disruptive!**

- Use `/gsd:add-phase` if work can wait
- Only use `/gsd:insert-phase` if truly urgent
- Requires renaming files and updating references

## Process

### Step 1: Validate Urgency

Ask user to confirm:

```markdown
⚠️ INSERT PHASE CONFIRMATION REQUIRED

Inserting a phase will renumber all subsequent phases and require file renaming.

**Current situation:**
- Phases 1-{N} exist
- Want to insert new phase at position {M}
- Phases {M} through {N} will become {M+1} through {N+1}

**Why not append instead?**
If this work can wait until current phases complete, use `/gsd:add-phase` instead.

**Confirm insertion?** (yes/no)
{User must type "yes" to proceed}
```

### Step 2: Current State Analysis

Read project state:
1. `ROADMAP.md` - All current phases
2. `STATE.md` - Current position
3. List all PLAN-phase-*.md files
4. List all VERIFICATION-phase-*.md files

Determine impact:
- Which phases will be renumbered?
- Which files need renaming?
- Is any phase currently in progress?

**CRITICAL CHECK:**
If current phase is {M} or higher and IN PROGRESS:
```markdown
⚠️ CANNOT INSERT - PHASE IN PROGRESS

Phase {M} is currently in progress. Cannot insert before or at this position.

Options:
1. Wait for Phase {M} to complete
2. Insert after Phase {M} instead
3. Cancel insertion

Which would you prefer?
```

### Step 3: Design Inserted Phase

Define new phase (same as `/gsd:add-phase`):

1. Ask discovery questions
2. Define tasks
3. Set verification criteria
4. Identify dependencies

Create phase spec:
```markdown
### Phase {M}: {New Phase Name}
- **Status:** ⏳ Pending
- **Description:** {What this accomplishes}
- **Dependencies:** Phase {M-1}
- **Tasks:**
  - [ ] Task 1
  - [ ] Task 2
  - [ ] Task 3
- **Verification Criteria:**
  - [ ] Criterion 1
  - [ ] Criterion 2
```

### Step 4: Renumbering Plan

Create execution plan for renumbering:

```markdown
## Renumbering Execution Plan

### Files to Rename

**PLAN files:**
{For each phase >= M}
- PLAN-phase-{N}.md → PLAN-phase-{N+1}.md

**VERIFICATION files:**
{For each phase >= M}
- VERIFICATION-phase-{N}.md → VERIFICATION-phase-{N+1}.md

### Content Updates

**ROADMAP.md:**
- Renumber phases {M} through {N}
- Insert new Phase {M}

**STATE.md:**
- Update current phase number if affected

**SUMMARY.md:**
- Update phase references in commit history

**All PLAN-phase-*.md files:**
- Update internal phase number references
```

### Step 5: Execute Renumbering

**Step 5a: Backup Current State**
```bash
# Create backup
mkdir -p .gsd-backup
cp ROADMAP.md .gsd-backup/
cp STATE.md .gsd-backup/
cp SUMMARY.md .gsd-backup/
cp PLAN-phase-*.md .gsd-backup/ 2>/dev/null || true
cp VERIFICATION-phase-*.md .gsd-backup/ 2>/dev/null || true

echo "Backup created in .gsd-backup/"
```

**Step 5b: Rename Files (Reverse Order)**

Rename from highest to lowest to avoid conflicts:

```bash
# Example: Inserting at phase 3, current max is 5
# Rename 5→6, then 4→5, then 3→4

{For i from N down to M}:
  if exists PLAN-phase-{i}.md:
    mv PLAN-phase-{i}.md PLAN-phase-{i+1}.md

  if exists VERIFICATION-phase-{i}.md:
    mv VERIFICATION-phase-{i}.md VERIFICATION-phase-{i+1}.md
```

**Step 5c: Update ROADMAP.md**

1. Read current ROADMAP.md
2. Find phase {M} and all subsequent phases
3. Increment their numbers by 1
4. Insert new phase {M} before old phase {M}
5. Update all phase references
6. Write updated ROADMAP.md

**Step 5d: Update Other Files**

Update phase references in:
- STATE.md
- SUMMARY.md
- All renamed PLAN files (internal references)

### Step 6: Verification

After renumbering:

1. **File Check:**
   ```bash
   ls -la PLAN-phase-*.md
   ls -la VERIFICATION-phase-*.md
   ```
   Confirm sequential numbering with no gaps

2. **Content Check:**
   - Open ROADMAP.md - verify phase sequence
   - Open STATE.md - verify current phase correct
   - Open renamed PLAN files - verify internal numbers updated

3. **Git Status:**
   ```bash
   git status
   ```
   Review all renamed files

### Step 7: Commit Renumbering

Create atomic commit for renumbering:

```bash
git add .
git commit -m "Refactor: Insert Phase {M} - {Phase Name}

Renumbered phases {M}-{N} to {M+1}-{N+1} to accommodate urgent work.

Phase {M}: {New Phase Name}
- {Brief description}
- {Rationale for insertion}

Files renamed:
- PLAN-phase-{M}.md → PLAN-phase-{M+1}.md
...

Updated references in ROADMAP.md, STATE.md, SUMMARY.md"
```

### Step 8: Update STATE.md

Document the insertion:

```markdown
## Key Decisions

### Decision: Insert Phase {M} - {Phase Name}
- **Date:** {Date}
- **Decision:** Inserted urgent phase at position {M}
- **Rationale:** {Why this was urgent and couldn't wait}
- **Impact:** Renumbered phases {M}-{N} to {M+1}-{N+1}
- **Backup:** Preserved in .gsd-backup/
```

### Step 9: Cleanup Backup (After Confirmation)

After user confirms everything looks correct:

```bash
# Remove backup
rm -rf .gsd-backup/
git add .gsd-backup/  # Stage deletion
git commit -m "Cleanup: Remove insertion backup"
```

## Output Files

- Updated `ROADMAP.md` - Phases renumbered, new phase inserted
- Renamed `PLAN-phase-{N+1}.md` files
- Renamed `VERIFICATION-phase-{N+1}.md` files
- Updated `STATE.md` - Decision documented
- Updated `SUMMARY.md` - References updated
- Git commits documenting changes

## Success Criteria

- [ ] Urgency confirmed by user
- [ ] New phase clearly defined
- [ ] All files renamed correctly
- [ ] No gaps in phase numbering
- [ ] All content references updated
- [ ] Changes committed atomically
- [ ] Backup preserved until confirmed

## Rollback Procedure

If insertion goes wrong:

```bash
# Restore from backup
cp .gsd-backup/* .
git checkout -- .
rm -rf .gsd-backup/
```

## Notes

**Think Twice:**
- Insertion is disruptive
- Only use when truly necessary
- Consider `/gsd:add-phase` first
- Or complete current work then add phase

**Best Practices:**
- Always create backup
- Commit each step
- Verify before cleanup
- Document rationale clearly
