# Mapping Engine Architecture

**Version:** 1.0.0
**Date:** 2026-01-12
**Purpose:** Technical architecture for the cross-platform template conversion system

---

## Overview

The Mapping Engine transforms templates written in the Standard Schema (superset format) into native formats for Claude Code, Windsurf, and GitHub Copilot. It implements a plugin-based adapter architecture that enables extensibility for future platforms.

**Key Design Principles:**

1. **Deterministic Transformation** - Same input always produces same output
2. **Graceful Degradation** - Emit warnings for unsupported features instead of failing
3. **Plugin Architecture** - Platform adapters are pluggable components
4. **Clear Separation** - Parse → Validate → Transform → Generate pipeline

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAPPING ENGINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐   │
│  │              │     │              │     │    Platform Adapters     │   │
│  │    Parser    │────▶│   Validator  │────▶│                          │   │
│  │              │     │              │     │  ┌────────────────────┐  │   │
│  │  gray-matter │     │  Schema      │     │  │ Claude Code Adapter│  │   │
│  │  extraction  │     │  Validation  │     │  ├────────────────────┤  │   │
│  │              │     │              │     │  │ Windsurf Adapter   │  │   │
│  └──────────────┘     └──────────────┘     │  ├────────────────────┤  │   │
│         │                    │              │  │ Copilot Adapter    │  │   │
│         │                    │              │  └────────────────────┘  │   │
│         ▼                    ▼              │            │             │   │
│  ┌──────────────────────────────────────┐  │            ▼             │   │
│  │           ParsedTemplate             │  │  ┌────────────────────┐  │   │
│  │  ┌─────────────┐ ┌────────────────┐  │  │  │  File Generator    │  │   │
│  │  │  metadata   │ │    content     │  │──│  │                    │  │   │
│  │  │  (YAML)     │ │   (Markdown)   │  │  │  │  Platform-specific │  │   │
│  │  └─────────────┘ └────────────────┘  │  │  │  output files      │  │   │
│  └──────────────────────────────────────┘  │  └────────────────────┘  │   │
│                                            └──────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                           Emulation Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  • Skill Emulation (Windsurf)     • Permission Emulation            │   │
│  │  • Workflow Emulation (Claude)    • Context Isolation Emulation     │   │
│  │  • Working Set Batching (Copilot) • Hook-to-Instruction Conversion  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
┌─────────────────┐
│  Input Template │
│  (.md file)     │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    1. PARSE STAGE                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Extract YAML frontmatter using gray-matter library       │    │
│  │  • Parse YAML to TemplateMetadata object                    │    │
│  │  • Extract markdown body as content string                  │    │
│  │  • Handle parse errors with descriptive messages            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ ParsedTemplate  │
│ {metadata,      │
│  content,       │
│  sourcePath}    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    2. VALIDATE STAGE                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  • Check schema compliance against STANDARD-SCHEMA.md       │    │
│  │  • Validate required fields (name for Claude Code, etc.)    │    │
│  │  • Check platform compatibility markers                     │    │
│  │  • Verify field values (trigger types, model names, etc.)   │    │
│  │  • Generate validation warnings/errors                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    3. TRANSFORM STAGE                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  For each target platform:                                  │    │
│  │    • Select appropriate platform adapter                    │    │
│  │    • Map superset fields to platform-native fields          │    │
│  │    • Drop unsupported/platform-specific fields              │    │
│  │    • Generate transformation warnings                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    4. EMULATE STAGE                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Apply workaround patterns from WORKAROUND-PATTERNS.md:     │    │
│  │                                                             │    │
│  │  Claude Code:                                               │    │
│  │    • Convert trigger: model_decision → skill description    │    │
│  │    • Convert multi-file globs → explicit Read instructions  │    │
│  │                                                             │    │
│  │  Windsurf:                                                  │    │
│  │    • Convert allowed-tools → Advisory Instructions section  │    │
│  │    • Convert context: fork → Context Markers                │    │
│  │    • Convert agent → Persona Rules file                     │    │
│  │    • Convert permissions → Glob-triggered warning rules     │    │
│  │    • Convert hooks → Manual workflow steps                  │    │
│  │                                                             │    │
│  │  GitHub Copilot:                                            │    │
│  │    • Convert allowed-tools → Constraints section            │    │
│  │    • Convert context: fork → Batch Execution Protocol       │    │
│  │    • Convert agent → Inline Persona section                 │    │
│  │    • Add Working Set Advisory if >10 files                  │    │
│  │    • Add Context Window warning if >4000 chars              │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    5. GENERATE STAGE                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Generate platform-specific output files:                   │    │
│  │                                                             │    │
│  │  Claude Code:                                               │    │
│  │    • .claude/skills/{name}/SKILL.md                        │    │
│  │    • .claude/settings.json (if permissions)                │    │
│  │    • .claude/agents/{agent}.md (if agent reference)        │    │
│  │                                                             │    │
│  │  Windsurf:                                                  │    │
│  │    • .windsurf/workflows/{name}.md                         │    │
│  │    • .windsurf/rules/agent-{agent}.md (if agent)           │    │
│  │    • .windsurf/rules/permissions-{name}.md (if permissions)│    │
│  │                                                             │    │
│  │  GitHub Copilot:                                            │    │
│  │    • .github/prompts/{name}.prompt.md                      │    │
│  │    • .github/instructions/{name}.instructions.md           │    │
│  │    • .github/copilot-instructions.md (if alwaysApply)      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────┬────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────┐
│    ConversionResult       │
│  {                        │
│    sourcePath,            │
│    template,              │
│    results: Map<Platform, │
│      TransformationResult>│
│    allWarnings,           │
│    success                │
│  }                        │
└───────────────────────────┘
```

---

## Module Structure

```
packages/cli/src/lib/template-mapper/
├── index.ts                    # Public API exports
├── types.ts                    # Type definitions (TemplateMetadata, etc.)
├── parser.ts                   # YAML frontmatter + markdown parser
├── content-parser.ts           # Semantic construct detection in content body
├── content-transformers.ts     # Platform-specific content transformation
└── adapters/                   # Platform-specific adapters
    ├── index.ts
    ├── claude-code.ts          # Claude Code adapter
    └── windsurf.ts             # Windsurf adapter

