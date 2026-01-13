# Execution Plan - Phase 5

## Overview

**Phase:** Semantic Content Transformation
**Created:** 2026-01-12
**Status:** Completed

## Context

Phase 4 built the template mapper that transforms **metadata** (YAML frontmatter) between platforms. However, the **content** (markdown body) passes through unchanged. This creates a problem: platform-specific constructs in content (e.g., "spawn agent X", "use the Task tool to delegate") become nonsensical on platforms that don't support them.

Phase 5 addresses this by:
1. Defining a schema for semantic constructs that appear in workflow content
2. Building a parser that identifies these constructs
3. Creating per-platform transformers that rewrite content appropriately

**User Guidance:** Use task agents to conserve context. Design work with Opus agents proposing schemas, then review agents evaluating, using iterative refinement loops until reviews find no issues.

### Iterative Refinement Loop Definition

An iterative refinement loop (propose-review-iterate cycle) works as follows:

1. **PROPOSE:** Proposer agent creates the artifact
2. **REVIEW:** Reviewer agent evaluates with confidence score (1-10) and issue list
   - **Blocking issue:** Any issue that would cause the artifact to be unusable for its purpose
   - **Non-blocking issue:** Improvements that don't prevent basic functionality
3. **ITERATE:** If confidence < 8 OR blocking issues exist, return to step 1 with feedback
4. **TERMINATE:** Accept and proceed when confidence >= 8 with no blocking issues
5. **FALLBACK:** Maximum 5 iterations. If threshold not met after 5 cycles, escalate to user.

## Tasks

### Task 1: Design Content Schema via Agent Iteration

**Objective:** Create CONTENT-SCHEMA.md defining all semantic constructs that need transformation, using agent-based iterative refinement.

**Implementation:**
```xml
<task>
  <action>
    Use agent-based iterative refinement loop to design the content schema:

    1. PROPOSE PHASE (Opus agent via Task tool):
       Spawn an Opus agent to propose CONTENT-SCHEMA.md containing:
       - List of semantic constructs (agent spawning, tool calls, context switches, etc.)
       - Detection patterns (regex/heuristics) for each construct
       - Source platform identification (which platform uses this construct)
       - Example instances from real workflows

       Agent should analyze:
       - WORKAROUND-PATTERNS.md for existing construct examples
       - examples/skill-example.md (skill format, tool restrictions, activation patterns)
       - examples/workflow-example.md (workflow emulation, Step 0 context gathering)
       - examples/copilot-limited-context.md (skill decomposition, chaining patterns)
       - RESEARCH-claude-code.md, RESEARCH-windsurf.md for platform-specific syntax

       CONTENT-SCHEMA.md should follow this structure for each construct:
       ```markdown
       # Construct: {name}
       ## Description: {what it represents}
       ## Source Platform: {claude-code|windsurf|copilot}
       ## Detection Pattern: {regex or heuristic}
       ## Examples:
       - Example 1: `{raw text}`
       - Example 2: `{raw text}`
       ```

    2. REVIEW PHASE (Sonnet agent via Task tool):
       Spawn a Sonnet review agent to evaluate the schema:
       - Check for completeness (all constructs from WORKAROUND-PATTERNS.md covered?)
       - Check for ambiguity (can detection patterns false-positive?)
       - Check for missing edge cases
       - Score confidence 1-10, list specific issues as BLOCKING or NON-BLOCKING

    3. ITERATE until review confidence >= 8 with no blocking issues (max 5 iterations)

    4. Write final CONTENT-SCHEMA.md to project root
  </action>
  <verification>
    - CONTENT-SCHEMA.md exists with comprehensive construct coverage
    - All constructs from WORKAROUND-PATTERNS.md are covered (minimum: agent-spawn, tool-call,
      context-switch, permission-reference, model-decision-trigger, glob-pattern, persona-rule,
      skill-chaining, context-gathering-protocol, activation-instruction)
    - Each construct has: name, description, detection pattern, source platform
    - Each construct has at least 2 example instances
    - Review agent scores >= 8 confidence
    - No blocking issues remain from final review
  </verification>
  <rollback>
    - Delete CONTENT-SCHEMA.md
    - git checkout HEAD -- CONTENT-SCHEMA.md (if committed)
  </rollback>
</task>
```

