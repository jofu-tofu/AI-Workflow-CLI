# CC-Native v1.4.0 Migration Guide

## Breaking Change: Configuration File Rename

**Before (v1.3.0):** `_cc-native/config.json`
**After (v1.4.0):** `_cc-native/plan-review.config.json`

### Action Required

```bash
cd _cc-native
mv config.json plan-review.config.json
```

**Why the change?**
- Clarifies purpose (plan review configuration)
- Prevents confusion with other config files
- Aligns with naming convention (feature-specific configs)

---

## New Features (Non-Breaking)

### State Management (v2.0.0 Schema)
- Plan-adjacent state files survive session changes
- Iteration tracking across plan reviews
- Task metadata persistence

**No action required** - State files created automatically on first use.

### Atomic Writes
- Cross-platform atomic file writes (Windows + POSIX)
- Retry logic with backoff
- Error markers for debugging

**No action required** - Enabled by default via `CC_NATIVE_ROBUST_WRITES=true`.

### AIW_DIR Support
- Development mode for isolated testing
- State files in `$AIW_DIR/_cc-native/plans/`

**No action required** - Only set `AIW_DIR` if developing/testing CC-Native.

---

## Upgrade Checklist

- [ ] Rename `config.json` → `plan-review.config.json` (if customized)
- [ ] Test plan workflow: exit plan mode → review → archive
- [ ] Verify output in `_output/cc-native/plans/`
- [ ] Check state files in `~/.claude/plans/*.state.json`

---

## Rollback

If you need to revert to v1.3.0:

```bash
git checkout v1.3.0 -- _cc-native/
mv _cc-native/plan-review.config.json _cc-native/config.json
```

**Note:** State files (v2.0.0 schema) will be ignored by v1.3.0 but won't cause errors.

---

## What Stays the Same

- Workflow files (`_cc-native/workflows/*.md`)
- Hook execution order (set_plan_state → review → archive)
- Agent definitions (`.claude/agents/cc-native/`)
- Output structure (`_output/cc-native/plans/`)
- All slash commands (`/cc-native:*`)

---

## Questions?

See TEMPLATE-SCHEMA.md for full documentation or report issues at the project repository.
