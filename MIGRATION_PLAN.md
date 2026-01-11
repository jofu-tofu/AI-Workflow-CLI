# PAI CLI to AI Workflow CLI - Migration Plan

**Version:** 1.0
**Date:** 2026-01-11
**Author:** Algorithm execution (Tofu + Claude)
**Repository:** https://github.com/jofu-tofu/AI-Workflow-CLI

---

## Executive Summary

This document outlines the comprehensive plan to migrate the PAI CLI from the Personal AI Infrastructure (PAI) repository to a standalone AI Workflow CLI repository. The migration will:

- **Create a standalone, distributable CLI** separate from the PAI system
- **Preserve all existing functionality** with zero feature loss
- **Maintain backward compatibility** for existing PAI users during transition
- **Follow industry best practices** for npm package migrations
- **Minimize risk** through comprehensive testing and rollback plans

**Migration Strategy:** Fork Migration (Strategy B)
- Copy CLI to new repository, leave PAI intact
- No breaking changes to existing PAI installations
- Independent evolution of both codebases
- Graceful deprecation path for PAI CLI

---

## 1. Current State Analysis

### 1.1 PAI Repository Structure

```
C:/Users/fujos/.pai/
├── pai-cli/                  # Core CLI implementation (24 TypeScript files)
│   ├── src/
│   │   ├── commands/         # CLI commands (launch, init, hello)
│   │   ├── lib/              # Utilities & installers
│   │   └── templates/bmad/   # BMAD templates (bundled)
│   ├── dist/                 # Compiled JavaScript
│   ├── bin/                  # Entry scripts
│   ├── package.json          # npm configuration
│   └── node_modules/
│
├── hooks/                    # Claude Code hook automation (~10 .ts files)
│   ├── initialize-session.ts
│   ├── security-validator.ts
│   ├── capture-all-events.ts
│   └── ...
│
├── skills/                   # AI skill definitions
│   ├── CORE/
│   ├── Agents/
│   ├── THEALGORITHM/
│   └── ...
│
├── observability/            # Event tracking system
│   ├── apps/server/
│   └── apps/client/
│
├── tools/                    # MCP tools
├── scripts/                  # Setup scripts
│
└── Documentation/
    ├── README.md
    ├── CLAUDE.md
    ├── DEVELOPMENT.md
    └── LICENSE
```

### 1.2 Key Dependencies

**Runtime:**
- Node.js 18+
- npm package manager
- Bun runtime (for hooks)
- TypeScript 5+

**npm Dependencies:**
- @oclif/core ^4.0
- @oclif/plugin-autocomplete ^3.2.39
- @oclif/plugin-help ^6.0
- chalk ^5.6.2
- ora ^9.0.0

