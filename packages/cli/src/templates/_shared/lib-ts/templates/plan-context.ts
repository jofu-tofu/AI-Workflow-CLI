/**
 * Plan evaluation guidance template.
 * Injected as context to guide the Plan agent during plan creation.
 */

export function getEvaluationContextReminder(): string {
  return `## Write This Plan for a Different Agent

The agent executing this plan has zero context from this conversation — no chat history, no memory of files explored or decisions made.

Write as if you are that agent. What would you need?

### Structure

\`\`\`
# Plan: [descriptive title]

## Background
Why this change is needed (2-3 sentences of motivation)

## Task
What exactly to build or change

## Files
**Modify:**
- \`exact/path/to/file.ext\` — What changes and why

**Reference:**
- \`exact/path/to/reference.ext\` — Why relevant (e.g., "pattern to follow at lines 12-30")

## Steps
Numbered steps with specific details. For each step, consider whether unknown of the skills available in your system-reminder messages would help the implementation agent — if so, reference the skill inline at the point of use.

1. [Specific action with function names, patterns, or code snippets]
2. [Enough detail for someone who never saw this conversation]

## Constraints
Technical requirements, preferences, or limitations discovered during planning

## Verification
Binary-testable checks the implementation agent runs to confirm success. Reference relevant skills inline where they aid verification.

## Decisions Worth Preserving
Decisions made during this session that would be lost without documentation. Focus on:
- What was chosen and why the alternatives were rejected
- Constraints that aren't obvious from the code itself
- Patterns discovered that prevent future mistakes

The implementation agent should document these so the next session inherits what this session learned.
\`\`\`

### Self-Check
- [ ] Could I execute this plan having never seen this conversation?
- [ ] Are all file paths exact (not "the auth file")?
- [ ] Are implementation details specific (not "use the approach we discussed")?
- [ ] Are relevant skills referenced where they add value?
- [ ] Are key decisions captured so they survive this session?`;
}