# Planned but not yet implemented:
# ├── validator.ts              # Schema validation (future)
# ├── engine.ts                 # MappingEngine orchestration (future)
# └── adapters/
#     └── github-copilot.ts     # GitHub Copilot adapter (future)
```

---

## Key Components

### 1. Parser (`parser.ts`)

**Responsibilities:**
- Extract YAML frontmatter from markdown files using `gray-matter` library
- Parse YAML to strongly-typed `TemplateMetadata` object
- Handle malformed YAML with descriptive error messages
- Extract markdown body content as string

**Interface:**
```typescript
export function parseTemplate(filePath: string): Promise<ParsedTemplate>
export function parseTemplateString(content: string): ParsedTemplate
```

**Error Handling:**
- Invalid YAML syntax → `ParseError` with line/column info
- Missing frontmatter delimiters → `ParseError` with suggestion
- File not found → `FileNotFoundError`

### 2. Content Parser (`content-parser.ts`)

**Responsibilities:**
- Detect semantic constructs in markdown body content
- Identify platform-specific syntax patterns
- Parse and categorize constructs by type and source platform
- Support all 18 construct types from CONTENT-SCHEMA.md

**Interface:**
```typescript
export function parseContent(content: string): ContentAnalysis
export function hasSemanticConstructs(content: string): boolean
export function getConstructsByPlatform(constructs: SemanticConstruct[], platform: Platform): SemanticConstruct[]
export function getConstructsByType(constructs: SemanticConstruct[], type: SemanticConstructType): SemanticConstruct[]
```

### 3. Content Transformers (`content-transformers.ts`)

**Responsibilities:**
- Transform semantic constructs for target platforms
- Add advisory warnings for unsupported features
- Rephrase platform-specific syntax
- Maintain semantic intent during transformation

**Interface:**
```typescript
export class ClaudeCodeContentTransformer implements ContentTransformer
export class WindsurfContentTransformer implements ContentTransformer
export class CopilotContentTransformer implements ContentTransformer
export function createContentTransformer(platform: Platform): ContentTransformer
```

### 4. Validator (`validator.ts`) - PLANNED

> **Note:** This component is planned but not yet implemented. Validation is currently handled within the parser.

**Planned Responsibilities:**
- Validate metadata against STANDARD-SCHEMA.md specification
- Check required fields per platform
- Validate field values (enums, patterns)
- Generate validation issues with suggestions

**Planned Validation Rules:**
- `name`: Required for Claude Code, max 64 chars, alphanumeric + hyphens/underscores
- `description`: Max 500 chars recommended
- `trigger`: Must be one of: manual, always_on, model_decision, glob
- `globs`: Required when trigger is 'glob'
- `allowed-tools`: Must be valid Claude Code tool names
- `model`: Must be valid model identifier for target platform

### 5. Platform Adapters

Each adapter implements the `PlatformAdapter` interface:

```typescript
interface PlatformAdapter {
  readonly platform: Platform
  transform(template: ParsedTemplate, options?: TransformOptions): TransformationResult
  validate(template: ParsedTemplate): TransformationWarning[]
  getOutputPath(template: ParsedTemplate): string
}
```

#### Claude Code Adapter (`adapters/claude-code.ts`)

**Field Mapping (per PLATFORM-ADAPTERS.md Section 1.1):**
| Superset Field | Claude Code Field | Action |
|----------------|-------------------|--------|
| name | name | Direct copy |
| description | description | Direct copy |
| version | version | Direct copy |
| allowed-tools | allowed-tools | Direct copy |
| model | model | Direct copy |
| context | context | Direct copy |
| agent | agent | Direct copy |
| permissions | settings.json | Merge into project settings |
| trigger | *(dropped)* | Windsurf-only |
| globs | *(dropped)* | Windsurf-only |
| applyTo | *(dropped)* | Copilot-only |

**Output Files:**
- Main: `.claude/skills/{name}/SKILL.md`
- Settings: `.claude/settings.json` (merged, if permissions specified)
- Agent: `.claude/agents/{agent}.md` (if agent reference exists)

#### Windsurf Adapter (`adapters/windsurf.ts`)

**Field Mapping (per PLATFORM-ADAPTERS.md Section 2.1):**
| Superset Field | Windsurf Field | Action |
|----------------|----------------|--------|
| name | *(filename)* | Use as filename |
| description | description | Direct copy |
| trigger | trigger | Direct copy |
| globs | globs | Direct copy |
| labels | labels | Direct copy |
| alwaysApply | alwaysApply | Direct copy |
| allowed-tools | *(emulated)* | → Advisory Instructions |
| context | *(emulated)* | → Context Markers |
| agent | *(emulated)* | → Persona Rules file |
| permissions | *(emulated)* | → Glob-triggered warnings |

**Emulation Patterns Applied:**
1. Tool restrictions → "## Tool Restrictions (Advisory)" section
2. Context isolation → "[CONTEXT: Isolated Execution]" markers
3. Custom agents → `.windsurf/rules/agent-{name}.md` companion file
4. Permissions → `.windsurf/rules/permissions-{name}.md` companion file

**Output Files:**
- Main: `.windsurf/workflows/{name}.md`
- Agent: `.windsurf/rules/agent-{agent}.md` (if agent)
- Permissions: `.windsurf/rules/permissions-{name}.md` (if permissions)

**Character Limit Handling:**
- Check output length against 12,000 char limit
- If exceeded, split at markdown heading boundaries
- Generate continuation files: `{name}-part-2.md`, etc.

#### GitHub Copilot Adapter (`adapters/github-copilot.ts`) - PLANNED

> **Note:** This adapter is planned but not yet implemented. See PLATFORM-ADAPTERS.md Section 3 for the specification.

**Planned Field Mapping (per PLATFORM-ADAPTERS.md Section 3.1):**
| Superset Field | Copilot Field | Action |
|----------------|---------------|--------|
| name | *(filename)* | Use as filename |
| description | description | Direct copy |
| applyTo | applyTo | Direct copy (normalize to array) |
| excludeAgent | excludeAgent | Direct copy (normalize to array) |
| mode | mode | Direct copy |
| globs | applyTo | Convert |
| allowed-tools | *(emulated)* | → Constraints section |
| context | *(emulated)* | → Batch Protocol |
| agent | *(emulated)* | → Inline Persona |

**Planned Limit Warnings:**
- Working set: Warn if template may touch >10 files
- Context: Warn if body >4000 chars
- Add batching guidance for large operations

**Planned Output Files:**
- Main: `.github/prompts/{name}.prompt.md`
- Instructions: `.github/instructions/{name}.instructions.md` (if applyTo)
- Global: `.github/copilot-instructions.md` (if alwaysApply)

### 6. Mapping Engine (`engine.ts`) - PLANNED

> **Note:** This component is planned but not yet implemented. Currently, adapters are used directly.

**Planned Responsibilities:**
- Orchestrate the full conversion pipeline
- Manage adapter registry
- Coordinate parse → validate → transform → generate flow
- Aggregate results and warnings

**Planned Interface:**
```typescript
class MappingEngineImpl implements MappingEngine {
  parse(filePath: string, options?: ParseOptions): Promise<ParsedTemplate>
  parseString(content: string, options?: ParseOptions): ParsedTemplate
  convert(template: ParsedTemplate | string, options?: TransformOptions): Promise<ConversionResult>
  getAdapter(platform: Platform): PlatformAdapter
  registerAdapter(adapter: PlatformAdapter): void
}

