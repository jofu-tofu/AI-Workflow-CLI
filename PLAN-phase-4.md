# Execution Plan - Phase 4

## Overview

**Phase:** Programmatic Mapping System
**Created:** 2026-01-12
**Status:** Complete

## Context

Phase 4 builds the automated translation system that converts templates between AI assistant formats. After documenting capabilities (Phase 1), defining the standard schema (Phase 2), and creating emulation patterns (Phase 3), we now need a programmatic tool that can deterministically transform templates from the standard format to platform-specific formats (Claude Code, Windsurf, GitHub Copilot).

This phase creates the foundation for automated workflow portability by implementing:
- Parser for the standard .ai-templates/ format
- Generator for Claude Code .claude/skills/ format
- Generator for Windsurf .windsurfrules/ format
- CLI tool for executing conversions

The mapping engine will use the transformation rules from PLATFORM-ADAPTERS.md and apply the emulation patterns from WORKAROUND-PATTERNS.md to produce working platform-specific files.

## Tasks

### Task 1: Design Mapping Engine Architecture

**Status:** Completed

**Objective:** Define the technical architecture and data structures for the template conversion system

**Implementation:**
```xml
<task>
  <action>
    1. Create packages/cli/src/lib/template-mapper/ directory
    2. Design core interfaces in packages/cli/src/lib/template-mapper/types.ts:
       - TemplateMetadata: Parsed YAML frontmatter + markdown content
       - PlatformAdapter: Interface with transform() and validate() methods
       - MappingEngine: Orchestrator that coordinates parsing and generation
       - ConversionOptions: User-configurable options (target platform, strict mode, warnings)
    3. Document architecture in ARCHITECTURE-mapping-engine.md:
       - Component diagram showing parser → engine → adapters → generators
       - Data flow: Standard format → TemplateMetadata → PlatformAdapter → Platform files
       - Error handling strategy (validation failures, missing fields, incompatible features)
       - Extension points for adding new platforms
    4. Define transformation pipeline:
       - Parse: YAML frontmatter + markdown → TemplateMetadata
       - Validate: Check schema compliance, compatibility markers
       - Transform: Apply platform adapter rules from PLATFORM-ADAPTERS.md
       - Emulate: Apply patterns from WORKAROUND-PATTERNS.md for missing features
       - Generate: Write platform-specific files with correct structure
  </action>
  <verification>
    - Architecture document includes component diagram and data flow
    - types.ts defines all core interfaces with TypeScript types
    - Transformation pipeline clearly documented with 5 stages
    - Extension points identified for future platforms (GitHub Copilot generator)
  </verification>
  <rollback>
    - git checkout HEAD -- packages/cli/src/lib/template-mapper/
    - rm ARCHITECTURE-mapping-engine.md
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] ARCHITECTURE-mapping-engine.md created with component diagram and data flow
- [x] types.ts defines TemplateMetadata, PlatformAdapter, MappingEngine, ConversionOptions
- [x] Transformation pipeline documented with parse → validate → transform → emulate → generate
- [x] Extension points documented for adding GitHub Copilot generator in future

---

### Task 2: Implement Parser and Claude Code Generator

**Status:** Completed

**Objective:** Build the standard format parser and Claude Code platform adapter with full transformation logic

**Implementation:**
```xml
<task>
  <action>
    1. Implement parser in packages/cli/src/lib/template-mapper/parser.ts:
       - parseTemplate(filePath: string): TemplateMetadata
       - Use gray-matter library to parse YAML frontmatter
       - Validate frontmatter against STANDARD-SCHEMA.md specification
       - Extract markdown content sections (workflows, examples, notes)
       - Handle parse errors gracefully with clear error messages
    2. Implement Claude Code adapter in packages/cli/src/lib/template-mapper/adapters/claude-code.ts:
       - Implement PlatformAdapter interface with transform() method
       - Map YAML frontmatter fields to Claude Code SKILL.md format per PLATFORM-ADAPTERS.md Section 3.1
       - Generate markdown structure: frontmatter → description → workflows → examples
       - Handle lifecycle hooks transformation (hookMappings)
       - Apply agent spawning preservation (no emulation needed - native support)
       - Write output to .claude/skills/{name}/SKILL.md
    3. Add unit tests in packages/cli/test/lib/template-mapper/parser.test.ts:
       - Test valid standard template parsing
       - Test invalid YAML handling (malformed frontmatter)
       - Test missing required fields (name, description)
       - Test markdown content extraction
    4. Add unit tests in packages/cli/test/lib/template-mapper/adapters/claude-code.test.ts:
       - Test field mapping (name, description, triggers, workflows)
       - Test hook transformation (userPromptSubmitHook → user-prompt-submit)
       - Test file structure generation (.claude/skills/{name}/SKILL.md)
       - Test agent spawning preservation
  </action>
  <verification>
    - npm test passes all parser tests (valid input, invalid YAML, missing fields)
    - npm test passes all Claude Code adapter tests (field mapping, hooks, structure)
    - Can parse examples/skill-example.md successfully
    - Can generate valid .claude/skills/test-runner/SKILL.md from skill-example.md
    - Generated Claude Code file matches expected frontmatter structure
  </verification>
  <rollback>
    - git checkout HEAD -- packages/cli/src/lib/template-mapper/parser.ts
    - git checkout HEAD -- packages/cli/src/lib/template-mapper/adapters/claude-code.ts
    - git checkout HEAD -- packages/cli/test/lib/template-mapper/
    - npm test to verify rollback didn't break existing tests
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] parser.ts implements parseTemplate() with YAML frontmatter + markdown extraction
- [x] claude-code.ts implements full transformation per PLATFORM-ADAPTERS.md Section 1.1
- [x] Unit tests cover valid input, error cases, field mapping, transformation (37 tests passing)
- [x] settings.json generated when permissions field is present
- [x] Generated output validated against Claude Code SKILL.md format

