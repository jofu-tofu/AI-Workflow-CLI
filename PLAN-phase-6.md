# Execution Plan - Phase 6

## Overview

**Phase:** Reference Implementation
**Created:** 2026-01-13
**Status:** In Progress

## Context

Phase 6 validates the entire mapping system built in Phases 1-5 by creating real reference templates that can be converted and tested on actual platforms. Unlike the documentation examples in `examples/`, these reference templates:

1. Are placed in the standard `.ai-templates/` directory structure
2. Can be converted using the actual `aiw convert` command
3. Exercise the content transformation engine (semantic constructs)
4. Are tested in real Claude Code and Windsurf environments

This phase is critical for discovering edge cases, validating the mapping system, and refining the implementation before final documentation.

## Tasks

### Task 1: Create Reference Templates in Standard Format ✅ COMPLETED

**Objective:** Create 2-3 reference templates in the standard `.ai-templates/` directory that exercise different features of the superset schema and semantic content transformation.

**Implementation:**
```xml
<task>
  <action>
    Create 3 reference templates in `.ai-templates/skills/`:

    1. **code-review.md** - A skill that reviews code for quality
       - Uses: tool permissions, model selection, context inheritance
       - Content: agent spawning (for parallel review), tool calls, progress tracking
       - Target: All 3 platforms (tests emulation patterns)

    2. **dependency-updater.md** - A workflow that checks and updates dependencies
       - Uses: glob patterns, labels, activation triggers
       - Content: multi-step process, checkpoint commits, working set awareness
       - Target: All 3 platforms (tests working set decomposition for Copilot)

    3. **api-generator.md** - A skill that generates API endpoints from specs
       - Uses: MCP tools, version field, cross-platform compatibility markers
       - Content: context gathering, permission references, persona rules
       - Target: Claude Code and Windsurf (tests full semantic transformation)

    Directory structure:
    .ai-templates/
    └── skills/
        ├── code-review/
        │   └── SKILL.md
        ├── dependency-updater/
        │   └── SKILL.md
        └── api-generator/
            └── SKILL.md

    Each template must include:
    - Valid YAML frontmatter following STANDARD-SCHEMA.md
    - Semantic constructs that will be detected by content-parser.ts
    - Clear markdown body following best practices from WORKAROUND-PATTERNS.md
  </action>
  <verification>
    Verify each template:
    1. YAML frontmatter parses without errors (use parser.ts)
    2. All required fields present per STANDARD-SCHEMA.md
    3. Content contains at least 3 different semantic constructs
    4. Run: node packages/cli/dist/index.js parse .ai-templates/skills/*/SKILL.md

    Acceptance check:
    - [ ] 3 template files created in .ai-templates/skills/
    - [ ] Each template has valid YAML frontmatter
    - [ ] Each template contains semantic constructs for testing
    - [ ] Templates cover different use cases and platform features
  </verification>
  <rollback>
    Remove the created templates:
    - rm -rf .ai-templates/skills/code-review/
    - rm -rf .ai-templates/skills/dependency-updater/
    - rm -rf .ai-templates/skills/api-generator/

    Or: git checkout -- .ai-templates/ if committed
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] 3 reference templates created in `.ai-templates/skills/`
- [x] Each template has complete YAML frontmatter
- [x] Each template exercises 3+ semantic constructs (8-10 each)
- [x] Templates parse successfully with the existing parser

---

### Task 2: Convert Templates and Test in Claude Code

**Objective:** Convert all reference templates to Claude Code format using `aiw convert` and verify they work correctly in a real Claude Code environment.

**Implementation:**
```xml
<task>
  <action>
    1. Build the CLI if not already built:
       npm run build -w packages/cli

    2. Convert each template to Claude Code format:
       node packages/cli/dist/index.js convert .ai-templates/skills/code-review/SKILL.md --to claude-code --output .claude-output
       node packages/cli/dist/index.js convert .ai-templates/skills/dependency-updater/SKILL.md --to claude-code --output .claude-output
       node packages/cli/dist/index.js convert .ai-templates/skills/api-generator/SKILL.md --to claude-code --output .claude-output

    3. Examine generated files:
       - Check .claude-output/.claude/skills/*/SKILL.md files exist
       - Check .claude-output/.claude/settings.json exists and contains merged permissions
       - Verify semantic constructs were preserved or appropriately transformed

    4. Test in Claude Code environment:
       - Copy generated files to a test project
       - Or: use generated files in current project's .claude/ directory
       - Invoke each skill and verify it activates correctly
       - Verify tool permissions work as specified
       - Verify content instructions are followed

    5. Document any issues:
       - Note any conversion errors or warnings
       - Note any runtime issues when testing
       - Note any content that wasn't transformed correctly
  </action>
  <verification>
    For each template:
    1. Conversion completes without errors
    2. Generated SKILL.md has valid Claude Code frontmatter
    3. Generated settings.json has correct permission structure
    4. Semantic constructs detected in source appear (transformed or preserved) in output
    5. Skill activates when invoked in Claude Code

    Acceptance check:
    - [ ] All 3 templates convert successfully
    - [ ] Generated files have correct structure
    - [ ] At least 1 template tested end-to-end in Claude Code
    - [ ] Issues documented in VERIFICATION-phase-6.md
  </verification>
  <rollback>
    Remove generated output:
    - rm -rf .claude-output/

    If files were copied to .claude/:
    - git checkout -- .claude/

    Or restore from backup if needed.
  </rollback>
</task>
```

**Acceptance Criteria:**
- [ ] All 3 templates convert to Claude Code format without errors
- [ ] Generated files follow Claude Code structure (.claude/skills/, settings.json)
- [ ] At least 1 template tested end-to-end in Claude Code environment
- [ ] All conversion warnings documented

---

### Task 3: Convert Templates and Test in Windsurf

**Objective:** Convert all reference templates to Windsurf format using `aiw convert` and verify the emulation patterns work correctly.

**Implementation:**
```xml
<task>
  <action>
    1. Convert each template to Windsurf format:
       node packages/cli/dist/index.js convert .ai-templates/skills/code-review/SKILL.md --to windsurf --output .windsurf-output
       node packages/cli/dist/index.js convert .ai-templates/skills/dependency-updater/SKILL.md --to windsurf --output .windsurf-output
       node packages/cli/dist/index.js convert .ai-templates/skills/api-generator/SKILL.md --to windsurf --output .windsurf-output

    2. Examine generated files:
       - Check .windsurf-output/.windsurf/workflows/*.md files exist
       - Verify advisory sections added for emulated features (permissions, agents)
       - Verify semantic constructs were transformed (agent-spawn → inline prompt)

    3. Test in Windsurf environment (if available):
       - Copy generated files to a project with Windsurf
       - Verify workflow appears in Windsurf's workflow list
       - Trigger workflow and verify execution
       - Verify advisory sections are respected (AI compliance)

    4. Document findings:
       - Note emulation quality (how well do advisory patterns work?)
       - Note any transformation issues
       - Note differences in behavior compared to Claude Code

    5. Create VERIFICATION-phase-6.md with:
       - Test results for both platforms
       - Issues found and their severity
       - Refinements needed for mapping system
       - Recommendations for Phase 7 documentation
  </action>
  <verification>
    For each template:
    1. Conversion completes without errors
    2. Generated workflow has valid Windsurf frontmatter
    3. Advisory sections present for emulated features
    4. Agent-spawn constructs transformed to inline prompts
    5. Workflow activates in Windsurf (if testable)

    Acceptance check:
    - [ ] All 3 templates convert to Windsurf format without errors
    - [ ] Generated files follow Windsurf structure (.windsurf/workflows/)
    - [ ] Emulation patterns applied correctly (advisory sections)
    - [ ] Content transformations applied (agent → inline)
    - [ ] VERIFICATION-phase-6.md created with complete test results
  </verification>
  <rollback>
    Remove generated output:
    - rm -rf .windsurf-output/
    - rm VERIFICATION-phase-6.md

    If files were copied to .windsurf/:
    - git checkout -- .windsurf/
  </rollback>
</task>
```

**Acceptance Criteria:**
- [ ] All 3 templates convert to Windsurf format without errors
- [ ] Generated files follow Windsurf structure
- [ ] Emulation patterns correctly applied (advisory sections)
- [ ] Content transformations verified (agent-spawn → inline)
- [ ] VERIFICATION-phase-6.md documents all findings

---

## Verification

**Phase Complete When:**
- [ ] All tasks completed
- [ ] All acceptance criteria met
- [ ] No regressions introduced
- [ ] Changes committed atomically
- [ ] Reference templates work in Claude Code
- [ ] Reference templates work in Windsurf (emulated)
- [ ] Issues documented and (if critical) fixed

---

**Maximum 3 tasks per plan to maintain fresh context**
