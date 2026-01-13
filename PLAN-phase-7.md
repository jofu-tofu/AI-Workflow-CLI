# Execution Plan - Phase 7

## Overview

**Phase:** Documentation and Polish
**Created:** 2026-01-13
**Status:** Completed

## Context

Phase 7 finalizes the AI Workflow CLI project by creating comprehensive user-facing documentation. Phases 1-6 built the technical foundation:
- Research and capability mapping (Phase 1)
- Standard template schema (Phase 2)
- Workaround patterns (Phase 3)
- Programmatic mapping engine (Phase 4)
- Semantic content transformation (Phase 5)
- Reference implementations (Phase 6)

This phase makes the system accessible to users by documenting how to use it effectively.

## Tasks

### Task 1: Template Format User Guide

**Objective:** Create a comprehensive user guide explaining the standard template format, enabling users to write cross-platform workflow templates.

**Implementation:**
```xml
<task>
  <action>
    Create docs/TEMPLATE-USER-GUIDE.md covering:

    1. INTRODUCTION
       - What are cross-platform templates?
       - Why use the standard format?
       - Quick start (minimal example)

    2. TEMPLATE ANATOMY
       - Directory structure (.ai-templates/skills/, .ai-templates/workflows/)
       - File naming conventions (SKILL.md, *.workflow.md)
       - YAML frontmatter structure (from STANDARD-SCHEMA.md)
       - Markdown body conventions

    3. FRONTMATTER REFERENCE
       - Core fields (name, description, version)
       - Platform-specific fields with compatibility notes
       - The compatibility and emulation fields
       - Complete field examples

    4. PLATFORM TARGETING
       - Using the platforms field
       - Understanding compatibility markers
       - What happens on unsupported platforms

    5. WORKED EXAMPLES
       - Simple skill (single-platform)
       - Cross-platform skill (all three platforms)
       - Workflow with semantic constructs

    Location: docs/TEMPLATE-USER-GUIDE.md (new file, root docs/ directory)
    Length target: 400-600 lines

    Reference existing files:
    - STANDARD-SCHEMA.md (field definitions)
    - STANDARD-STRUCTURE.md (directory layout)
    - .ai-templates/skills/* (reference templates from Phase 6)
  </action>
  <verification>
    1. File exists at docs/TEMPLATE-USER-GUIDE.md
    2. Covers all 5 sections listed above
    3. Includes at least 3 complete template examples
    4. Cross-references existing schema documentation
    5. Frontmatter field table matches STANDARD-SCHEMA.md
    6. Examples are valid YAML (can be parsed without errors)
  </verification>
  <rollback>
    git checkout docs/TEMPLATE-USER-GUIDE.md || rm docs/TEMPLATE-USER-GUIDE.md
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] Introduction explains purpose and value proposition
- [x] Template anatomy section covers structure completely
- [x] All frontmatter fields documented with types and examples
- [x] Platform targeting explained with clear examples
- [x] At least 3 worked examples (simple, cross-platform, semantic)
- [x] Quick start enables user to create first template in < 5 minutes

**Completion:** Task 1 completed - docs/TEMPLATE-USER-GUIDE.md created (941 lines)
**Commit:** 3d41c5f

---

### Task 2: CLI Conversion Tool Reference

**Objective:** Document the `aiw convert` command with complete usage reference, troubleshooting guide, and integration examples.

**Implementation:**
```xml
<task>
  <action>
    Create docs/CLI-CONVERT-REFERENCE.md covering:

    1. COMMAND OVERVIEW
       - Purpose: Convert templates between AI assistant formats
       - Synopsis: aiw convert &lt;source&gt; --to &lt;platform&gt; [options]
       - Supported platforms: claude-code, windsurf, github-copilot

    2. USAGE EXAMPLES
       - Basic conversion (single file)
       - Directory conversion (batch)
       - Output directory specification
       - Verbose/debug mode

    3. PLATFORM-SPECIFIC BEHAVIOR
       - Claude Code output structure
       - Windsurf output structure (including emulation patterns)
       - GitHub Copilot output structure (including working set handling)
       - What warnings mean and how to address them

    4. SEMANTIC TRANSFORMATION
       - What content gets transformed
       - Agent spawning → platform equivalents
       - Tool calls across platforms
       - Context switches and how they're handled

    5. TROUBLESHOOTING
       - Common errors and solutions
       - "Invalid YAML frontmatter" - parsing issues
       - "Unsupported platform" - platform validation
       - "File not found" - path resolution
       - Warning interpretation guide
       - Debug mode usage

    6. INTEGRATION
       - CI/CD pipeline examples
       - Git hooks integration
       - Batch processing scripts
       - Exit codes reference

    Location: docs/CLI-CONVERT-REFERENCE.md (new file)
    Length target: 300-500 lines

    Reference existing files:
    - packages/cli/README.md (exit codes, scripting patterns)
    - PLATFORM-ADAPTERS.md (transformation rules)
    - CONTENT-SCHEMA.md (semantic constructs)
  </action>
  <verification>
    1. File exists at docs/CLI-CONVERT-REFERENCE.md
    2. Command synopsis matches actual CLI behavior
    3. All three target platforms documented
    4. Troubleshooting covers at least 5 common issues
    5. Integration examples are copy-pasteable
    6. Exit codes match packages/cli/README.md
  </verification>
  <rollback>
    git checkout docs/CLI-CONVERT-REFERENCE.md || rm docs/CLI-CONVERT-REFERENCE.md
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] Command synopsis accurate and complete
- [x] Usage examples cover common scenarios
- [x] All three platforms documented with output structure
- [x] Semantic transformation section explains content changes
- [x] Troubleshooting covers at least 5 error scenarios
- [x] CI/CD integration example is production-ready