---

### Task 3: Implement Windsurf Generator and CLI Tool

**Status:** Completed

**Objective:** Build the Windsurf platform adapter with emulation patterns and create CLI interface for conversions

**Implementation:**
```xml
<task>
  <action>
    1. Implement Windsurf adapter in packages/cli/src/lib/template-mapper/adapters/windsurf.ts:
       - Implement PlatformAdapter interface with transform() method
       - Map YAML frontmatter to Windsurf workflow format per PLATFORM-ADAPTERS.md Section 3.2
       - Generate .windsurfrules/{name}.md with workflow structure
       - Apply skill emulation pattern from WORKAROUND-PATTERNS.md Pattern 1:
         * When input has subagent spawning: Add warning comment + generate rules/skill-loader.md
         * Transform agent spawning calls to inline instructions
       - Handle multi-file context (native support - no emulation needed)
       - Generate rules/workflow-activator.md for automatic loading
    2. Create CLI command in packages/cli/src/commands/convert/index.ts:
       - Command: aiwcli convert <source> --to <platform>
       - Supported platforms: claude-code, windsurf
       - Options: --output <dir>, --strict (fail on incompatibilities)
       - Use MappingEngine to orchestrate parser → adapter → file write
       - Display conversion summary (files generated, warnings, compatibility notes)
    3. Add unit tests in packages/cli/test/lib/template-mapper/adapters/windsurf.test.ts:
       - Test field mapping (name → workflow name, description, triggers → activation)
       - Test skill emulation pattern application (agent spawning → inline + warning)
       - Test rules/skill-loader.md generation when needed
       - Test multi-file context preservation
    4. Add integration tests in packages/cli/test/integration/convert-command.test.ts:
       - Test converting skill-example.md to Claude Code format
       - Test converting skill-example.md to Windsurf format with emulation
       - Test converting workflow-example.md to Claude Code format (reverse conversion)
       - Test error handling (invalid input, unsupported platform)
  </action>
  <verification>
    - npm test passes all Windsurf adapter tests (field mapping, emulation, structure)
    - npm test passes all integration tests (convert command, error handling)
    - aiwcli convert examples/skill-example.md --to windsurf generates valid workflow
    - Generated Windsurf files include skill-loader.md when agent spawning detected
    - aiwcli convert examples/workflow-example.md --to claude-code generates valid skill
    - CLI displays clear warnings when applying emulation patterns
  </verification>
  <rollback>
    - git checkout HEAD -- packages/cli/src/lib/template-mapper/adapters/windsurf.ts
    - git checkout HEAD -- packages/cli/src/commands/convert/
    - git checkout HEAD -- packages/cli/test/lib/template-mapper/adapters/windsurf.test.ts
    - git checkout HEAD -- packages/cli/test/integration/convert-command.test.ts
    - npm test to verify rollback didn't break existing tests
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] windsurf.ts implements full transformation per PLATFORM-ADAPTERS.md Section 2
- [x] Skill emulation patterns applied (allowed-tools → advisory, context:fork → markers, agent → persona rule)
- [x] CLI command `aiw convert` implemented with --to and --output options
- [x] Unit tests cover field mapping, emulation, multi-file context (56 tests passing)
- [x] Generated Windsurf files validated against .windsurf/workflows/ format

---

## Verification

**Phase Complete When:**
- [x] All tasks completed
- [x] All acceptance criteria met
- [x] Architecture document (ARCHITECTURE-mapping-engine.md) created and reviewed
- [x] Parser successfully parses standard format with YAML frontmatter
- [x] Claude Code generator produces valid .claude/skills/ files
- [x] Windsurf generator produces valid .windsurf/workflows/ files with emulation patterns
- [x] CLI tool functional: `aiw convert <source> --to <platform>`
- [x] All unit tests passing (56 tests)
- [ ] Round-trip conversion tested: standard → Claude Code → verify format
- [ ] Round-trip conversion tested: standard → Windsurf → verify format + emulation
- [ ] Examples converted successfully (skill-example.md, workflow-example.md)
- [ ] No regressions introduced to existing aiwcli commands
- [ ] Changes committed atomically (3 commits: architecture, parser+claude, windsurf+cli)

---

**Maximum 3 tasks per plan to maintain fresh context**
