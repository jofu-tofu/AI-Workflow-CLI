# CC-Native v1.5.0 Migration Guide

## Breaking Change: Context-Integrated Plan Review

**Before (v1.4.0):** Reviews stored in `_output/cc-native/plans/{date}/{slug}/reviews/`
**After (v1.5.0):** Reviews stored in `_output/contexts/{context_id}/reviews/`

### What Changed

1. **Removed `set_plan_state.py`** - No longer needed. Plan review now integrates with the shared context system.

2. **Iteration state** - Now stored in `_output/contexts/{context_id}/reviews/iteration.json` instead of `~/.claude/plans/*.state.json`

3. **Review output** - Written to context reviews folder when a context is active, with legacy fallback for backward compatibility.

### Migration Steps

**Automatic migration** - No action required. The hook will:
- Use context reviews folder when an active context exists
- Fall back to legacy path if no context found
- Existing reviews remain in their original locations

---

## v1.4.0 Migration (Previous)

### Configuration File Rename

**Before (v1.3.0):** `_cc-native/config.json`
**After (v1.4.0):** `_cc-native/plan-review.config.json`

```bash
cd _cc-native
mv config.json plan-review.config.json
```

---

## Features

### Context-Integrated Reviews (v1.5.0)
- Reviews written to `_output/contexts/{context_id}/reviews/`
- Iteration state persists across sessions in context folder
- Automatic context discovery via session_id or single in-flight context

### Atomic Writes
- Cross-platform atomic file writes (Windows + POSIX)
- Retry logic with backoff
- Error markers for debugging

**No action required** - Enabled by default via `CC_NATIVE_ROBUST_WRITES=true`.

---

## Upgrade Checklist

- [ ] Test plan workflow: exit plan mode → review → archive
- [ ] Verify reviews appear in `_output/contexts/{context_id}/reviews/`
- [ ] Check iteration tracking persists across plan revisions

---

## Rollback

If you need to revert to v1.4.0:

```bash
git checkout v1.4.0 -- _cc-native/
```

**Note:** Existing reviews in context folders will remain but won't be used.

---

## What Stays the Same

- Workflow files (`_cc-native/workflows/*.md`)
- Agent definitions (`.claude/agents/cc-native/`)
- All slash commands (`/cc-native:*`)
- Plan archiving behavior (`archive_plan.py`)

---

## Questions?

See TEMPLATE-SCHEMA.md for full documentation or report issues at the project repository.