export function createMappingEngine(): MappingEngine
```

---

## Current Implementation Status

The following components are implemented and exported from `packages/cli/src/lib/template-mapper/`:

| Component | Status | File |
|-----------|--------|------|
| Parser | Implemented | `parser.ts` |
| Content Parser | Implemented | `content-parser.ts` |
| Content Transformers | Implemented | `content-transformers.ts` |
| Types | Implemented | `types.ts` |
| Claude Code Adapter | Implemented | `adapters/claude-code.ts` |
| Windsurf Adapter | Implemented | `adapters/windsurf.ts` |
| GitHub Copilot Adapter | Planned | `adapters/github-copilot.ts` |
| Validator | Planned | `validator.ts` |
| Mapping Engine | Planned | `engine.ts` |

---

## Error Handling Strategy

### Error Categories

1. **Parse Errors** - Invalid YAML, missing delimiters
   - Return descriptive error with line/column
   - Suggest common fixes

2. **Validation Errors** - Schema violations
   - Collect all issues before failing
   - Provide field-level suggestions

3. **Transformation Errors** - Adapter failures
   - Fail gracefully with error in result
   - Continue processing other platforms

4. **File System Errors** - I/O issues
   - Clear error messages with paths
   - Suggest permission fixes

### Warning vs Error Policy

| Situation | Response |
|-----------|----------|
| Missing required field | Error (strict mode) or Warning |
| Unknown field | Warning (may be future field) |
| Unsupported feature | Warning + emulation |
| Platform limit exceeded | Warning + guidance |
| Advisory-only security | Warning + documentation |

---

## Extension Points

### Adding New Platforms

1. Create adapter file: `adapters/{platform}.ts`
2. Implement `PlatformAdapter` interface
3. Register with engine: `engine.registerAdapter(new NewPlatformAdapter())`
4. Add platform to `Platform` type and `PLATFORMS` constant

### Adding New Emulation Patterns

1. Create pattern file: `emulation/{pattern-name}.ts`
2. Export pattern application function
3. Import and call from relevant adapter(s)
4. Document pattern in WORKAROUND-PATTERNS.md

### Custom Validators

1. Implement `SchemaValidator` interface
2. Register with engine configuration
3. Validators chain: base → platform-specific → custom

---

## CLI Integration

The mapping engine integrates with the CLI via the `convert` command:

```
aiwcli convert <source> --to <platform> [options]

