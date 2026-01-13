# Content Schema: Semantic Constructs for Cross-Platform Transformation

**Version:** 1.0.0
**Date:** 2026-01-12
**Purpose:** Define all semantic constructs appearing in workflow/skill content that require transformation between AI assistant platforms (Claude Code, Windsurf, GitHub Copilot)

---

## Overview

This schema defines semantic constructs found in the markdown body of workflows and skills that contain platform-specific syntax. Unlike YAML frontmatter metadata (handled by Phase 4), these constructs appear in the actual instructional content and become nonsensical when viewed on platforms that lack the referenced capabilities.

**Scope:**
- Markdown content body (not frontmatter)
- Platform-specific syntax and references
- Constructs that require transformation or advisory notes

**Detection Guidelines:**
- Skip constructs inside fenced code blocks (```...```)
- Apply transformations only to instructional prose
- Preserve original semantics through platform-appropriate equivalents

---

## Construct Categories

1. **Agent & Execution** - Subagent spawning, context management
2. **Tool & Permission** - Tool calls, restrictions, allowed operations
3. **Activation & Invocation** - Triggers, manual invocation guidance
4. **Context & Discovery** - Multi-file context, glob patterns
5. **Workflow Orchestration** - Skill chaining, progress tracking

---

# Construct: agent-spawn

## Description
References to spawning, creating, or delegating work to subagents or separate execution contexts. This includes references to the Task tool, agent forking, and parallel execution patterns.

## Source Platform
**claude-code** - Native subagent spawning via Task tool and `context: fork`

## Detection Pattern
```regex
(?i)(spawn\s+agent|subagent|Task\s+tool|context:\s*fork|parallel\s+agent|delegate\s+to\s+agent|isolated\s+context|separate\s+context|spawn\s+a?\s*(new\s+)?agent)
```

## Examples
- Example 1: `spawn agent to handle security review` (from WORKAROUND-PATTERNS.md, Pattern 1)
- Example 2: `Cannot spawn parallel isolated contexts` (from WORKAROUND-PATTERNS.md, Known Limitations)
- Example 3: `Via Task tool with subagent_type parameter` (from RESEARCH-claude-code.md, Section 4)
- Example 4: `Via context: fork in skill frontmatter` (from RESEARCH-claude-code.md)

## Transformation Notes
- **To Windsurf:** Add advisory note: "Subagent spawning not supported. Execute sequentially in single Cascade session."
- **To Copilot:** Add advisory note: "Subagent execution not available. Process as sequential workflow steps."
- Replace "spawn agent" with "execute the following steps" or similar sequential phrasing

---

# Construct: tool-call

## Description
Explicit references to using specific tools by name, including the tool invocation syntax patterns. These references guide the AI on which tools to use for specific operations.

## Source Platform
**claude-code** - Rich tool ecosystem with explicit tool names

## Detection Pattern
```regex
(?i)(use\s+(the\s+)?(Read|Write|Edit|Grep|Glob|Bash|Task|WebFetch|WebSearch|AskUserQuestion)\s+tool|call\s+(the\s+)?(Read|Write|Edit|Grep|Glob|Bash|Task)\s+tool|(Read|Write|Edit|Grep|Glob|Bash)\s*\(|run\s+(Read|Grep|Glob))
```

## Examples
- Example 1: `Use Glob to discover files before Reading them` (from WORKAROUND-PATTERNS.md, Pattern 2)
- Example 2: `AI uses Glob to scan for *.test.ts files` (from examples/skill-example.md)
- Example 3: `Glob: src/api/**/*.ts` (from WORKAROUND-PATTERNS.md, Step 0 protocol)
- Example 4: `Grep: pattern="query|findMany" path="src/"` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- **To Windsurf:** Rephrase as action descriptions: "Search for files matching..." instead of "Use Glob tool"
- **To Copilot:** Keep generic tool references but clarify as recommendations: "Search for" or "Read" without specific tool names
- Preserve semantic intent while removing platform-specific tool syntax

---

# Construct: context-switch

## Description
References to context management including forking contexts, inheriting parent context, or creating isolated execution environments. Controls how conversation history and state flow between operations.

## Source Platform
**claude-code** - Native context control via `context: fork` and `context: inherit`

## Detection Pattern
```regex
(?i)(context:\s*(fork|inherit)|fork\s+context|inherit\s+context|isolated\s+context|separate\s+context|context\s+isolation|context\s+window|fresh\s+context|clean\s+context|shared\s+context)
```