**Acceptance Criteria:**
- [ ] CONTENT-SCHEMA.md created with comprehensive construct definitions
- [ ] All semantic constructs from WORKAROUND-PATTERNS.md are documented
- [ ] Detection patterns are specific enough to avoid false positives
- [ ] Review agent confirms schema completeness with confidence >= 8
- [ ] Example instances demonstrate each construct clearly

---

### Task 2: Implement Content Parser with Detection Engine

**Objective:** Build content parser that extracts semantic constructs from markdown workflow content using the schema from Task 1.

**Implementation:**
```xml
<task>
  <action>
    1. Add types to packages/cli/src/lib/template-mapper/types.ts (following project pattern):

       ```typescript
       /**
        * Semantic construct identified in workflow content
        */
       export interface SemanticConstruct {
         type: string;        // e.g., 'agent-spawn', 'tool-call', 'context-switch'
         platform: Platform;  // source platform that uses this syntax
         source: 'frontmatter' | 'body';  // where construct was found
         location: {          // where in content
           start: number;
           end: number;
           line: number;
         };
         rawText: string;     // original matched text
         parsed: Record<string, unknown>; // extracted data
       }

       /**
        * Result of parsing content for semantic constructs
        */
       export interface ContentAnalysis {
         constructs: SemanticConstruct[];
         rawContent: string;
       }
       ```

    2. Create packages/cli/src/lib/template-mapper/content-parser.ts:

       Import types from types.ts (following project pattern):
       ```typescript
       import type { Platform, SemanticConstruct, ContentAnalysis } from './types.js'
       ```

    3. Implement detection functions for ALL construct types from CONTENT-SCHEMA.md:
       - detectAgentSpawning(): finds "spawn agent", "Task tool", subagent references
       - detectToolCalls(): finds "use X tool", "call Y tool"
       - detectContextSwitches(): finds "fork context", "inherit context"
       - detectPermissionReferences(): finds tool restrictions, allowed-tools references
       - detectModelDecisionTriggers(): finds "USE WHEN", "trigger: model_decision"
       - detectGlobPatterns(): finds multi-file context references
       - detectPersonaRules(): finds "@rules:agent-", persona activation
       - detectSkillChaining(): finds "/prompt", skill references, "Part 1 -> Part 2"
       - detectContextGatheringProtocols(): finds "Step 0", context checklist markers
       - detectActivationInstructions(): finds "Invocation:", manual invoke guidance
       (Detection functions must cover 100% of constructs from CONTENT-SCHEMA.md)

    4. Create main parseContent(content: string): ContentAnalysis function
       - Run all detectors
       - Merge results with location tracking
       - Handle overlapping matches:
         - Prefer more specific (longer) matches over generic ones
         - If same specificity, prefer earlier start position
         - Nested constructs: outer construct contains inner in parsed.children
       - Skip constructs found inside markdown code blocks (```...```)

    5. Export from template-mapper/index.ts:
       ```typescript
       export { parseContent } from './content-parser.js'
       export type { SemanticConstruct, ContentAnalysis } from './types.js'
       ```

    6. Write unit tests in packages/cli/test/lib/template-mapper/content-parser.test.ts:
       - Test each construct type detection
       - Test edge cases:
         - Nested constructs
         - No matches (plain markdown)
         - Constructs inside code blocks (should skip)
         - Multiple overlapping constructs
         - Multi-line construct patterns
         - Malformed/partial constructs
  </action>
  <verification>
    - content-parser.ts exists with all detection functions
    - Types added to types.ts following project centralization pattern
    - Unit tests pass: npx mocha "test/lib/template-mapper/content-parser.test.ts"
    - Parser correctly identifies constructs from example workflows
    - No false positives on plain markdown or code blocks
  </verification>
  <rollback>
    - Delete packages/cli/src/lib/template-mapper/content-parser.ts
    - Delete packages/cli/test/lib/template-mapper/content-parser.test.ts
    - Revert type additions in types.ts
    - Remove exports from index.ts
  </rollback>
</task>
```