Arguments:
  source              Path to template file or directory

Options:
  --to, -t <platform> Target platform(s): claude-code, windsurf, github-copilot
  --output, -o <dir>  Output directory (default: current directory)
  --strict            Fail on any incompatibility
  --dry-run           Show what would be generated without writing files
  --verbose           Show detailed transformation logs
```

**Command Flow:**
1. Parse `--to` argument to determine target platforms
2. Load and parse source template
3. Call `engine.convert()` with options
4. Display warnings and results
5. Write output files (unless `--dry-run`)

---

## Testing Strategy

### Unit Tests

- **Parser Tests:** Valid input, invalid YAML, missing fields, edge cases
- **Validator Tests:** Each validation rule, field constraints
- **Adapter Tests:** Field mapping, emulation patterns, output structure
- **Engine Tests:** Pipeline orchestration, multi-platform conversion

### Integration Tests

- **End-to-End:** Convert example templates, verify output
- **Round-Trip:** Standard → Claude Code → verify format
- **Cross-Platform:** Same template to all platforms, compare outputs

### Test Data

- Use templates from `examples/` directory
- Create fixtures for edge cases
- Test with actual skill/workflow files from Phase 3

---

## Dependencies

**Required:**
- `gray-matter` - YAML frontmatter parsing
- `js-yaml` (via gray-matter) - YAML parsing

**Already in project:**
- `@oclif/core` - CLI framework
- `chalk` - Output coloring
- TypeScript - Type safety

---

## Security Considerations

1. **File Path Validation** - Prevent path traversal attacks
2. **Output Sanitization** - No user input in generated code paths
3. **Permission Warnings** - Clearly document advisory-only security
4. **No Code Execution** - Parser doesn't execute template content

---

## Performance Considerations

1. **Lazy Loading** - Adapters loaded on demand
2. **Streaming** - For large files, stream content
3. **Caching** - Cache parsed templates if converting multiple times
4. **Parallel Processing** - Convert to multiple platforms concurrently

---

## Future Enhancements

1. **Watch Mode** - Auto-convert on file changes
2. **Reverse Conversion** - Platform-native → Standard format
3. **Template Marketplace** - Share/discover templates
4. **IDE Extensions** - VSCode/Windsurf/Cursor integrations
5. **Validation Web UI** - Browser-based template validator

---

## Sources

- STANDARD-SCHEMA.md - Superset schema specification
- STANDARD-STRUCTURE.md - Directory layout conventions
- PLATFORM-ADAPTERS.md - Transformation rules
- WORKAROUND-PATTERNS.md - Emulation patterns
- GAP-ANALYSIS.md - Capability gaps documentation