## Examples
- Example 1: `This workflow uses inherited context (normal Cascade session)` (from WORKAROUND-PATTERNS.md, Windsurf adaptation)
- Example 2: `context: fork can only be simulated with markers` (from WORKAROUND-PATTERNS.md, Known Limitations)
- Example 3: `Using context: inherit means skill runs in main session` (from examples/workflow-example.md)
- Example 4: `Separate context window` (from RESEARCH-claude-code.md, Agent Types)

## Transformation Notes
- **To Windsurf:** Replace with execution context explanation: "Executes in current Cascade session (no isolation available)"
- **To Copilot:** Remove context references entirely; Copilot has no equivalent concept
- Add notes explaining what context isolation would have provided

---

# Construct: permission-reference

## Description
References to tool restrictions, allowed/forbidden operations, and permission boundaries. Includes both enforced permissions (Claude Code) and advisory restrictions (other platforms).

## Source Platform
**claude-code** - Enforced via `allowed-tools` and permissions.allow/deny

## Detection Pattern
```regex
(?i)(allowed[- ]?tools|forbidden\s+operations|tool\s+restrictions?|permission\s+restrictions?|not\s+allowed|allow(ed)?:\s*-|deny:\s*-|before\s+using\s+tools\s+outside|rely\s+on\s+AI\s+compliance|advisory\s+(only|restrictions?)|cannot\s+be\s+enforced)
```

## Examples
- Example 1: `Tool Restrictions (Advisory) - NOTE: These restrictions rely on AI compliance and are NOT enforced by Windsurf` (from WORKAROUND-PATTERNS.md, Skill Emulation)
- Example 2: `Forbidden Operations: - File editing - Non-git shell commands` (from WORKAROUND-PATTERNS.md)
- Example 3: `allowed-tools: - Read - Grep - Bash(npm audit)` (from WORKAROUND-PATTERNS.md)
- Example 4: `Before using tools outside this list, ask user for permission` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- **To Windsurf:** Add header "Tool Restrictions (Advisory)" with warning that restrictions are not enforced
- **To Copilot:** Add section "Operational Constraints" with recommendation language
- Always clarify enforcement level on each platform

---

# Construct: model-decision-trigger

## Description
References to AI-driven activation patterns where the model decides when to activate a workflow based on context and description matching. Includes "USE WHEN" patterns and trigger descriptions.

## Source Platform
**windsurf** - Native via `trigger: model_decision` and description-based matching

## Detection Pattern
```regex
(?i)(USE\s+WHEN|trigger:\s*model_decision|model\s+decision|AI\s+determines|AI\s+decides|automatically\s+activates?|activates?\s+automatically|auto-?activation|activate\s+when\s+user\s+mentions|Cascade['s]?\s+(model\s+decision|determines))
```

## Examples
- Example 1: `USE WHEN creating git commits. Helps write conventional commit messages.` (from WORKAROUND-PATTERNS.md)
- Example 2: `trigger: model_decision - AI decides when to apply` (from RESEARCH-windsurf.md)
- Example 3: `Windsurf's AI determines commit creation is relevant` (from WORKAROUND-PATTERNS.md)
- Example 4: `This workflow activates automatically when: - User mentions "commit"` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- **To Claude Code:** Convert to rich description with trigger keywords; add "Invocation command: /skill-name" section
- **To Copilot:** Add "When to use this prompt" section with explicit guidance
- Always provide manual invocation fallback for platforms without model decision

---

# Construct: glob-pattern

## Description
Multi-file context references using glob patterns that specify which files should be loaded or considered during workflow execution. Includes both frontmatter patterns and inline references.

## Source Platform
**windsurf** - Native via `globs:` frontmatter for automatic multi-file context

## Detection Pattern
```regex
(?i)(globs?:\s*\[|globs?:\s*-\s*["\']|matching\s+glob|glob\s+pattern|\*\*/\*\.(ts|tsx|js|jsx|py|md)|src/\*\*/|files?\s+matching\s+["\']?\*|applyTo:\s*\[)
```