**Acceptance Criteria:**
- [ ] Types (SemanticConstruct, ContentAnalysis) added to types.ts
- [ ] content-parser.ts implements all detection functions from CONTENT-SCHEMA.md
- [ ] parseContent() function correctly identifies constructs with location info
- [ ] All unit tests pass (target: 20+ tests covering all construct types and edge cases)
- [ ] Tests verify each construct type from the schema

---

### Task 3: Implement Content Transformers and CLI Integration

**Objective:** Create per-platform content transformers and integrate semantic transformation into the `aiw convert` CLI.

**Implementation:**
```xml
<task>
  <action>
    1. Add transformer types to packages/cli/src/lib/template-mapper/types.ts:

       ```typescript
       import type { Platform, ContentAnalysis, TransformationWarning } from './types.js'

       /**
        * Content transformer interface for platform-specific content rewriting
        */
       export interface ContentTransformer {
         platform: Platform;
         transform(analysis: ContentAnalysis): TransformedContent;
       }

       /**
        * Result of content transformation
        */
       export interface TransformedContent {
         content: string;
         warnings: TransformationWarning[];
       }
       ```

    2. Create packages/cli/src/lib/template-mapper/content-transformers.ts:

       Implement platform-specific transformers:

       a) Claude Code Transformer (minimal changes):
          - Pass through most constructs (Claude Code is the reference platform)
          - Convert Windsurf-specific syntax if present
          - Warn on Windsurf-only constructs (model_decision, globs)

       b) Windsurf Transformer:
          - Inline agent prompts instead of spawn references:
            "spawn agent X" -> Inline agent X's prompt directly in the workflow
          - Convert "Task tool" references to sequential workflow steps
          - Add advisory notes where constructs are emulated:
            ```markdown
            ## Tool Restrictions (Advisory)
            > **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.
            ```
          - Handle GAP-W1: Windsurf cannot spawn parallel subagents like Claude Code's Task tool.
            Transform "spawn agent X" to inlined instructions or sequential workflow steps.
          - Include: "IMPORTANT: Before using tools outside this list, ask user for permission"

       c) GitHub Copilot Transformer:
          - Decompose large context references for 10-file limit
          - Convert agent spawns to manual handoff suggestions:
            "spawn agent X" -> "## Manual Handoff\nCreate separate chat session for: {task}"
          - Generate skill chaining structure for large operations:
            - Create coordinator prompt when content references >10 files
            - Add "Next Steps" sections linking to sub-skills
            - Generate progress tracking template (PROGRESS.md pattern)
          - Add working set management guidance:
            - Multi-file context refs -> Batch instructions: "Process files in groups of 10"
            - Document as "@workspace constraints"

    3. Write unit tests in packages/cli/test/lib/template-mapper/content-transformers.test.ts:
       - Test WindsurfTransformer.transform() inlines agent spawning constructs
       - Test CopilotTransformer.transform() decomposes large context references
       - Test ClaudeCodeTransformer.transform() passes through correctly
       - Test warning generation for unsupported constructs
       - Test advisory section generation for Windsurf

    4. Update platform adapters to use content transformers:
       - Modify ClaudeCodeAdapter.transform():
         ```typescript
         // After parsing content, apply content transformation
         const contentResult = claudeContentTransformer.transform(parsedContent)
         const transformedContent = contentResult.content
         warnings.push(...contentResult.warnings)
         ```
       - Modify WindsurfAdapter.transform() similarly
       - Ensure warnings from content transformation are included in result

    5. Extend ParsedTemplate type in types.ts:
       ```typescript
       export interface ParsedTemplate {
         metadata: TemplateMetadata
         content: string
         sourcePath?: string
         // Phase 5 addition:
         contentAnalysis?: ContentAnalysis
       }
       ```

    6. Write integration tests in packages/cli/test/integration/content-transform.test.ts:
       - Test full conversion with content containing semantic constructs
       - Verify output content is correctly transformed per platform
       - Test round-trip verification:
         - Semantic constructs survive round-trip (structural integrity)
         - Warnings correctly identify emulation artifacts
         - Note: Lossless round-trip is NOT expected due to platform capability gaps
       - Test error handling:
         - Content with unrecognized constructs
         - Transformer exceptions
         - Partial transformation failures

    7. Test CLI end-to-end:
       - aiw convert examples/workflow-example.md --to windsurf
       - Verify content is transformed, not just metadata
  </action>
  <verification>
    - content-transformers.ts exists with all platform transformers
    - Types added to types.ts (ContentTransformer, TransformedContent)
    - Unit tests for transformers pass
    - Each adapter's transform() method applies content transformation
    - aiw convert command transforms content correctly
    - Integration tests pass covering semantic constructs
    - Warnings generated for emulated/unsupported constructs
  </verification>
  <rollback>
    - Delete packages/cli/src/lib/template-mapper/content-transformers.ts
    - Delete packages/cli/test/lib/template-mapper/content-transformers.test.ts
    - Delete packages/cli/test/integration/content-transform.test.ts
    - Revert changes to claude-code.ts, windsurf.ts adapters
    - Revert ParsedTemplate type extension in types.ts
    - git checkout HEAD -- packages/cli/src/lib/template-mapper/
  </rollback>
</task>
```