**Environment Variables:**
- `PAI_DIR` - Root directory path (CRITICAL)
- `DA` - Assistant name
- `TIME_ZONE` - Local timezone
- Optional: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`

### 1.3 Integration Points

**CLI integrates with:**
1. Claude Code (via `.claude/settings.json` hooks)
2. BMAD templates (bundled in `pai-cli/src/templates/bmad/`)
3. Skills system (references via commands)
4. Hooks system (executed during Claude Code sessions)

---

## 2. Migration Strategy Decision

### 2.1 Strategy Comparison

| Strategy | Pros | Cons | Risk | Recommended |
|----------|------|------|------|-------------|
| **A: Full Migration** | Clean separation | May break PAI system | HIGH | ❌ |
| **B: Fork Migration** | No PAI breakage, independent evolution | Temporary duplication | LOW | ✅ |
| **C: Hybrid** | Minimal duplication | Complex dependencies | MEDIUM | ❌ |

### 2.2 Selected Strategy: Fork Migration (B)

**Rationale:**
1. **Zero risk to existing PAI users** - PAI continues functioning unchanged
2. **Independent evolution** - AI Workflow CLI can evolve separately
3. **Graceful deprecation** - Can sunset PAI CLI over 6-12 months
4. **Time for transition** - Users can migrate at their own pace
5. **Rollback-friendly** - If issues arise, users can revert to PAI CLI

**Implementation:**
- Copy entire `pai-cli/` folder to `aiwcli` repository
- Rename package from `pai-cli` to `aiwcli`
- Update all references, paths, and environment variables
- Create compatibility layer for old environment variables
- Maintain PAI CLI in deprecation mode with shim package

---

## 3. Components to Migrate

### 3.1 MUST MIGRATE (Priority 1 - Core Functionality)

| Component | Source | Destination | Notes |
|-----------|--------|-------------|-------|
| **pai-cli/** | `.pai/pai-cli/` | `aiwcli/packages/cli/` | Core CLI implementation |
| **Source code** | `pai-cli/src/` | `aiwcli/packages/cli/src/` | All 24 TypeScript files |
| **Templates** | `pai-cli/src/templates/bmad/` | `aiwcli/packages/cli/src/templates/bmad/` | Bundled BMAD templates |
| **Package config** | `pai-cli/package.json` | `aiwcli/packages/cli/package.json` | WITH UPDATES (see 4.2) |
| **TypeScript config** | `pai-cli/tsconfig.json` | `aiwcli/packages/cli/tsconfig.json` | Compilation settings |
| **Entry scripts** | `pai-cli/bin/` | `aiwcli/packages/cli/bin/` | run.js, dev.js |
| **Build artifacts** | `pai-cli/dist/` | `aiwcli/packages/cli/dist/` | Regenerate via build |

### 3.2 SHOULD MIGRATE (Priority 2 - Supporting Infrastructure)

| Component | Source | Destination | Notes |
|-----------|--------|-------------|-------|
| **Hooks** | `.pai/hooks/` | `aiwcli/packages/hooks/` | If CLI-dependent |
| **Documentation** | `.pai/README.md` | `aiwcli/README.md` | WITH UPDATES |
| **License** | `.pai/LICENSE` | `aiwcli/LICENSE` | MIT License |
| **Development guide** | `.pai/DEVELOPMENT.md` | `aiwcli/DEVELOPMENT.md` | WITH UPDATES |
| **Claude instructions** | `.pai/CLAUDE.md` | `aiwcli/CLAUDE.md` | WITH UPDATES |
| **Skills (selective)** | `.pai/skills/` | `aiwcli/packages/skills/` | Only CLI-relevant skills |
| **Setup scripts** | `.pai/scripts/setup*.ts` | `aiwcli/scripts/` | Update paths |

### 3.3 OPTIONAL (Priority 3 - Enhancements)

| Component | Source | Destination | Notes |
|-----------|--------|-------------|-------|
| **Observability** | `.pai/observability/` | `aiwcli/packages/observability/` | Event tracking system |
| **BMAD config** | `.pai/_bmad/` | `aiwcli/templates/_bmad/` | Workflow templates |
| **Tools** | `.pai/tools/` | `aiwcli/packages/tools/` | Utility scripts |

### 3.4 DO NOT MIGRATE (User-Specific Data)

| Component | Reason |
|-----------|--------|
| `history/` | User session history (gitignored) |
| `agentic_logs/` | Execution logs (gitignored) |
| `mem-store/` | Memory database (gitignored) |
| `MEMORY/` | Alternative memory storage (gitignored) |
| `node_modules/` | Dependencies (regenerate with npm install) |
| `dist/` (old) | Build artifacts (regenerate with npm run build) |
| `settings.json` | User-specific configuration |
| `.current-session` | Runtime state |
| `agent-sessions.json` | Runtime state |

---

## 4. Required Configuration Changes

### 4.1 Environment Variable Mapping

**Old → New (with backward compatibility):**

| Old Variable | New Variable | Compatibility Layer |
|-------------|-------------|---------------------|
| `PAI_DIR` | `AIWCLI_DIR` | Check `AIWCLI_DIR` first, fallback to `PAI_DIR` with warning |
| `PAI_HOME` | `AIWCLI_HOME` | Check `AIWCLI_HOME` first, fallback to `PAI_HOME` with warning |
| `PAI_CONFIG` | `AIWCLI_CONFIG` | Check `AIWCLI_CONFIG` first, fallback to `PAI_CONFIG` with warning |
| `DA` | `AIWCLI_ASSISTANT_NAME` | Keep `DA` for backward compatibility |

**Implementation in new CLI:**

```typescript
// src/lib/env-compat.ts
export function loadEnvWithCompatibility() {
  // New variable takes precedence
  if (!process.env.AIWCLI_DIR && process.env.PAI_DIR) {
    process.env.AIWCLI_DIR = process.env.PAI_DIR;
    console.warn('⚠️  PAI_DIR is deprecated. Please use AIWCLI_DIR instead.');
  }

  if (!process.env.AIWCLI_HOME && process.env.PAI_HOME) {
    process.env.AIWCLI_HOME = process.env.PAI_HOME;
    console.warn('⚠️  PAI_HOME is deprecated. Please use AIWCLI_HOME instead.');
  }

  // ... similar for other variables
}
```

### 4.2 package.json Updates

**Changes required in `aiwcli/packages/cli/package.json`:**

```json
{
  "name": "aiwcli",                    // Changed from "pai-cli"
  "version": "1.0.0",                  // Major version bump
  "description": "AI Workflow CLI - Command-line interface for AI-powered workflows",
  "repository": {
    "type": "git",
    "url": "https://github.com/jofu-tofu/AI-Workflow-CLI.git"  // Updated
  },
  "homepage": "https://github.com/jofu-tofu/AI-Workflow-CLI",  // Updated
  "bugs": {
    "url": "https://github.com/jofu-tofu/AI-Workflow-CLI/issues"  // Updated
  },
  "bin": {
    "aiwcli": "./bin/run.js"           // Changed from "pai"
  },
  "oclif": {
    "bin": "aiwcli",                   // Changed from "pai"
    "dirname": "aiwcli",               // Changed from "pai"
    "commands": "./dist/commands",
    "repositoryPrefix": "https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/<%- commandPath %>"
  }
  // ... rest remains similar
}
```

### 4.3 Git Configuration

**New repository:**
- Remote: `https://github.com/jofu-tofu/AI-Workflow-CLI.git`
- Default branch: `master`
- README: Updated with new project identity

