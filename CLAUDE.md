# Instructions for Claude

## Before Development or Testing

**Read DEVELOPMENT.md first.** It contains environment setup that prevents path errors, test failures, and cross-environment pollution.

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

## Hook Development

See `.aiwcli/_cc-native/hooks/CLAUDE.md` for hook development patterns, API format, debugging, and the py_compile verification workflow.
