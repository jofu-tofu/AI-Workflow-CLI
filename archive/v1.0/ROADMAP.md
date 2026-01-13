# AI Workflow CLI - Development Roadmap

## Current Position

**Phase:** Phase 7
**Status:** 📋 Ready to Plan

## Phase Sequence

### Phase 1: Research and Discovery
- **Status:** ✅ Completed (2026-01-12)
- **Description:** Map capabilities, terminologies, and limitations across target AI assistants (Claude Code, Windsurf, and GitHub Copilot)
- **Tasks:**
  - [x] Document all Claude Code capabilities (skills, commands, agents, file structure)
  - [x] Document all Windsurf capabilities (workflows, rules, cascades, file structure)
  - [x] Document all GitHub Copilot capabilities (prompts, agents, MCP integration, file structure)
  - [x] Create capability comparison matrix showing what exists where
  - [x] Document terminology mapping (workflow=skill=prompt, etc.)
  - [x] Identify capability gaps and emulation opportunities
  - [x] Research any existing cross-platform formats or standards
- **Verification Criteria:**
  - [x] Complete capability matrix covering all three tools
  - [x] Terminology translation table created
  - [x] Capability gaps documented with potential workarounds
  - [x] Research findings documented
- **Deliverables:**
  - RESEARCH-claude-code.md (analyzing Upgrades skill as reference)
  - RESEARCH-windsurf.md
  - RESEARCH-github-copilot.md (covering both Copilot and Codex)
  - CAPABILITY-MATRIX.md (3-platform comparison)
  - TERMINOLOGY-MAPPING.md (cross-platform mappings)
  - GAP-ANALYSIS.md (10 gaps with workarounds)

### Phase 2: Standard Template Design
- **Status:** ✅ Completed (2026-01-12)
- **Description:** Choose standard format and define template structure that works across AI assistants
- **Tasks:**
  - [x] Evaluate Claude Code format as potential standard
  - [x] Evaluate creating custom vendor-neutral format
  - [x] Make decision on standard approach (with rationale)
  - [x] Define file structure conventions
  - [x] Define metadata schema (front matter, headers, etc.)
  - [x] Document template specification
- **Verification Criteria:**
  - [x] Standard format chosen and documented
  - [x] Template specification complete
  - [x] File structure defined
  - [x] Metadata schema documented
  - [x] Decision rationale captured
- **Deliverables:**
  - STANDARD-SCHEMA.md (complete superset YAML frontmatter specification)
  - STANDARD-STRUCTURE.md (directory layout and platform mappings)
  - PLATFORM-ADAPTERS.md (transformation rules for all 3 platforms)
  - VERIFICATION-phase-2.md (verification report with all fixes)

### Phase 3: Workaround Pattern Library
- **Status:** ✅ Completed (2026-01-12)
- **Description:** Document and test patterns for emulating missing capabilities across platforms
- **Tasks:**
  - [x] Design emulation pattern for Claude skills in Windsurf (using rules + front matter)
  - [x] Design emulation pattern for Windsurf workflows in Claude Code
  - [x] Test each emulation pattern in actual tools
  - [x] Document workaround patterns with examples
  - [x] Create pattern template library
- **Verification Criteria:**
  - [x] At least 3 emulation patterns documented
  - [x] Each pattern tested and validated
  - [x] Pattern library created with examples
  - [x] Known limitations documented
- **Deliverables:**
  - WORKAROUND-PATTERNS.md (3 complete emulation patterns)
  - examples/skill-example.md
  - examples/workflow-example.md
  - examples/copilot-limited-context.md
  - VERIFICATION-phase-3.md

### Phase 4: Programmatic Mapping System
- **Status:** ✅ Completed (2026-01-12)
- **Description:** Build automated translation system to convert templates between AI assistant formats
- **Tasks:**
  - [x] Design mapping engine architecture
  - [x] Implement parser for standard template format
  - [x] Implement generator for Claude Code format
  - [x] Implement generator for Windsurf format
  - [x] Create CLI tool or script for conversions
  - [x] Test round-trip conversions
- **Verification Criteria:**
  - [x] Can parse standard format correctly
  - [x] Can generate Claude Code format
  - [x] Can generate Windsurf format
  - [x] Round-trip conversion preserves intent
  - [x] CLI tool is functional
