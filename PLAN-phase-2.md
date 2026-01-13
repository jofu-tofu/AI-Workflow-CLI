# Execution Plan - Phase 2

## Overview

**Phase:** Standard Template Design (Superset + Platform Adapter Approach)
**Created:** 2026-01-12
**Status:** Completed

## Context

Phase 1 research revealed three platforms with varying capabilities:
- **Claude Code:** Most complete feature set (subagents, granular permissions, 10+ hooks)
- **Windsurf:** Best multi-file context, AI-driven activation, Memories
- **GitHub Copilot:** Best inline completions, widest IDE support, deep MCP integration

The **Superset + Platform Adapter** approach was chosen because:
1. Preserves ALL features from ALL platforms in the standard format
2. Platform adapters handle downgrading/emulation for less capable targets
3. Future-proof: new platform features can be added without breaking existing templates
4. Clear compatibility markers tell users what works where

**Architecture:**
```
┌─────────────────────────────────────┐
│     SUPERSET STANDARD TEMPLATE      │
│  (Contains all features from all    │
│   platforms with capability tags)   │
└─────────────────┬───────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌─────────┐ ┌──────────┐ ┌──────────────┐
│ Claude  │ │ Windsurf │ │ GitHub       │
│ Code    │ │ Adapter  │ │ Copilot      │
│ Adapter │ │          │ │ Adapter      │
└────┬────┘ └────┬─────┘ └──────┬───────┘
     ▼           ▼              ▼
  Native      Native         Native
  Format      Format         Format
```

## Tasks

### Task 1: Define Superset Schema Specification

**Objective:** Create the complete superset schema that captures ALL capabilities from Claude Code, Windsurf, and GitHub Copilot in a unified YAML frontmatter format.

**Implementation:**
```xml
<task>
  <action>
    Create STANDARD-SCHEMA.md with:

    1. Core Fields (supported by all platforms):
       - name: string (template identifier)
       - description: string (what it does, auto-invoke hint)
       - version: string (semver)

    2. Claude Code Fields:
       - allowed-tools: string[] (Bash, Read, Write, Edit, Glob, Grep, Task, etc.)
       - model: string (sonnet, opus, haiku)
       - context: string (fork, inherit)
       - agent: string (custom agent type reference)
       - permissions.allow: string[] (glob patterns)
       - permissions.deny: string[] (glob patterns)

    3. Windsurf Fields:
       - trigger: enum (manual, always_on, model_decision, glob)
       - globs: string[] (file patterns for glob trigger)
       - labels: string[] (categorization tags)
       - alwaysApply: boolean (universal application)

    4. GitHub Copilot Fields:
       - applyTo: string[] (path-specific instruction patterns)
       - excludeAgent: string[] (agents to exclude from)
       - mode: enum (agent, ask, edit)

    5. Cross-Platform Fields:
       - platforms: string[] (claude-code, windsurf, github-copilot)
       - compatibility: object (per-platform notes/workarounds)
       - emulation: object (workaround patterns when native support missing)

    File location: STANDARD-SCHEMA.md
    Format: YAML specification with examples and validation rules
  </action>
  <verification>
    1. Read STANDARD-SCHEMA.md and verify it includes:
       - All fields from CAPABILITY-MATRIX.md marked as configurable
       - All frontmatter fields from TERMINOLOGY-MAPPING.md
       - Clear type definitions for each field
       - Default values where applicable
       - Platform tags for each field
    2. Cross-reference against research docs to ensure no capabilities missed
  </verification>
  <rollback>
    git checkout -- STANDARD-SCHEMA.md
    rm STANDARD-SCHEMA.md
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] Schema includes ALL frontmatter fields from Claude Code
- [x] Schema includes ALL frontmatter fields from Windsurf
- [x] Schema includes ALL frontmatter fields from GitHub Copilot
- [x] Each field has clear type, description, and platform availability
- [x] Example frontmatter block provided showing all fields
- [x] Validation rules defined (required vs optional, constraints)

---

### Task 2: Define File Structure Convention

**Objective:** Establish a standard directory layout that can be adapted to each platform's native structure, with clear mapping rules.

**Implementation:**
```xml
<task>
  <action>
    Create STANDARD-STRUCTURE.md with:

    1. Standard Directory Layout:
       ```
       .ai-templates/                    # Standard root (platform-agnostic)
       ├── skills/                       # Automation templates
       │   └── skill-name/
       │       ├── SKILL.md             # Main template file
       │       └── assets/              # Supporting files
       ├── instructions/                 # Project-level instructions
       │   ├── PROJECT.md               # Main instructions (like CLAUDE.md)
       │   └── paths/                   # Path-specific instructions
       │       └── src-typescript.md    # Example: rules for src/**/*.ts
       ├── agents/                       # Custom agent definitions
       │   └── agent-name.md            # Agent specification
       └── config/                       # Platform adapter configs
           ├── claude-code.json         # Claude Code specific settings
           ├── windsurf.json            # Windsurf specific settings
           └── github-copilot.json      # GitHub Copilot specific settings
       ```

    2. Platform Mapping Table:
       | Standard Location | Claude Code | Windsurf | GitHub Copilot |
       |-------------------|-------------|----------|----------------|
       | .ai-templates/skills/ | .claude/skills/ | .windsurf/workflows/ | .github/prompts/ |
       | .ai-templates/instructions/PROJECT.md | CLAUDE.md | .windsurf/rules/always-on.md | .github/copilot-instructions.md |
       | .ai-templates/instructions/paths/ | N/A (use permissions) | .windsurf/rules/ (glob trigger) | .github/instructions/ |
       | .ai-templates/agents/ | .claude/agents/ | N/A (not supported) | Inline in prompts |
       | .ai-templates/config/ | .claude/settings.json | N/A | IDE settings |

    3. Naming Conventions:
       - Use kebab-case for all file and directory names
       - Main file always named SKILL.md (regardless of platform)
       - Path-specific files named: {path-pattern}.md (e.g., src-api.md)

    4. Size Limits Documentation:
       - Note Windsurf 12,000 character limit
       - Note GitHub Copilot context limits
       - Provide chunking strategy for large templates

    File location: STANDARD-STRUCTURE.md
  </action>
  <verification>
    1. Read STANDARD-STRUCTURE.md and verify:
       - Directory layout is clearly documented
       - All three platform mappings are complete
       - Naming conventions are unambiguous
       - Size limits are documented with workarounds
    2. Cross-reference against RESEARCH-*.md files to ensure accurate mappings
  </verification>
  <rollback>
    git checkout -- STANDARD-STRUCTURE.md
    rm STANDARD-STRUCTURE.md
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] Standard directory structure defined
- [x] Complete mapping table for all three platforms
- [x] Naming conventions documented
- [x] Size limits and constraints documented
- [x] Clear examples of where files go on each platform