## Examples
- Example 1: `globs: - "src/components/**/*.tsx" - "src/components/**/*.ts"` (from WORKAROUND-PATTERNS.md)
- Example 2: `Windsurf automatically loads all files matching glob patterns into context` (from WORKAROUND-PATTERNS.md)
- Example 3: `Scan for test files matching *.test.ts or *.spec.ts` (from examples/skill-example.md)
- Example 4: `applyTo: - "**/*.test.ts" - "**/*.spec.ts"` (from examples/skill-example.md)

## Transformation Notes
- **To Claude Code:** Add "Step 0: Multi-File Context Acquisition" section with Glob tool calls
- **To Copilot:** Add `applyTo:` in frontmatter and note working set limits
- Convert automatic context loading to explicit discovery steps

---

# Construct: persona-rule

## Description
References to custom agent personas, specialized behavioral profiles, or role-based instructions that modify how the AI operates during workflow execution.

## Source Platform
**windsurf** - Via `@rules:agent-{name}` activation in manual trigger rules

## Detection Pattern
```regex
(?i)(@rules:agent-|agent\s+persona|persona\s+rule|security[-\s]specialist|specialized\s+agent|adopt\s+this\s+persona|behavioral\s+guidelines|specialized\s+.*\s+agent|agent[:\s]+[a-z-]+|custom\s+agent)
```

## Examples
- Example 1: `@rules:agent-security-specialist` (from WORKAROUND-PATTERNS.md)
- Example 2: `When @rules:agent-security-specialist is active, adopt this persona` (from WORKAROUND-PATTERNS.md)
- Example 3: `agent: security-specialist` in skill frontmatter (from WORKAROUND-PATTERNS.md)
- Example 4: `Activate with: @rules:agent-security-specialist before running this workflow` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- **To Claude Code:** Reference via `agent:` frontmatter field; agent definitions in `.claude/agents/`
- **To Copilot:** Embed persona instructions directly in prompt body; no external agent files
- Always include full persona definition inline for platforms without external agent support

---

# Construct: skill-chaining

## Description
References to invoking other skills, prompts, or workflows from within a workflow. Includes sequential execution patterns, "Part X of Y" decomposition, and cross-references to related skills.

## Source Platform
**github-copilot** - Pattern for working set limitation via sequential prompt chaining

## Detection Pattern
```regex
(?i)(/prompt\s+[a-z-]+|Part\s+\d+\s+(of|→)\s+\d+|Proceed\s+to\s+Part\s+\d+|Next\s+Steps.*Part\s+\d+|→\s*Part\s+\d+|skill\s+chaining|invoke.*skill|chain.*skills?|/[a-z-]+\s*$|execute.*prompt)
```

## Examples
- Example 1: `Proceed to Part 2: /prompt refactor-auth-api` (from examples/copilot-limited-context.md)
- Example 2: `Part 1 of 4: Core Authentication Module` (from WORKAROUND-PATTERNS.md)
- Example 3: `/prompt refactor-database-core` (from examples/copilot-limited-context.md)
- Example 4: `Part 1 → Directs to Part 2` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- **To Claude Code:** Convert to skill invocations: `/skill-name` or reference within description
- **To Windsurf:** Convert to workflow invocations: `/workflow-name` or use @rules references
- Maintain clear sequencing instructions across all platforms

---

# Construct: context-gathering-protocol

## Description
Explicit instructions for gathering file context before beginning analysis or modification. Includes Step 0 protocols, context checklists, and multi-file discovery patterns.

## Source Platform
**claude-code** - Emulation pattern for Windsurf's automatic multi-file context

## Detection Pattern
```regex
(?i)(Step\s+0|Context\s+Gathering\s+Protocol|Multi-?File\s+Context\s+Acquisition|Context\s+Checklist|gather.*context|context\s+gathering|before\s+beginning.*gather|comprehensive\s+context|Only\s+proceed.*context)
```

## Examples
- Example 1: `### Step 0: Multi-File Context Acquisition` (from WORKAROUND-PATTERNS.md)
- Example 2: `Context Checklist: - [ ] All API routes identified - [ ] Middleware files loaded` (from WORKAROUND-PATTERNS.md)
- Example 3: `IMPORTANT: Before beginning refactoring analysis, gather comprehensive context` (from examples/workflow-example.md)
- Example 4: `Only proceed to analysis once context gathering is complete` (from examples/workflow-example.md)

## Transformation Notes
- **To Windsurf:** Remove Step 0; context is automatic via `globs:` frontmatter
- **To Copilot:** Keep Step 0 but limit file counts per working set (max 10)
- Include checklist format for verification across all platforms