- **Deliverables:**
  - ARCHITECTURE-mapping-engine.md
  - packages/cli/src/lib/template-mapper/ (parser, adapters, types)
  - `aiw convert` CLI command
  - VERIFICATION-phase-4.md

### Phase 5: Semantic Content Transformation
- **Status:** ✅ Completed (2026-01-12)
- **Description:** Build semantic parsing and transformation layer that identifies platform-specific constructs in workflow content and transforms them for target platforms
- **Tasks:**
  - [x] Define content schema documenting semantic constructs (agent spawning, tool calls, context switches) with detection patterns
  - [x] Implement content parser that extracts semantic constructs from markdown workflow content
  - [x] Implement per-platform content transformers (inline agents for Windsurf, decompose for Copilot)
  - [x] Integrate semantic transformation into existing `aiw convert` CLI
  - [x] Test transformations with real workflow examples
- **Verification Criteria:**
  - [x] Content schema documented with detection patterns for all major constructs
  - [x] Parser correctly identifies agent spawning, tool calls, and context patterns
  - [x] Windsurf transformer inlines agent prompts instead of spawning references
  - [x] Copilot transformer handles decomposition for context limits
  - [x] Integration with existing `aiw convert` CLI command
  - [x] Unit tests covering parsing and transformation
- **Deliverables:**
  - CONTENT-SCHEMA.md (18 semantic constructs documented)
  - content-parser.ts (parser with detection engine)
  - content-transformers.ts (3 platform transformers)
  - 123 new tests (75 parser + 48 transformer)
  - VERIFICATION-phase-5-FINAL.md

### Phase 6: Reference Implementation
- **Status:** ✅ Completed (2026-01-13)
- **Description:** Create example templates demonstrating the system working across both platforms
- **Tasks:**
  - [x] Create 2-3 reference templates in standard format
  - [x] Convert to Claude Code format and test
  - [x] Convert to Windsurf format and test
  - [x] Document any issues or limitations discovered
  - [x] Refine mapping system based on findings
- **Verification Criteria:**
  - [x] Reference templates work in Claude Code
  - [x] Reference templates work in Windsurf
  - [x] Issues documented and addressed
  - [x] Templates demonstrate key features
- **Deliverables:**
  - .ai-templates/skills/ (3 reference templates: code-review, dependency-updater, api-generator)
  - .claude-output/ (Claude Code converted output)
  - .windsurf-output/ (Windsurf converted output with emulation patterns)
  - VERIFICATION-phase-6.md (comprehensive test results)

### Phase 7: Documentation and Polish
- **Status:** ✅ Completed (2026-01-13)
- **Description:** Create comprehensive documentation for using the template system
- **Tasks:**
  - [x] Write user guide for template format
  - [x] Write conversion tool documentation
  - [x] Document best practices and patterns
  - [x] Create troubleshooting guide
  - [x] Add examples and tutorials
- **Verification Criteria:**
  - [x] Complete user guide exists
  - [x] Conversion tool documented
  - [x] Best practices guide created
  - [x] Examples cover common use cases

---

## Completed Phases

### Phase 5: Semantic Content Transformation ✅
**Completed:** 2026-01-12
**Duration:** 1 day
**Key Deliverables:**
- CONTENT-SCHEMA.md with 18 semantic constructs documented
- Content parser with detection engine for all construct types
- Three platform-specific content transformers (Claude Code, Windsurf, GitHub Copilot)
- CLI integration - `aiw convert` now transforms both metadata AND content
- 123 new tests (75 parser + 48 transformer), 179 total template-mapper tests

**Key Decisions:**
- 18 semantic construct types identified from existing patterns
- Code block detection prevents false positives (fenced and inline)
- Priority-based overlap handling for competing matches
- Platform transformers generate appropriate warnings for emulated constructs
- Content transformation integrated into existing adapter architecture

**Constructs Detected:**
- Agent & Execution: agent-spawn, context-switch
- Tool & Permission: tool-call, permission-reference
- Activation: model-decision-trigger, activation-instruction
- Context & Discovery: glob-pattern, context-gathering-protocol, workspace-command
- Workflow Orchestration: skill-chaining, working-set-limit, checkpoint-commit, progress-tracking
- Documentation: advisory-warning, version-comment, execution-flow-section, persona-rule, test-command

