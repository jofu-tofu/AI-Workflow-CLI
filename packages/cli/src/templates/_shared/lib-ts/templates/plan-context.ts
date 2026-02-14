/**
 * Plan context templates for add_plan_context hook.
 * See SPEC.md §13.6
 */

export function getEvaluationContextReminder(): string {
  return `## CRITICAL: Write This Plan for a Different Agent

The agent executing this plan has ZERO context from this conversation — no chat history, no memory of files you explored or research you did.

**Write as if YOU are that agent. What would you need?**

### Required Structure

\`\`\`
# Plan: <descriptive title>

## Background
Why this change is needed (2-3 sentences)

## Task
What exactly to build/change

## Files
**Modify:**
- \`exact/path/to/file.py\` - What changes (reference line numbers or patterns)

**Reference:**
- \`exact/path/to/reference.py\` - Why relevant (e.g., "pattern to follow at lines 12-30")

## Steps

Review the skills available in system-reminder messages. As you write each step, consider which skills the implementation agent should invoke and mention them inline.

**Format:** "Step X: [action description] — Use \\\`skill-name\\\` for [specific purpose]"

**Example:**
- Step 3: Update component logic — Use \\\`TypeScript\\\` skill for type-safe error handling patterns
- Step 5: Verify UI changes — Use \\\`Browser\\\` skill to screenshot before/after and confirm styling

Numbered steps with specific details (integrate relevant skills inline):
1. [Specific steps with function names, patterns, or code snippets]
2. [Enough detail for someone who never saw this conversation]

## Constraints
- Technical requirements, preferences, or limitations

## Verification

Describe how to test the changes end-to-end. Mention skills that should be invoked for verification (Browser for UI testing, System:integrity_check for codebase validation, etc.).

**Format:** "Test X: [what to verify] — Use \\\`skill-name\\\` to [how to verify]"

**Example:**
- Test 2: Verify accessibility — Use \\\`AccessibleUI\\\` skill to check WCAG compliance
- Test 3: Visual regression — Use \\\`Browser\\\` skill to capture screenshots and compare

## Documentation
Decisions not written down are lost when this session ends. Update the nearest CLAUDE.md and MEMORY.md so the next session inherits what you learned.

**CLAUDE.md** (nearest to changed code — cascades to subdirectories):
- \`exact/path/to/CLAUDE.md\` — What to document

**What to write:**
- Architectural choices and why alternatives were rejected
- Non-obvious constraints (what breaks if this changes)
- Workarounds with context on the underlying issue
- Patterns that prevent future mistakes

**Format:** \`## Topic\` / \`**Decision:** ...\` / \`**Rationale:** ...\`

**MEMORY.md** (cross-session learning for the AI agent):
- Insight that would prevent a future mistake (e.g., "hook X silently drops field Y")

**Include when:** Architectural decisions, non-obvious constraints, workarounds, or patterns discovered during implementation.
**Omit entries for:** Routine changes with no decisions (rename, formatting, dependency bump).
When in doubt, write it — a lean entry is better than a lost decision.
\`\`\`

### Self-Check
- [ ] Could I execute this if I forgot our entire conversation?
- [ ] Are file paths exact (not "the auth file")?
- [ ] Are implementation details specific (not "use the approach we discussed")?
- [ ] Do documentation entries capture decisions the next session would otherwise lose?
- [ ] Are relevant skills mentioned inline where they should be invoked?`;
}