**Acceptance Criteria:**
- [ ] ContentTransformer interface defined in types.ts with platform-specific implementations
- [ ] Windsurf transformer inlines agent prompts and adds advisory warnings
- [ ] Copilot transformer handles context decomposition with skill chaining support
- [ ] Unit tests for content-transformers.ts pass (target: 15+ tests)
- [ ] CLI `aiw convert` transforms content, not just metadata
- [ ] Warnings generated for emulated/unsupported content constructs
- [ ] Integration tests verify end-to-end transformation

---

## Dependencies Between Tasks

```
Task 1 (Schema) ──► Task 2 (Parser) ──► Task 3 (Transformers)
                    needs schema       needs parser
```

**Execution Order:**
1. Task 1 must complete first to define CONTENT-SCHEMA.md
2. Task 2 uses CONTENT-SCHEMA.md to implement detection functions
3. Task 3 uses parser output to implement transformers

---

## Deliverables Summary

| File | Purpose |
|------|---------|
| CONTENT-SCHEMA.md | Semantic construct definitions with detection patterns |
| types.ts (additions) | SemanticConstruct, ContentAnalysis, ContentTransformer, TransformedContent types |
| content-parser.ts | Parser to identify constructs in workflow content |
| content-transformers.ts | Per-platform transformers for content rewriting |
| content-parser.test.ts | Unit tests for parser |
| content-transformers.test.ts | Unit tests for transformers |
| content-transform.test.ts | Integration tests for end-to-end transformation |

---

## Verification

**Phase Complete When:**
- [ ] All tasks completed
- [ ] All acceptance criteria met
- [ ] No regressions introduced (existing tests still pass)
- [ ] Changes committed atomically (one commit per task)
- [ ] CONTENT-SCHEMA.md documents all semantic constructs from WORKAROUND-PATTERNS.md
- [ ] Content parser correctly identifies platform-specific constructs
- [ ] Content transformers rewrite content for each target platform
- [ ] `aiw convert` CLI produces semantically correct output

---

**Maximum 3 tasks per plan to maintain fresh context**
