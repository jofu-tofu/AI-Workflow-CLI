# Template for Cross AI Assistant Compatibility - Issues

## Phase 2 Verification - Priority 1 Fixes Required

**Status:** ✅ COMPLETED (2026-01-12)
**Actual Effort:** ~2 hours
**Completed:** Current session

### Issue 1: Security Guidance Missing (HIGH) - ✅ RESOLVED
- **Priority:** HIGH
- **Resolved:** 2026-01-12
- **Source:** HIQ-1 Architectural Coherence Report
- **Description:** Advisory-only permission emulation presents security risk. No explicit warnings about enforcement limitations in documentation.
- **Impact:** Users may assume permissions are enforced on all platforms when Windsurf and GitHub Copilot have advisory-only restrictions
- **Fix Required:**
  - Add "Security Considerations" section to PLATFORM-ADAPTERS.md
  - Document that permission emulation is advisory on Windsurf/Copilot
  - Warn that security-critical operations should use platforms with enforcement (Claude Code)
- **Effort:** Small (1-2 paragraphs)

### Issue 2: Model Identifiers Outdated (HIGH) - ✅ RESOLVED
- **Priority:** HIGH
- **Resolved:** 2026-01-12
- **Source:** SANA Platform Capability Audit, HIQ-2 Schema Completeness
- **Description:** Model identifiers not current as of January 2026
- **Required Updates:**
  - **Claude Code:** Use full version strings (e.g., `claude-sonnet-4-5-20250929` instead of `sonnet`)
  - **GitHub Copilot:** Update model list to include `gemini-2.0-flash`, `openai-o3-mini`; remove outdated models
- **Files Affected:** STANDARD-SCHEMA.md lines 182-208
- **Effort:** Small (text updates)

### Issue 3: Missing Schema Fields (HIGH) - ✅ RESOLVED
- **Priority:** HIGH (disable-model-invocation), MEDIUM (others)
- **Resolved:** 2026-01-12
- **Note:** Task tool was already present; added disable-model-invocation and argument-hint
- **Source:** HIQ-2 Schema Completeness Report
- **Missing Fields:**
  1. `disable-model-invocation` (Claude Code) - Skip AI processing for lightweight commands
  2. `argument-hint` (Claude Code) - User guidance for command arguments
  3. `Task` tool - Subagent spawning capability missing from allowed-tools list
- **Files Affected:** STANDARD-SCHEMA.md lines 141-296
- **Effort:** Medium (field definitions + examples)

### Issue 4: Permission Scoping Unclear (HIGH) - ✅ RESOLVED
- **Priority:** HIGH
- **Resolved:** 2026-01-12
- **Source:** HIQ-4 Transformation Logic, HIQ-7 Practical Implementation
- **Description:** Unclear whether skill frontmatter permissions are global or scoped to the skill
- **Current State:** PLATFORM-ADAPTERS.md Section 1.4 mentions merging but doesn't specify scope
- **Required Clarification:**
  - Are permissions in skill frontmatter added to global settings.json or skill-scoped?
  - What is the complete merging algorithm (append vs replace)?
  - How are conflicts between skill and project permissions resolved?
- **Files Affected:** PLATFORM-ADAPTERS.md lines 110-130
- **Effort:** Medium (algorithm specification + examples)

### Issue 5: Structure Mapping Errors (HIGH) - ✅ RESOLVED
- **Priority:** HIGH
- **Resolved:** 2026-01-12
- **Source:** HIQ-3 Structure Mapping Accuracy
- **Incorrect Mappings:**
  1. **Windsurf LOCAL.md location** - Currently shows `.windsurf/rules/local.md` but should be `~/.codeium/windsurf/memories/global_rules.md`
  2. **Missing Windsurf Memories system** - Critical feature not mapped in platform table
  3. **Missing Claude Code global skills** - `~/.claude/skills/` user-level directory not documented
- **Files Affected:** STANDARD-STRUCTURE.md lines 64-80
- **Effort:** Small (table corrections)

---

## Phase 2 Verification - Priority 2 Recommendations

**Status:** Should be addressed for usability
**Estimated Effort:** 1-2 days
**Assigned:** Before Phase 3 complete

### Issue 6: Troubleshooting Missing
- **Priority:** MEDIUM
- **Source:** HIQ-5 Documentation Clarity
- **Description:** No error handling, validation checklist, or troubleshooting section
- **Impact:** Developers cannot debug transformation issues
- **Effort:** Medium (new section with examples)

### Issue 7: Quick Start Guides Missing
- **Priority:** MEDIUM
- **Source:** HIQ-5 Documentation Clarity
- **Description:** Examples appear after 600 lines; no minimal working examples early
- **Impact:** High friction for developers wanting to get started quickly
- **Effort:** Medium (quick start sections in all 3 docs)

### Issue 8: Conditional Emulation Undefined
- **Priority:** MEDIUM
- **Source:** HIQ-4 Transformation Logic, HIQ-7 Practical Implementation
- **Description:** When to skip emulation patterns unclear (e.g., context markers for glob triggers)
- **Impact:** Inconsistent implementations across different developers
- **Effort:** Medium (decision trees + examples)

### Issue 9: Injection Points Ambiguous
- **Priority:** MEDIUM
- **Source:** HIQ-7 Practical Implementation
- **Description:** Exact markdown structure for emulation block placement undefined
- **Impact:** Inconsistent output formatting
- **Effort:** Small (markdown structure examples)

---

## Future Enhancements (Priority 3)

### Enhancement 1: Machine-Readable JSON Schema
- **Priority:** Low
- **Source:** HIQ-1 Architectural Coherence
- **Description:** Create programmatic validation schema (`standard-schema.json`)
- **Rationale:** Enable consistent validation across tooling implementations
- **Effort:** Medium

### Enhancement 2: Comprehensive Chunking Algorithm
- **Priority:** Low
- **Source:** HIQ-5 Documentation Clarity
- **Description:** Specify concrete chunking algorithm with pseudocode
- **Rationale:** Deterministic chunking for Windsurf's 12K character limit
- **Effort:** Small

### Enhancement 3: GAP-ANALYSIS Cross-Links
- **Priority:** Low
- **Source:** HIQ-6 Cross-Reference Validation
- **Description:** Link each gap in GAP-ANALYSIS.md to corresponding emulation pattern in PLATFORM-ADAPTERS.md
- **Rationale:** Easier navigation and verification
- **Effort:** Small

---

## Technical Debt

None identified during Phase 2 verification.

---

## Post-Release Issues

### Issue 10: Test Suite Needs Cleanup
- **Priority:** MEDIUM
- **Status:** Documented
- **Date:** 2026-01-13
- **Description:** Test suite contains references to removed commands (hello:world, base command, debug tests)
- **Impact:** Test suite fails, though core functionality works
- **Required Fixes:**
  - Remove tests for non-existent commands (hello:world references)
  - Fix paths.test.ts workspace detection tests
  - Remove or update integration tests using bun:test syntax
  - Update subcommand architecture tests for actual commands
- **Effort:** Medium (2-4 hours)
- **Note:** Core convert and init commands work correctly; tests need alignment with actual codebase

---

## Ideas Backlog

### Bidirectional Sync Strategy
- **Source:** HIQ-1 Architectural Coherence
- **Description:** Define how changes from platform-native files sync back to superset templates
- **Consideration:** "Source of truth" policy or change detection mechanism

### Version Migration Guide
- **Source:** HIQ-1 Architectural Coherence
- **Description:** Document migration path for future schema versions
- **Consideration:** Semantic versioning policy for the schema itself

---

**Last Updated:** 2026-01-12