**Completion:** Task 2 completed - docs/CLI-CONVERT-REFERENCE.md created (896 lines)
**Commit:** 1004f8f

---

### Task 3: Best Practices and Tutorials

**Objective:** Document patterns, best practices, and step-by-step tutorials for effective cross-platform template development.

**Implementation:**
```xml
<task>
  <action>
    Create docs/BEST-PRACTICES.md covering:

    1. DESIGN PRINCIPLES
       - Start with standard format, convert to platforms
       - Use compatibility field proactively
       - Prefer portable constructs when possible
       - Document platform-specific behavior

    2. TEMPLATE ORGANIZATION
       - When to use skills vs workflows
       - Naming conventions for discoverability
       - Versioning strategy (semantic versioning)
       - Directory structure recommendations

    3. CROSS-PLATFORM PATTERNS
       - Pattern: Graceful degradation
       - Pattern: Platform-specific branches
       - Pattern: Emulation with advisory warnings
       - Anti-pattern: Platform-specific constructs without fallback

    4. SEMANTIC CONSTRUCT USAGE
       - When to use agent spawning
       - Tool call best practices
       - Context switching patterns
       - Working set management (Copilot consideration)

    5. TESTING YOUR TEMPLATES
       - Validation workflow
       - Testing on each platform
       - Common pitfalls and how to avoid them

    6. TUTORIALS
       Tutorial A: "Your First Cross-Platform Skill"
       - Step 1: Create standard template
       - Step 2: Add platform-specific metadata
       - Step 3: Convert and test on Claude Code
       - Step 4: Convert and test on Windsurf

       Tutorial B: "Migrating Existing Templates"
       - Step 1: Identify source platform
       - Step 2: Extract to standard format
       - Step 3: Add cross-platform compatibility
       - Step 4: Convert to target platforms

    Location: docs/BEST-PRACTICES.md (new file)
    Length target: 400-600 lines

    Reference existing files:
    - WORKAROUND-PATTERNS.md (emulation patterns)
    - examples/*.md (pattern examples from Phase 3)
    - .ai-templates/skills/* (reference implementations)
  </action>
  <verification>
    1. File exists at docs/BEST-PRACTICES.md
    2. All 6 sections covered
    3. At least 3 cross-platform patterns documented
    4. Both tutorials are complete and step-by-step
    5. Anti-patterns section warns against common mistakes
    6. Examples reference existing project files where appropriate
  </verification>
  <rollback>
    git checkout docs/BEST-PRACTICES.md || rm docs/BEST-PRACTICES.md
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] Design principles provide clear guidance
- [x] Template organization covers skills vs workflows decision
- [x] At least 3 cross-platform patterns documented
- [x] Semantic construct usage explained with examples
- [x] Tutorial A enables first cross-platform skill creation
- [x] Tutorial B enables migration of existing templates

**Completion:** Task 3 completed - docs/BEST-PRACTICES.md created (1,477 lines)
**Commit:** 46ec32a

---

## Verification

**Phase Complete When:**
- [x] All tasks completed
- [x] All acceptance criteria met
- [x] No regressions introduced
- [x] Changes committed atomically
- [x] Documentation is internally consistent
- [x] Cross-references between docs are valid

**Phase-Level Verification:**
- [x] User can create a template following TEMPLATE-USER-GUIDE.md
- [x] User can convert templates following CLI-CONVERT-REFERENCE.md
- [x] User can apply best practices from BEST-PRACTICES.md
- [x] All three documents cross-reference each other appropriately

**Phase 7 Completed:** 2026-01-13
**Total Documentation Lines:** 3,314 (941 + 896 + 1,477)

---

## Dependencies Between Tasks

```
Task 1 (User Guide) ────────┐
                            ├──→ Task 3 (Best Practices)
Task 2 (CLI Reference) ─────┘
```

- Tasks 1 and 2 can be executed in parallel (independent)
- Task 3 depends on Tasks 1 and 2 being complete (references both)

## Estimated Effort

| Task | Scope | Files Created |
|------|-------|---------------|
| Task 1 | User Guide | 1 (docs/TEMPLATE-USER-GUIDE.md) |
| Task 2 | CLI Reference | 1 (docs/CLI-CONVERT-REFERENCE.md) |
| Task 3 | Best Practices | 1 (docs/BEST-PRACTICES.md) |

**Total New Files:** 3
**Total Documentation Lines:** ~1200-1700

---

**Maximum 3 tasks per plan to maintain fresh context**