---

# Construct: activation-instruction

## Description
Guidance on when and how to invoke a skill, workflow, or prompt. Includes manual invocation commands, trigger conditions, and user action requirements.

## Source Platform
**All platforms** - Universal pattern with platform-specific syntax

## Detection Pattern
```regex
(?i)(Manual\s+invocation|Invocation.*command|/[a-z-]+\s*$|When\s+to\s+invoke|invoke\s+this\s+skill|invoke\s+with|user\s+must.*invoke|explicitly\s+invoke|Activation\s+Instructions|Manual\s+Trigger)
```

## Examples
- Example 1: `Manual invocation: /commit-helper` (from WORKAROUND-PATTERNS.md)
- Example 2: `Invocation command: /optimize-api-performance` (from WORKAROUND-PATTERNS.md)
- Example 3: `When to invoke this skill: Use when user mentions "optimize API performance"` (from WORKAROUND-PATTERNS.md)
- Example 4: `User can also explicitly invoke: /commit-helper` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- **To Claude Code:** Use `/skill-name` format
- **To Windsurf:** Use `/workflow-name` format
- **To Copilot:** Use `/prompt name` or reference file directly

---

# Construct: working-set-limit

## Description
References to file count limitations, working set constraints, and strategies for handling operations that exceed platform limits.

## Source Platform
**github-copilot** - 10-file working set limit, 20-file context awareness limit

## Detection Pattern
```regex
(?i)(working\s+set|10[-\s]file\s+limit|file\s+limit|working\s+set\s+limit|≤?\s*10\s+files?|batch.*files?|file\s+prioritization|exceeds?.*limit|within.*limit)
```

## Examples
- Example 1: `GitHub Copilot's 10-file working set limit` (from examples/copilot-limited-context.md)
- Example 2: `Working Set (8 files):` (from WORKAROUND-PATTERNS.md)
- Example 3: `each ≤10 files` (from WORKAROUND-PATTERNS.md)
- Example 4: `This exceeds the ideal 10-file limit` (from examples/copilot-limited-context.md)

## Transformation Notes
- **To Claude Code:** Remove limit references; no explicit working set constraint
- **To Windsurf:** Remove limit references; Windsurf handles larger context automatically
- Keep file counts for planning purposes but remove constraint language

---

# Construct: checkpoint-commit

## Description
Instructions for creating intermediate commits as checkpoints during multi-part operations. Enables rollback and verification between workflow phases.

## Source Platform
**github-copilot** - Pattern for multi-part workflow coordination

## Detection Pattern
```regex
(?i)(checkpoint|create\s+commit|Checkpoint\s*:|commit\s+after|Step\s+\d+:\s*Checkpoint|git\s+commit.*refactor|rollback\s+plan|checkpoint\s+commit)
```

## Examples
- Example 1: `Step 5: Checkpoint - Create commit: refactor(auth): part 1 - standardize core auth module` (from WORKAROUND-PATTERNS.md)
- Example 2: `Checkpoint Commits - Part 1: [commit hash]` (from examples/copilot-limited-context.md)
- Example 3: `Each batch creates checkpoint commit` (from WORKAROUND-PATTERNS.md)
- Example 4: `Rollback Plan: If integration issues discovered...` (from examples/copilot-limited-context.md)

## Transformation Notes
- Universal pattern; keep checkpoint instructions across all platforms
- Valuable for multi-step operations regardless of platform
- Adjust commit message conventions per project standards

---

# Construct: progress-tracking

## Description
References to tracking workflow progress across multi-part operations, including progress files, completion checklists, and status indicators.

## Source Platform
**github-copilot** - Pattern for multi-part workflow coordination

## Detection Pattern
```regex
(?i)(REFACTOR-PROGRESS\.md|Progress\s+Tracking|Completion\s+Checklist|\[\s*[xX ]?\s*\].*completed?|progress\s+file|track.*progress|current\s+part|Status:)
```

## Examples
- Example 1: `Create REFACTOR-PROGRESS.md to track completion` (from WORKAROUND-PATTERNS.md)
- Example 2: `Progress Tracking: - [ ] Part 1: Core module` (from examples/copilot-limited-context.md)
- Example 3: `Completion Checklist: - [ ] All 28 files refactored` (from examples/copilot-limited-context.md)
- Example 4: `Current part: [1/2/3/4]` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- Universal pattern; useful for complex operations on all platforms
- Keep checklist format for verification
- Consider platform-native alternatives (GitHub Issues, project management tools)

