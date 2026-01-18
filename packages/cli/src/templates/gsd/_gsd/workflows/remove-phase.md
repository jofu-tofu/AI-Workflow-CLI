# GSD Workflow: Remove Phase

## Purpose

Remove a phase from the roadmap and renumber subsequent phases.

## Warning

⚠️ **This operation renumbers phases and can be disruptive!**

- All subsequent phases will be renumbered
- Plan files will be renamed
- References will need updating

## Process

### Step 1: Validate Removal

```markdown
## Remove Phase Confirmation

**Phase to Remove:** {N} - {Phase Name}
**Status:** {Current status}

**Impact:**
- Phases {N+1} through {Total} will become {N} through {Total-1}
- Files PLAN-phase-{N+1}.md+ will be renamed
- References in STATE.md, SUMMARY.md will be updated

**Are you sure?** (yes/no)
```

### Step 2: Execute Removal

1. Backup current state
2. Remove phase from ROADMAP.md
3. Renumber subsequent phases
4. Rename plan files
5. Update references

### Step 3: Verify

- Confirm no gaps in numbering
- All references updated
- No orphaned files

## Output

- Updated `.planning/ROADMAP.md`
- Renamed `.planning/PLAN-phase-*.md` files
- Updated `.planning/STATE.md`