---

### Task 3: Create Platform Adapter Specifications

**Objective:** Define the transformation rules for converting superset templates to each platform's native format, including emulation patterns for unsupported features.

**Implementation:**
```xml
<task>
  <action>
    Create PLATFORM-ADAPTERS.md with:

    1. Claude Code Adapter:
       - Field mapping (superset → Claude Code)
       - Dropped fields (Windsurf/Copilot-only fields ignored)
       - Output structure (.claude/skills/name/SKILL.md)
       - Settings generation (.claude/settings.json for permissions)
       - Example transformation

    2. Windsurf Adapter:
       - Field mapping (superset → Windsurf)
       - Emulation patterns:
         * allowed-tools → explicit instructions (no enforcement)
         * context: fork → sequential workflow markers
         * agent: → persona rules (@rules:agent-name)
         * permissions → glob trigger rules with warnings
       - Dropped fields (Claude Code-only fields with emulation notes)
       - Output structure (.windsurf/workflows/name.md)
       - Character limit handling (split if >12,000)
       - Example transformation

    3. GitHub Copilot Adapter:
       - Field mapping (superset → Copilot)
       - Emulation patterns:
         * allowed-tools → explicit instructions
         * context: fork → sequential batch notes
         * Windsurf triggers → applyTo patterns
       - Dropped fields with emulation notes
       - Output structure (.github/prompts/name.prompt.md)
       - Working set limit warnings
       - Example transformation

    4. Transformation Rules:
       - Field precedence (platform-specific overrides standard)
       - Conditional inclusion based on `platforms` field
       - Warning generation for unsupported features
       - Compatibility notes injection

    5. Example: Full transformation of a complex template to all three formats

    File location: PLATFORM-ADAPTERS.md
  </action>
  <verification>
    1. Read PLATFORM-ADAPTERS.md and verify:
       - All adapter rules are complete and unambiguous
       - Emulation patterns match GAP-ANALYSIS.md workarounds
       - Example transformations are valid for each platform
       - Edge cases documented (large files, missing features)
    2. Manually trace one example template through all three adapters
    3. Verify output formats match RESEARCH-*.md specifications
  </verification>
  <rollback>
    git checkout -- PLATFORM-ADAPTERS.md
    rm PLATFORM-ADAPTERS.md
  </rollback>
</task>
```

**Acceptance Criteria:**
- [x] Claude Code adapter fully specified
- [x] Windsurf adapter fully specified with emulation patterns
- [x] GitHub Copilot adapter fully specified with emulation patterns
- [x] Transformation rules are deterministic and complete
- [x] Example showing complete template transformation to all 3 platforms
- [x] All GAP-ANALYSIS.md workaround patterns incorporated

---

## Verification

**Phase Complete When:**
- [x] All tasks completed
- [x] All acceptance criteria met
- [x] STANDARD-SCHEMA.md exists and is complete
- [x] STANDARD-STRUCTURE.md exists and is complete
- [x] PLATFORM-ADAPTERS.md exists and is complete
- [x] No regressions introduced
- [x] Ready for Phase 3 (Workaround Pattern Library) implementation

---

## Dependencies Between Tasks

```
Task 1 (Schema) ──┐
                  ├──► Task 3 (Adapters)
Task 2 (Structure)┘    needs both schema and structure
```

**Execution Order:**
1. Task 1 and Task 2 can be done in parallel
2. Task 3 requires both Task 1 and Task 2 to be complete

---

## Deliverables Summary

| File | Purpose |
|------|---------|
| STANDARD-SCHEMA.md | Complete superset YAML frontmatter specification |
| STANDARD-STRUCTURE.md | Directory layout and platform mapping |
| PLATFORM-ADAPTERS.md | Transformation rules for each platform |

---

**Maximum 3 tasks per plan to maintain fresh context**