### Phase 4: Programmatic Mapping System ✅
**Completed:** 2026-01-12
**Duration:** 1 day
**Key Deliverables:**
- ARCHITECTURE-mapping-engine.md with component diagram and 5-stage pipeline
- Template parser with YAML frontmatter + markdown extraction
- Claude Code adapter with full field mapping and settings.json generation
- Windsurf adapter with emulation patterns (advisory sections, persona rules)
- CLI command: `aiw convert <source> --to <platform>`
- 56 unit tests passing

**Key Decisions:**
- 5-stage transformation pipeline: Parse → Validate → Transform → Emulate → Generate
- Platform adapters handle all transformation logic
- Warnings generated for emulated/unsupported features
- Multi-file output support (main workflow + supplementary rules)

### Phase 3: Workaround Pattern Library ✅
**Completed:** 2026-01-12
**Duration:** 1 day
**Key Deliverables:**
- WORKAROUND-PATTERNS.md with 3 complete emulation patterns (1,844 lines)
- Pattern 1: Skill Emulation for Windsurf (workflows + rules)
- Pattern 2: Workflow Emulation for Claude Code (skills)
- Pattern 3: Working Set Limitation for GitHub Copilot (10-file decomposition)
- 3 example files demonstrating each pattern

**Key Decisions:**
- Manual traceability approach for debugging
- Advisory-based emulation (not enforced)
- Clear documentation of what emulation cannot achieve

### Phase 2: Standard Template Design ✅
**Completed:** 2026-01-12
**Duration:** 1 day
**Key Deliverables:**
- Complete superset YAML frontmatter specification (STANDARD-SCHEMA.md) with all fields from all 3 platforms
- Standard directory layout with platform mappings (STANDARD-STRUCTURE.md) for .ai-templates/
- Deterministic platform adapter transformation rules (PLATFORM-ADAPTERS.md) with emulation patterns
- Comprehensive verification report (VERIFICATION-phase-2.md) confirming all acceptance criteria met

**Key Decisions:**
- **Superset + Platform Adapter approach:** Preserves ALL features from ALL platforms in standard format
- **Platform adapters handle downgrading:** Emulation patterns for features not natively supported
- **Clear compatibility markers:** Users can see what works where with compatibility field
- **Three platform adapters:** Claude Code (most complete), Windsurf (needs emulation), GitHub Copilot (working set limits)

**Architecture:**
- Superset standard captures capabilities from Claude Code, Windsurf, and GitHub Copilot
- Platform adapters transform standard → native format with field mapping, emulation, and warnings
- 6 of 10 GAP-ANALYSIS workaround patterns incorporated (4 remaining for Phase 3+)

### Phase 1: Research and Discovery ✅
**Completed:** 2026-01-12
**Duration:** 1 day
**Key Deliverables:**
- Comprehensive Claude Code architecture documentation (RESEARCH-claude-code.md) - analyzed Upgrades skill as reference
- Comprehensive Windsurf architecture documentation (RESEARCH-windsurf.md)
- Comprehensive GitHub Copilot & Codex documentation (RESEARCH-github-copilot.md)
- Detailed 3-platform capability comparison matrix (CAPABILITY-MATRIX.md)
- Cross-platform terminology translation table (TERMINOLOGY-MAPPING.md)
- Gap analysis with 10 workaround patterns (GAP-ANALYSIS.md)

**Key Findings:**
- **Claude Code strength:** Subagent spawning, granular permissions, 10+ lifecycle hooks, unlimited file sizes, multi-repo support
- **Windsurf strength:** Multi-file context (best-in-class), AI-driven activation (Model Decision), pattern learning (Memories), Flow mode collaboration
- **GitHub Copilot strength:** Best inline completions, extensive IDE support, deep MCP integration, mature enterprise features, $10 entry point
- **Critical gaps identified:**
  - Windsurf: Cannot spawn subagents (HIGH)
  - GitHub Copilot: 10-file working set limit (HIGH)
  - 10 high/medium priority gaps total with emulation strategies
- **Cross-platform patterns:**
  - CLAUDE.md / Always-On Rule / copilot-instructions.md works across all three
  - Shared workflow format possible with platform tags
  - MCP protocol compatible across all three platforms
- **Recommendation:** Superset standard format to accommodate all three platforms with clear compatibility markers

---

**Last Updated:** 2026-01-12
