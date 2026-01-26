# Init Command Refactoring Notes

## Issue Clarification

**User's Original Concern:** `.cloud` folder not being created in root during `aiw init`

**Actual Situation:**
- User meant `.claude` (typo: `.cloud` → `.claude`)
- The `.claude` folder **IS** being created correctly in project root
- In the aiwcli development directory, `.claude/` is gitignored (line 144 in .gitignore)
- This is expected behavior for testing purposes
- In user projects, only `.aiwcli/` is gitignored, not `.claude/`

**Verification:**
- Tested in `/tmp/test-aiw-init` - `.claude/` created successfully
- Tested in aiwcli dev directory - `.claude/` created but gitignored (expected)
- All 545 tests passing
- No functional bugs found

## Refactoring Summary

### Goals Achieved

1. **Centralized Path Management** - Created `IdePathResolver` utility class
   - Single source of truth for all IDE and AIW path construction
   - Reduces coupling by eliminating scattered `join(targetDir, '.claude')` calls
   - Used in: `settings-hierarchy.ts`, `template-installer.ts`, `init/index.ts`

2. **Extracted Methods from run()** - Reduced complexity from 31 to 25
   - `resolveInstallationConfig()` - Handles interactive/flags/minimal branching (36 lines)
   - `performPostInstallActions()` - Handles settings, hooks, gitignore (20 lines)
   - Both methods have proper JSDoc documentation

3. **Improved Parameter Handling**
   - Fixed max-params violation by using config object pattern
   - `performPostInstallActions(config)` instead of 6 separate parameters
   - Fixed bug where `flags.ide` was used instead of `ides` variable

### Files Modified

1. **Created:**
   - `packages/cli/src/lib/ide-path-resolver.ts` - New centralized path resolver

2. **Updated:**
   - `packages/cli/src/lib/settings-hierarchy.ts` - Uses IdePathResolver
   - `packages/cli/src/lib/template-installer.ts` - Uses IdePathResolver
   - `packages/cli/src/commands/init/index.ts` - Extracted methods, reduced complexity

### Remaining Work

**Complexity Warning:** `run()` method still has complexity 25 (target: 20)
- Reduced from 31 (19% improvement)
- Further reduction would require extracting more methods (e.g., status reporting, BMAD-specific logic)
- Current state is significantly improved and maintainable

### Benefits

1. **Reduced Coupling**
   - Path construction centralized in single resolver
   - Changes to path patterns only require updating IdePathResolver
   - Template installer no longer hardcodes `.aiwcli` constant

2. **Improved Readability**
   - Extracted methods have clear, single responsibilities
   - Config object pattern makes parameter passing explicit
   - JSDoc documentation explains each method's purpose

3. **Easier Maintenance**
   - Adding new IDE support: extend IdePathResolver methods
   - Changing installation flow: modify extracted methods
   - Post-install actions: update single method

4. **Test Confidence**
   - All 545 tests passing after refactoring
   - Manual testing confirms .claude folder creation works
   - No regressions introduced

## Developer Notes

### Path Resolution Pattern

```typescript
const resolver = new IdePathResolver(targetDir)

// IDE directories
resolver.getClaudeDir()        // /project/.claude
resolver.getWindsurfDir()      // /project/.windsurf
resolver.getIdeDir('claude')   // /project/.claude

// IDE files
resolver.getClaudeSettings()   // /project/.claude/settings.json
resolver.getClaude('commands/bmad')  // /project/.claude/commands/bmad

// AIW directories
resolver.getAiwcliContainer()  // /project/.aiwcli
resolver.getSharedFolder()     // /project/.aiwcli/_shared
resolver.getMethodFolder('bmad')  // /project/.aiwcli/_bmad
```

### Config Resolution Pattern

```typescript
// Old approach (in run() method):
if (flags.interactive) {
  // 15 lines of wizard logic
} else if (flags.method) {
  // 10 lines of flag logic
} else {
  // 3 lines of minimal install
}

// New approach (extracted method):
const config = await this.resolveInstallationConfig(flags, targetDir, availableTemplates)
if (!config) {
  await this.performMinimalInstall(targetDir)
  return
}
const {method, ides, username, projectName} = config
```

### Post-Install Pattern

```typescript
// Old approach (scattered throughout run()):
await this.trackMethodInstallation(targetDir, method, ides)
if (flags.ide.includes('claude')) { /* ... */ }
if (flags.ide.includes('windsurf')) { /* ... */ }
if (hasGit) { /* ... */ }

// New approach (single config object):
await this.performPostInstallActions({
  targetDir,
  method,
  templatePath,
  ides,
  hasGit,
  foldersForGitignore,
})
```

## Testing Checklist

- [x] All existing tests pass (545/545)
- [x] Manual test: `.claude` folder created in fresh project
- [x] Manual test: `.aiwcli` container created
- [x] Manual test: settings.json populated correctly
- [x] Manual test: hooks merged successfully
- [x] Manual test: .gitignore updated
- [x] Build succeeds without errors
- [x] Lint warnings reduced (8 errors fixed, complexity improved)

## Future Improvements

1. **Further Complexity Reduction**
   - Extract status reporting logic from `run()`
   - Extract BMAD-specific logic into separate method
   - Could potentially reach complexity <20

2. **Additional Path Resolver Methods**
   - `getOutputFolder(methodName)` for method output directories
   - `getTemplateFolder(methodName)` for template sources
   - Centralize all path-related logic

3. **Config Object Pattern**
   - Apply to other methods with 4+ parameters
   - Improves readability and makes changes easier

4. **Integration Tests**
   - Add specific tests for IdePathResolver
   - Test config resolution branches
   - Test post-install actions independently