**Old repository (PAI):**
- Add deprecation notice to README
- Update documentation to point to new repository
- Maintain for security patches only

### 4.4 Path References

**Files with path references to update:**

| File | Old Reference | New Reference |
|------|--------------|---------------|
| `src/commands/launch.ts` | `$env:PAI_DIR` | `$env:AIWCLI_DIR` (with fallback) |
| `src/commands/init.ts` | `~/.pai/` | `~/.aiwcli/` (with migration) |
| `src/lib/installer.ts` | `PAI_DIR` env | `AIWCLI_DIR` env (with fallback) |
| `.claude/settings.json` | `$env:PAI_DIR/hooks/` | `$env:AIWCLI_DIR/hooks/` |
| `scripts/setup.ts` | `process.env.PAI_DIR` | `process.env.AIWCLI_DIR` |
| `README.md` | `~/.pai/` | `~/.aiwcli/` |
| `DEVELOPMENT.md` | `C:/Users/fujos/.pai` | `C:/Users/fujos/.aiwcli` |

---

## 5. Migration Sequence

### 5.1 Phase 1: Repository Setup (Week 1)

**✅ COMPLETED:**
- [x] Create new GitHub repository "AI-Workflow-CLI"
- [x] Initialize with master branch
- [x] Add initial README.md
- [x] Add MIT License

**TODO:**
- [ ] Set up repository structure (monorepo with packages/)
- [ ] Configure GitHub settings (issues, discussions, actions)
- [ ] Set up branch protection rules
- [ ] Configure CI/CD pipelines (GitHub Actions)

### 5.2 Phase 2: Core Migration (Week 1-2)

**Priority 1 - CLI Core:**
1. [ ] Copy `pai-cli/` to `aiwcli/packages/cli/`
2. [ ] Update `package.json` with new name, URLs, bin command
3. [ ] Update `tsconfig.json` if needed
4. [ ] Create environment variable compatibility layer
5. [ ] Update all path references in source code
6. [ ] Update import statements
7. [ ] Build and test: `npm run build`
8. [ ] Local installation test: `npm link`
9. [ ] Command execution test: `aiwcli --version`, `aiwcli hello`

