# GSD Migration Guide

## Migrating from GSD 1.x to 2.0

This guide covers breaking changes and migration steps for upgrading from GSD 1.x to 2.0.

## Breaking Changes

### 1. Output Directory Changed

**Before (1.x):**
```
_GSD_OUTPUT/
├── PROJECT.md
├── ROADMAP.md
├── STATE.md
└── ...
```

**After (2.0):**
```
_output/gsd/.planning/
├── PROJECT.md
├── ROADMAP.md
├── STATE.md
└── ...
```

**Migration:**
```bash
# Rename the output directory
mkdir -p _output/gsd && mv _GSD_OUTPUT _output/gsd/.planning

# Update .gitignore
sed -i 's/_GSD_OUTPUT/_output/gsd/.planning/' .gitignore
```

### 2. Workflows Merged/Removed

| Old Workflow | Status | Replacement |
|--------------|--------|-------------|
| `create-roadmap` | **REMOVED** | Merged into `new-project` |
| `plan-fix` | **REMOVED** | Absorbed into `verify-work` |
| `execute-plan` | **REMOVED** | Replaced by `execute-phase` |

**Migration:**
- Use `/gsd:new-project` instead of `/gsd:new-project` + `/gsd:create-roadmap`
- Use `/gsd:verify-work` for issue diagnosis (no need for `/gsd:plan-fix`)
- Use `/gsd:execute-phase` instead of `/gsd:execute-plan`

### 3. New Required Files

If you have existing GSD 1.x projects, you may need to create these new files:

**REQUIREMENTS.md:**
```bash
# Create from template
cp _gsd/templates/REQUIREMENTS.md.template _output/gsd/.planning/REQUIREMENTS.md
# Edit to add your requirements
```

**CONTEXT.md (optional):**
```bash
# Only needed if using discuss-phase
cp _gsd/templates/CONTEXT.md.template _output/gsd/.planning/CONTEXT.md
```

**RESEARCH.md (optional):**
```bash
# Only needed if research was conducted
cp _gsd/templates/RESEARCH.md.template _output/gsd/.planning/RESEARCH.md
```

### 4. Plan File Format Changes

**Before (1.x):**
```xml
<task>
  <action>...</action>
  <verification>...</verification>
  <rollback>...</rollback>
</task>
```

**After (2.0):**
```xml
<task id="1" wave="1">
  <title>...</title>
  <objective>...</objective>
  <requirements>V1-F01, V1-N01</requirements>
  <action>...</action>
  <decisions>...</decisions>
  <verification>...</verification>
  <rollback>...</rollback>
  <acceptance_criteria>...</acceptance_criteria>
</task>
```

**Migration:**
Existing plan files will still work, but new features (wave-based execution, requirements traceability) require the new format. Re-run `/gsd:plan-phase` to regenerate plans.

## New Features

### 5 Core Loop Commands

The 13 workflows have been reorganized into a 5-command core loop:

1. `/gsd:new-project` - Unified project + roadmap
2. `/gsd:discuss-phase` - **NEW**: Pre-planning decisions
3. `/gsd:plan-phase` - Enhanced with waves + requirements
4. `/gsd:execute-phase` - **NEW**: Wave-based execution
5. `/gsd:verify-work` - Enhanced with auto-diagnosis

### 9 New Utility Commands

| Command | Purpose |
|---------|---------|
| `/gsd:research-phase` | Standalone research |
| `/gsd:list-phase-assumptions` | View assumptions |
| `/gsd:remove-phase` | Remove and renumber |
| `/gsd:new-milestone` | Start next version |
| `/gsd:debug` | Systematic debugging |
| `/gsd:add-todo` | Capture ideas |
| `/gsd:check-todos` | List pending |
| `/gsd:help` | Command reference |
| `/gsd:whats-new` | Version updates |

### 3 New Templates

| Template | Purpose |
|----------|---------|
| REQUIREMENTS.md | V1/V2 requirements with traceability |
| CONTEXT.md | Discussion decisions per phase |
| RESEARCH.md | Research findings |

## Step-by-Step Migration

### For Existing Projects

1. **Backup your project:**
   ```bash
   cp -r _GSD_OUTPUT _GSD_OUTPUT_BACKUP
   ```

2. **Rename output directory:**
   ```bash
   mkdir -p _output/gsd && mv _GSD_OUTPUT _output/gsd/.planning
   ```

3. **Update gitignore:**
   ```bash
   # Edit .gitignore, replace:
   # _GSD_OUTPUT/
   # With:
   # _output/gsd/.planning/
   ```

4. **Create REQUIREMENTS.md:**
   Extract requirements from your PROJECT.md and ROADMAP.md into the new REQUIREMENTS.md format.

5. **Verify files:**
   ```bash
   ls -la _output/gsd/.planning/
   # Should show: PROJECT.md, ROADMAP.md, STATE.md, etc.
   ```

6. **Test with progress:**
   ```bash
   /gsd:progress
   # Should show your current state
   ```

### For New Projects

Simply use the new workflow:

```bash
# Initialize new project
/gsd:new-project

# Optional: Discuss phase details
/gsd:discuss-phase 1

# Create execution plan
/gsd:plan-phase 1

# Execute with wave-based parallelism
/gsd:execute-phase

# Verify with conversational UAT
/gsd:verify-work 1
```

## Compatibility Notes

### Backward Compatibility

- Old plan files (without `wave` attribute) still work with `/gsd:execute-phase`
- They will execute sequentially (as if all tasks are Wave 1)
- Re-run `/gsd:plan-phase` to get wave groupings

### Forward Compatibility

- Projects created with 2.0 cannot use deprecated commands
- `create-roadmap`, `plan-fix`, `execute-plan` are no longer available

## Troubleshooting

### Error: "ROADMAP.md not found"

**Cause:** Still looking in `_GSD_OUTPUT/`

**Fix:** Ensure output directory is renamed to `_output/gsd/.planning/`

### Error: "REQUIREMENTS.md not found"

**Cause:** New file required for plan-phase

**Fix:** Create REQUIREMENTS.md from template or run `/gsd:new-project`

### Commands not working

**Cause:** IDE stubs may be outdated

**Fix:** Re-run `aiw init --method gsd --ide claude` to update

## Getting Help

- Run `/gsd:help` for command reference
- Run `/gsd:whats-new` for version details
- Check `GSD-README.md` for full documentation

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2026-01 | 5-core loop, wave execution, new templates |
| 1.0.0 | 2026-01 | Initial release |