---

# Construct: workspace-command

## Description
References to the @workspace command for codebase-wide discovery and analysis, particularly in GitHub Copilot contexts.

## Source Platform
**github-copilot** - Native @workspace for codebase search

## Detection Pattern
```regex
(?i)(@workspace|@workspace\s+analyze|@workspace\s+find|@workspace\s+show|workspace\s+search|use\s+@workspace)
```

## Examples
- Example 1: `@workspace analyze database access patterns` (from examples/copilot-limited-context.md)
- Example 2: `@workspace find all files that import from src/database/` (from WORKAROUND-PATTERNS.md)
- Example 3: `Use @workspace when: - You need to SEARCH/ANALYZE many files` (from WORKAROUND-PATTERNS.md)
- Example 4: `@workspace for discovery, decomposition for implementation` (from examples/copilot-limited-context.md)

## Transformation Notes
- **To Claude Code:** Convert to Grep/Glob tool usage with explicit patterns
- **To Windsurf:** Use natural language search in Cascade or glob patterns
- Explain that @workspace is for discovery, not modification

---

# Construct: test-command

## Description
References to running tests, including npm test commands, verification steps, and test result expectations.

## Source Platform
**All platforms** - Universal pattern for test execution

## Detection Pattern
```regex
(?i)(npm\s+test|npm\s+run\s+test|run\s+tests?|test\s+suite|verify.*tests?|tests?\s+pass|pytest|jest|mocha|vitest)
```

## Examples
- Example 1: `Run tests: npm test src/auth/` (from WORKAROUND-PATTERNS.md)
- Example 2: `npm run test:integration` (from examples/copilot-limited-context.md)
- Example 3: `Ensure all tests pass` (from examples/workflow-example.md)
- Example 4: `npm test` (from examples/skill-example.md)

## Transformation Notes
- Universal pattern; keep test commands across all platforms
- Adjust test runner syntax per project configuration
- No platform-specific transformation needed

---

# Construct: advisory-warning

## Description
Explicit warnings about platform limitations, advisory-only restrictions, or features that cannot be enforced on the target platform.

## Source Platform
**windsurf** / **github-copilot** - Platforms lacking Claude Code's enforcement

## Detection Pattern
```regex
(?i)(NOTE:.*not\s+enforced|advisory\s+only|rely\s+on\s+AI\s+compliance|cannot\s+be\s+enforced|IMPORTANT:.*restrictions|WARNING:.*limitations?|emulated|simulated|not\s+supported)
```

## Examples
- Example 1: `NOTE: These restrictions rely on AI compliance and are NOT enforced by Windsurf` (from WORKAROUND-PATTERNS.md)
- Example 2: `Advisory Restrictions - Document tool/permission restrictions (not enforced)` (from WORKAROUND-PATTERNS.md)
- Example 3: `Subagent spawning not supported` (from transformation notes)
- Example 4: `context: fork can only be simulated` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- Generate appropriate advisory warnings when transforming TO less-capable platforms
- Remove advisory warnings when transforming TO Claude Code (native support)
- Always preserve semantic intent while clarifying enforcement level

---

# Construct: version-comment

## Description
HTML-style version comments embedded in markdown content for tracking skill/workflow versions when frontmatter version field is not available.

## Source Platform
**windsurf** - Pattern for version tracking in adapted workflows

## Detection Pattern
```regex
<!--\s*Version:\s*[\d.]+\s*-->|<!--\s*Part\s+\d+\s+of\s+\d+|<!--\s*Adapted\s+from
```

## Examples
- Example 1: `<!-- Version: 1.0.0 -->` (from WORKAROUND-PATTERNS.md)
- Example 2: `<!-- Part 1 of 4: Core Authentication Module -->` (from WORKAROUND-PATTERNS.md)
- Example 3: `<!-- Adapted from Claude Code skill -->` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- **To Claude Code:** Extract to `version:` frontmatter field
- **To Windsurf:** Keep as HTML comments (no version frontmatter field)
- **To Copilot:** Keep as HTML comments for documentation

---

# Construct: execution-flow-section

## Description
Detailed step-by-step execution traces documenting how a skill/workflow should execute, including intermediate states and verification points.

## Source Platform
**All platforms** - Documentation pattern for complex workflows