**Priority 2 - Supporting Files:**
10. [ ] Copy and update README.md
11. [ ] Copy LICENSE
12. [ ] Copy and update DEVELOPMENT.md
13. [ ] Copy and update CLAUDE.md
14. [ ] Create MIGRATION.md (user migration guide)
15. [ ] Create .gitignore (based on PAI's but updated)
16. [ ] Create .env.example

### 5.3 Phase 3: Infrastructure Migration (Week 2-3)

**Hooks:**
1. [ ] Evaluate which hooks are CLI-specific vs PAI-specific
2. [ ] Copy relevant hooks to `aiwcli/packages/hooks/`
3. [ ] Update hook scripts with new environment variables
4. [ ] Update `.claude/settings.json` template
5. [ ] Test hooks with Claude Code

**Skills (Selective):**
1. [ ] Identify CLI-relevant skills (e.g., PaiCli -> AiwCli skill)
2. [ ] Copy to `aiwcli/packages/skills/`
3. [ ] Update skill references and documentation
4. [ ] Test skill loading

**Scripts:**
1. [ ] Copy setup scripts to `aiwcli/scripts/`
2. [ ] Update path references
3. [ ] Test setup script execution

### 5.4 Phase 4: Testing (Week 3-4)

**Unit Tests:**
- [ ] Command parsing tests
- [ ] Environment variable compatibility tests
- [ ] Configuration loading tests
- [ ] Path resolution tests

**Integration Tests:**
- [ ] Full command execution tests
- [ ] Hook integration tests
- [ ] Template bundling tests
- [ ] BMAD initialization tests

**Cross-Platform Tests:**
- [ ] Windows (PowerShell, CMD)
- [ ] macOS (zsh, bash)
- [ ] Linux (bash)

**Compatibility Tests:**
- [ ] Legacy PAI_DIR environment variable
- [ ] Old configuration paths
- [ ] Command alias compatibility

### 5.5 Phase 5: Documentation (Week 4)

1. [ ] Complete README.md with installation, usage, examples
2. [ ] Complete MIGRATION.md (comprehensive migration guide)
3. [ ] Update DEVELOPMENT.md with new repository info
4. [ ] Create CONTRIBUTING.md
5. [ ] Create CHANGELOG.md
6. [ ] Update inline code documentation
7. [ ] Generate API documentation (if applicable)

### 5.6 Phase 6: Publication (Week 5)

**npm Publication:**
1. [ ] Create npm account token
2. [ ] Configure package for publication
3. [ ] Test publication to npm (dry-run): `npm publish --dry-run`
4. [ ] Publish to npm: `npm publish --access public`
5. [ ] Verify package on npm registry
6. [ ] Test installation: `npm install -g aiwcli`
7. [ ] Test command execution after global install

**GitHub Release:**
1. [ ] Tag version: `git tag v1.0.0`
2. [ ] Push tag: `git push origin v1.0.0`
3. [ ] Create GitHub release with changelog
4. [ ] Attach build artifacts if needed

### 5.7 Phase 7: PAI Deprecation (Week 6)

**PAI Repository Updates:**
1. [ ] Add deprecation notice to README
2. [ ] Update documentation to point to AI Workflow CLI
3. [ ] Create shim package for `pai-cli` on npm
4. [ ] Publish deprecation message: `npm deprecate pai-cli "Migrated to aiwcli. See: https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/MIGRATION.md"`
5. [ ] Update PAI CLI package.json to show deprecation warning on install

**Shim Package (pai-cli):**
```json
{
  "name": "pai-cli",
  "version": "2.0.0",
  "description": "Deprecated: Use aiwcli instead",
  "main": "index.js",
  "bin": {
    "pai": "./bin/redirect.js"
  },
  "dependencies": {
    "aiwcli": "^1.0.0"
  },
  "postinstall": "echo '⚠️  pai-cli is deprecated. This is a redirect to aiwcli. Migrate: https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/MIGRATION.md'"
}
```

---

## 6. Testing Strategy

### 6.1 Test Coverage Requirements

| Category | Coverage Target | Test Type |
|----------|----------------|-----------|
| Unit Tests | 80%+ | Jest/Mocha |
| Integration Tests | Core commands | End-to-end |
| Compatibility Tests | All env vars | Manual + automated |
| Cross-Platform | Win/Mac/Linux | CI/CD matrix |

### 6.2 Test Matrix

**Commands to Test:**
- `aiwcli --version` - Version display
- `aiwcli help` - Help system
- `aiwcli hello` - Example command
- `aiwcli launch` - Launch Claude Code
- `aiwcli init bmad` - Initialize BMAD
- All commands with legacy `PAI_DIR` environment variable

**Environments to Test:**
- Node.js 18, 20, 22
- Windows 10/11 (PowerShell 5.1, PowerShell 7, CMD)
- macOS (latest 2 versions)
- Linux (Ubuntu 22.04, Ubuntu 24.04)

**Edge Cases:**
- Fresh installation (no existing config)
- Migration from PAI CLI (with existing config)
- Missing environment variables
- Invalid paths
- Concurrent installations (PAI + AIWCLI)

### 6.3 Acceptance Criteria

**All tests must pass before publication:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All cross-platform tests pass
- [ ] Legacy environment variables work with deprecation warnings
- [ ] New installation works on all platforms
- [ ] Migration from PAI CLI preserves user data
- [ ] Documentation is complete and accurate
- [ ] No critical bugs or security issues

---

## 7. Rollback Plan

### 7.1 Rollback Scenarios

| Scenario | Trigger | Action | Timeline |
|----------|---------|--------|----------|
| **Critical Bug** | Breaking bug in aiwcli | Fix immediately or rollback | 24 hours |
| **Incompatibility** | Major compatibility issues | Hotfix or rollback | 48 hours |
| **User Adoption Issues** | <10% adoption after 3 months | Extend PAI support | 6 months |
| **Migration Failures** | Data loss during migration | Restore from backups | Immediate |

### 7.2 Rollback Procedure

**For Users:**
```bash
# Uninstall new CLI
npm uninstall -g aiwcli

# Reinstall old CLI
npm install -g pai-cli@1.5.0

# Restore environment variables
export PAI_DIR=~/.pai  # or set PAI_DIR on Windows
```

**For Developers:**
```bash
# Revert npm publication (cannot unpublish after 72 hours)
# Instead, publish hotfix or deprecate broken version

npm deprecate aiwcli@1.0.0 "Critical bug, use pai-cli@1.5.0 until aiwcli@1.0.1"
```

### 7.3 Backup Requirements

**Before Migration:**
- [ ] Backup entire `.pai/` directory
- [ ] Backup user configurations
- [ ] Backup environment variable settings
- [ ] Document current working state

**Backup Locations:**
- User data: `~/.pai-backup-YYYY-MM-DD/`
- Git state: Tagged commit in PAI repository
- npm state: Old version available on registry

---

## 8. Risk Analysis

### 8.1 Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Path reference breakage** | HIGH | HIGH | Comprehensive compatibility layer + testing |
| **npm name collision** | LOW | HIGH | Check npm registry availability first |
| **User adoption resistance** | MEDIUM | MEDIUM | Clear migration guide + support period |
| **Missing dependencies** | MEDIUM | HIGH | Thorough dependency audit + testing |
| **Environment variable issues** | HIGH | MEDIUM | Backward compatibility layer |
| **Cross-platform failures** | MEDIUM | HIGH | Extensive cross-platform testing |
| **Hook integration breakage** | MEDIUM | MEDIUM | Test hooks thoroughly with Claude Code |
| **Data loss during migration** | LOW | CRITICAL | Automated backups + verification |

### 8.2 Risk Mitigation Matrix

**High Priority (Address First):**
1. **Path Reference Breakage**
   - Mitigation: Create robust compatibility layer
   - Testing: Automated tests for all path resolutions
   - Fallback: Maintain old paths with deprecation warnings

2. **Missing Dependencies**
   - Mitigation: Comprehensive dependency audit
   - Testing: Clean install on fresh systems
   - Fallback: Document all external dependencies

3. **Cross-Platform Failures**
   - Mitigation: CI/CD matrix testing on Win/Mac/Linux
   - Testing: Manual testing on each platform
   - Fallback: Platform-specific installation guides

**Medium Priority (Address During Testing):**
4. **User Adoption Resistance**
   - Mitigation: Excellent migration documentation
   - Communication: Multi-channel announcement
   - Support: Extended PAI CLI support period

5. **Hook Integration Breakage**
   - Mitigation: Test hooks with multiple Claude Code versions
   - Testing: Integration tests in real Claude Code environment
   - Fallback: Hooks can run independently of CLI

**Low Priority (Monitor):**
6. **npm Name Collision**
   - Check: Verify "aiwcli" availability on npm
   - Alternative: Have backup names ready

---

## 9. Timeline and Milestones

### 9.1 Detailed Timeline (6 Weeks to Launch)

```
WEEK 1: Repository & Core Migration
├─ Day 1-2: Repository setup (✅ DONE)
├─ Day 3-4: CLI core migration
├─ Day 5-6: Environment variable compatibility
└─ Day 7: Build and local testing

WEEK 2: Infrastructure Migration
├─ Day 8-9: Hooks migration
├─ Day 10-11: Skills migration (selective)
├─ Day 12-13: Scripts migration
└─ Day 14: Integration testing

WEEK 3: Testing Phase 1
├─ Day 15-16: Unit tests
├─ Day 17-18: Integration tests
├─ Day 19-20: Compatibility tests
└─ Day 21: Test report and fixes

WEEK 4: Testing Phase 2 & Documentation
├─ Day 22-23: Cross-platform testing
├─ Day 24-25: Documentation completion
├─ Day 26-27: Migration guide creation
└─ Day 28: Final review

WEEK 5: Publication Preparation
├─ Day 29-30: npm publication dry-run
├─ Day 31-32: GitHub release preparation
├─ Day 33-34: Final testing and verification
└─ Day 35: Publication to npm + GitHub release

WEEK 6: Deprecation & Launch
├─ Day 36-37: PAI repository deprecation
├─ Day 38-39: Shim package creation
├─ Day 40-41: Announcement and communication
└─ Day 42: Official launch + monitoring
```

### 9.2 Milestone Gates

Each milestone must be completed before proceeding:

**Milestone 1: Core Migration Complete** (End of Week 1)
- [ ] CLI builds successfully
- [ ] Basic commands work locally
- [ ] Environment variables mapped

**Milestone 2: Infrastructure Migrated** (End of Week 2)
- [ ] Hooks integrated
- [ ] Skills accessible
- [ ] Scripts functional

**Milestone 3: Testing Complete** (End of Week 3)
- [ ] All tests pass
- [ ] No critical bugs
- [ ] Cross-platform verified

**Milestone 4: Documentation Complete** (End of Week 4)
- [ ] README comprehensive
- [ ] MIGRATION.md clear
- [ ] All docs reviewed

**Milestone 5: Published** (End of Week 5)
- [ ] npm package live
- [ ] GitHub release created
- [ ] Installation verified

**Milestone 6: Launch** (End of Week 6)
- [ ] Deprecation notices active
- [ ] Announcements sent
- [ ] Support channels ready

---

## 10. Post-Migration Checklist

### 10.1 Verification Checklist

**Technical Verification:**
- [ ] `npm install -g aiwcli` works on all platforms
- [ ] `aiwcli --version` shows correct version
- [ ] All commands execute successfully
- [ ] Legacy environment variables work with warnings
- [ ] New environment variables take precedence
- [ ] Hooks integrate with Claude Code
- [ ] BMAD initialization works
- [ ] Templates are bundled correctly
- [ ] Configuration migration works
- [ ] No data loss during migration
- [ ] Rollback procedure tested

**Documentation Verification:**
- [ ] README is accurate and complete
- [ ] MIGRATION.md is comprehensive
- [ ] CHANGELOG is up-to-date
- [ ] API documentation (if any) is accurate
- [ ] All links work
- [ ] Examples are tested and correct

**Communication Verification:**
- [ ] Deprecation notice in PAI README
- [ ] npm deprecation message published
- [ ] GitHub release created
- [ ] Announcement prepared (if applicable)
- [ ] Migration guide accessible

### 10.2 Success Metrics

**Quantitative Metrics:**
- [ ] npm weekly downloads > 10 (initial target)
- [ ] GitHub stars > 5 (initial target)
- [ ] Zero critical bugs in first week
- [ ] <5% rollback rate

**Qualitative Metrics:**
- [ ] Positive user feedback on migration process
- [ ] Clear communication received
- [ ] Migration guide helpful (user survey)
- [ ] Support requests manageable

---

## 11. Long-Term Deprecation Plan (PAI CLI)

### 11.1 Deprecation Timeline

```
Month 1-2 (Weeks 6-14):
├─ Announce deprecation across all channels
├─ Release shim package
├─ Active support for both packages
└─ Encourage migration

Month 3-6 (Weeks 15-26):
├─ Continue supporting both packages
├─ Monitor adoption metrics
├─ Address migration issues quickly
└─ Regular communication updates

Month 7-9 (Weeks 27-39):
├─ Reduce PAI CLI updates to security fixes only
├─ Final migration push
├─ Sunset timeline announced (specific date)
└─ Archive planning

Month 10-12 (Weeks 40-52):
├─ Archive PAI CLI repository
├─ Move npm package to maintenance-only
├─ Keep shim package for legacy compatibility
└─ Document migration history
```

### 11.2 Support Commitment

**Full Support (Months 1-6):**
- Bug fixes for both PAI CLI and AI Workflow CLI
- Active monitoring of issues
- Quick response to migration problems

**Maintenance Mode (Months 7-9):**
- Security fixes only for PAI CLI
- All new features in AI Workflow CLI only
- Clear sunset timeline communicated

**Archive (Month 10+):**
- No active development on PAI CLI
- Repository marked as archived
- Redirect to AI Workflow CLI for all support

---

## 12. Appendices

### Appendix A: Command Mapping

| Old Command (PAI CLI) | New Command (AI Workflow CLI) | Notes |
|-----------------------|-------------------------------|-------|
| `pai --version` | `aiwcli --version` | Version info |
| `pai hello` | `aiwcli hello` | Example command |
| `pai launch` | `aiwcli launch` | Launch Claude Code |
| `pai init bmad` | `aiwcli init bmad` | Initialize BMAD |
| `pai help` | `aiwcli help` | Help system |
| `pai autocomplete` | `aiwcli autocomplete` | Shell autocomplete |

### Appendix B: File Structure Comparison

**Before (PAI):**
```
~/.pai/
├── pai-cli/
├── hooks/
├── skills/
└── ...
```

**After (AI Workflow CLI):**
```
~/.aiwcli/
├── packages/
│   ├── cli/
│   ├── hooks/
│   └── skills/
├── config/
└── data/
```

### Appendix C: Environment Variable Comparison

| Aspect | PAI CLI | AI Workflow CLI |
|--------|---------|-----------------|
| Root dir | `PAI_DIR` | `AIWCLI_DIR` (fallback to `PAI_DIR`) |
| Home dir | `PAI_HOME` | `AIWCLI_HOME` (fallback to `PAI_HOME`) |
| Config | `PAI_CONFIG` | `AIWCLI_CONFIG` (fallback to `PAI_CONFIG`) |
| Assistant | `DA` | `DA` (maintained for compatibility) |

### Appendix D: Key Contacts and Resources

**Repository:**
- Old: https://github.com/jofu-tofu/pai
- New: https://github.com/jofu-tofu/AI-Workflow-CLI

**npm:**
- Old: https://npmjs.com/package/pai-cli (deprecated)
- New: https://npmjs.com/package/aiwcli

**Documentation:**
- Migration Guide: https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/MIGRATION.md
- README: https://github.com/jofu-tofu/AI-Workflow-CLI/blob/main/README.md

---

## Conclusion

This migration plan provides a comprehensive roadmap for transitioning the PAI CLI to a standalone AI Workflow CLI repository. By following industry best practices, maintaining backward compatibility, and providing clear communication, we can ensure a smooth migration with minimal disruption to existing users.

**Key Success Factors:**
1. ✅ Fork migration strategy (low risk)
2. ✅ Backward compatibility layer (user-friendly)
3. ✅ Comprehensive testing (quality assurance)
4. ✅ Clear documentation (user support)
5. ✅ Gradual deprecation (no forced migration)
6. ✅ Rollback plan (risk mitigation)

**Next Steps:**
1. Review and approve this migration plan
2. Begin Phase 2: Core Migration
3. Execute migration sequence (6-week timeline)
4. Launch AI Workflow CLI
5. Deprecate PAI CLI over 6-12 months

---

**Document Status:** Draft v1.0
**Last Updated:** 2026-01-11
**Prepared by:** Algorithm execution (THEALGORITHM skill)
