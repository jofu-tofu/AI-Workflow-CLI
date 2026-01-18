# GSD Workflow: What's New

## Purpose

Display recent updates, breaking changes, and new features in the GSD system.

## Process

Display version information:

```markdown
# What's New in GSD

## Version 2.0 (Current)

### Breaking Changes

⚠️ **Output Directory Changed**
- Old: `_GSD_OUTPUT/`
- New: `.planning/`

⚠️ **Workflows Merged/Deprecated**
- `create-roadmap` → merged into `new-project`
- `plan-fix` → absorbed into `verify-work`
- `execute-plan` → replaced by `execute-phase`

### New Features

#### 5 Core Loop Workflows
1. `new-project` - Unified discovery + roadmap
2. `discuss-phase` - NEW: Pre-planning decisions
3. `plan-phase` - Enhanced with research + waves
4. `execute-phase` - NEW: Wave-based parallel execution
5. `verify-work` - Enhanced with auto-diagnosis

#### New Templates
- `REQUIREMENTS.md` - V1/V2 requirements tracking
- `CONTEXT.md` - Discussion decisions
- `RESEARCH.md` - Research findings

#### New Utility Commands
- `research-phase` - Standalone research
- `list-phase-assumptions` - View assumptions
- `remove-phase` - Remove and renumber
- `new-milestone` - Start next version
- `debug` - Systematic debugging
- `add-todo` - Quick idea capture
- `check-todos` - Review captured items
- `help` - Command reference
- `whats-new` - This message

### Enhancements

#### Wave-Based Execution
- Tasks grouped by dependencies
- Parallel execution within waves
- Fresh 200k context per task

#### Requirements Traceability
- Requirements linked to phases
- Tasks traced to requirements
- Verification against requirements

#### Integrated Research
- Research during plan-phase
- Spawns research agents
- Findings in RESEARCH.md

#### Conversational UAT
- One-by-one verification
- Auto-diagnosis on failure
- Integrated fix planning

### Migration Guide

If upgrading from GSD 1.x:

1. **Rename output directory:**
   ```bash
   mv _GSD_OUTPUT .planning
   ```

2. **Update workflows:**
   - Use `new-project` instead of `new-project` + `create-roadmap`
   - Use `execute-phase` instead of `execute-plan`
   - Use `verify-work` (includes plan-fix functionality)

3. **Add new templates:**
   - Create REQUIREMENTS.md from template
   - Create CONTEXT.md if using discuss-phase

## Previous Versions

### Version 1.0
- Initial GSD implementation
- 13 workflows
- _GSD_OUTPUT directory
```

## Output

Display only
