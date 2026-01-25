# Instructions for Claude

## When Doing Development or Testing Work

**Before ANY development or testing tasks, read DEVELOPMENT.md first.**

DEVELOPMENT.md contains critical environment setup instructions that prevent:
- Test failures from incorrect paths
- Files created in wrong locations
- Development work polluting production environment

## Execution Pattern

1. Read DEVELOPMENT.md (if not already read this session)
2. Follow setup instructions in DEVELOPMENT.md
3. Verify environment is configured correctly
4. Proceed with development or testing tasks

## Template Synchronization

**When modifying hooks, library code, or settings in `.aiwcli/`:**

Changes to the working directory (`.aiwcli/`) should also be applied to the template at `packages/cli/src/templates/cc-native/`. This ensures new project initializations receive the updates.

**Files that need synchronization:**
- `.aiwcli/_shared/hooks/*.py` → `packages/cli/src/templates/cc-native/_shared/hooks/`
- `.aiwcli/_shared/lib/**/*.py` → `packages/cli/src/templates/cc-native/_shared/lib/`
- `.aiwcli/_cc-native/**/*.py` → `packages/cli/src/templates/cc-native/_cc-native/`
- `.claude/settings.json` → `packages/cli/src/templates/cc-native/.claude/settings.json`

**When to sync:**
- Adding new hooks
- Modifying hook behavior
- Adding/changing library functions used by hooks
- Updating settings.json hook configurations

**Note:** The `dist/` directory is auto-generated during build - only update `src/templates/`.