## Detection Pattern
```regex
(?i)(Execution\s+Flow|Step-by-Step\s+Execution|Manual\s+Traceability|Intermediate\s+State|Verification\s+Points)
```

## Examples
- Example 1: `Execution Flow: How Windsurf Processes the Emulated Skill` (from WORKAROUND-PATTERNS.md)
- Example 2: `Step-by-Step Execution Trace` (from examples/workflow-example.md)
- Example 3: `Intermediate State After Step 0:` (from examples/workflow-example.md)
- Example 4: `Verification Points: - Before: file exists - During: AI mentions following workflow` (from WORKAROUND-PATTERNS.md)

## Transformation Notes
- Universal documentation pattern; keep across all platforms
- Update platform-specific references (Windsurf/Cascade, Claude Code, Copilot)
- Valuable for debugging and verification regardless of platform

---

## Detection Implementation Notes

### Priority Order
When detecting constructs, process in this order to avoid false positives:
1. Skip fenced code blocks (```...```)
2. Skip inline code (`...`)
3. Skip frontmatter section (---...---)
4. Apply construct detection patterns

### Overlap Handling
Some constructs may overlap. Apply these precedence rules:
1. `tool-call` takes precedence over generic word matches
2. `model-decision-trigger` takes precedence for "USE WHEN" phrases
3. `activation-instruction` takes precedence over generic slash commands

### Code Block Detection
```regex
```[\s\S]*?```|`[^`]+`
```
Use this pattern to identify and skip code blocks before applying construct detection.

---

## Transformation Matrix

| Construct | Claude Code | Windsurf | GitHub Copilot |
|-----------|-------------|----------|----------------|
| agent-spawn | Native (Task tool) | Advisory note (not supported) | Advisory note (not supported) |
| tool-call | Native (specific tools) | Rephrase as actions | Generic recommendations |
| context-switch | Native (fork/inherit) | Note (no isolation) | Remove references |
| permission-reference | Native (enforced) | Advisory section | Operational constraints section |
| model-decision-trigger | Rich description + manual | Native (trigger: model_decision) | When to use section |
| glob-pattern | Step 0 context gathering | Native (globs:) | applyTo + working set notes |
| persona-rule | agent: frontmatter | @rules: activation | Inline persona section |
| skill-chaining | /skill-name | /workflow-name | /prompt name |
| context-gathering-protocol | Keep (emulation pattern) | Remove (automatic) | Keep (limited files) |
| activation-instruction | /skill-name | /workflow-name | /prompt name or file |
| working-set-limit | Remove | Remove | Keep (platform constraint) |
| checkpoint-commit | Keep | Keep | Keep |
| progress-tracking | Keep | Keep | Keep |
| workspace-command | Convert to Glob/Grep | Natural language | Native @workspace |
| test-command | Keep | Keep | Keep |
| advisory-warning | Remove (native support) | Keep | Keep |
| version-comment | Extract to frontmatter | Keep as comment | Keep as comment |
| execution-flow-section | Keep | Keep | Keep |

---

## Cross-References

- **WORKAROUND-PATTERNS.md** - Source patterns for skill/workflow emulation
- **RESEARCH-claude-code.md** - Claude Code native capabilities
- **RESEARCH-windsurf.md** - Windsurf native capabilities
- **examples/skill-example.md** - Cross-platform skill format
- **examples/workflow-example.md** - Workflow emulation example
- **examples/copilot-limited-context.md** - Working set limitation pattern
- **STANDARD-SCHEMA.md** - Frontmatter field definitions (Phase 4)

---

## Summary

**Total Constructs Documented:** 18

**Required Constructs Coverage:**
1. agent-spawn - Covered
2. tool-call - Covered
3. context-switch - Covered
4. permission-reference - Covered
5. model-decision-trigger - Covered
6. glob-pattern - Covered
7. persona-rule - Covered
8. skill-chaining - Covered
9. context-gathering-protocol - Covered
10. activation-instruction - Covered

**Additional Constructs Discovered:**
11. working-set-limit - GitHub Copilot constraint references
12. checkpoint-commit - Multi-part operation checkpoints
13. progress-tracking - Workflow progress documentation
14. workspace-command - @workspace codebase search
15. test-command - Test execution references
16. advisory-warning - Platform limitation warnings
17. version-comment - HTML version tracking comments
18. execution-flow-section - Step-by-step execution documentation
