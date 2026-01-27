"""Plan context templates for add_plan_context hook.

Provides standardized templates for:
- Evaluation context reminder
- Clarifying questions offer
"""


def get_evaluation_context_reminder() -> str:
    """Get the plan evaluation context reminder template.

    Returns:
        Formatted markdown reminder about adding evaluation context
    """
    return """
## IMPORTANT: This Plan Will Be Executed in a Fresh Context

Your plan will be:
1. **Reviewed** by agents who have NO access to this conversation
2. **Executed** by a Claude agent starting with a completely fresh context

The implementing agent won't have access to your research, file explorations, or any conversation history. Your plan must be **self-contained** and provide everything needed to execute it successfully.

### Required Plan Elements

1. **A title line** at the very top: `# Plan: <descriptive title>`

2. **Context Section** near the top with:
   - **Background**: The bigger picture - why this change is needed and what problem it solves
   - **Task**: What is being built/changed (specific and actionable)
   - **Goal**: The underlying problem the user wants solved
   - **Constraints**: Technical requirements, preferences, or limitations mentioned

3. **Relevant Files** section listing:
   - Files that will be modified (with brief description of what changes)
   - Files to reference for patterns/context (with why they're relevant)
   - Any configuration files that matter

4. **Implementation Details** that are explicit enough for someone unfamiliar with your research:
   - Don't assume the implementer knows what you discovered
   - Include specific function names, patterns, or approaches to use
   - Reference line numbers or code snippets if helpful

### Example

```markdown
# Plan: Add OAuth2 Authentication

## Context
**Background**: The app currently only supports username/password auth. Users have requested social login to reduce friction during signup.
**Task**: Implement OAuth2 flow for user authentication
**Goal**: Enable secure third-party authentication via Google and GitHub
**Constraints**: Must integrate with existing session management; no new dependencies preferred

## Relevant Files
**Modify:**
- `src/auth/middleware.ts` - Add OAuth callback handlers
- `src/routes/auth.ts` - Add OAuth routes

**Reference for patterns:**
- `src/auth/password.ts` - Shows existing auth flow pattern
- `src/config/index.ts` - Where to add OAuth credentials

## Implementation Steps
[Detailed steps here...]
```

This context allows reviewers to assess whether your plan addresses the user's needs, AND enables the implementing agent to execute it without needing to re-discover your research.
""".strip()


def get_questions_offer_template() -> str:
    """Get the clarifying questions offer template.

    Returns:
        Formatted markdown prompt for offering clarifying questions
    """
    return """
## First Plan Write - Optional Clarifying Questions

Your initial plan has been saved. Before finalizing, ask the user if they'd like to answer clarifying questions to refine it.

**Use AskUserQuestion now with this question:**

Header: "Questions?"
Question: "I've drafted an initial plan. Would you like to answer a few clarifying questions so I can refine it?"
Options:
- "Yes, ask me questions" (description: "I'll interview you about technical details, constraints, and preferences, then update the plan")
- "No, proceed as-is" (description: "Skip questions and proceed with the current plan")

### If user chooses YES - Interview them about:

1. **Technical Implementation**
   - Preferred approaches or patterns?
   - Technologies/libraries to use or avoid?
   - Performance or scalability requirements?

2. **Constraints & Requirements**
   - Hard constraints that must be respected?
   - Deadlines or scope limitations?
   - Dependencies on other systems?

3. **Edge Cases & Concerns**
   - Known edge cases to handle?
   - Security or privacy considerations?
   - Error handling preferences?

4. **Tradeoffs**
   - Speed vs. quality preferences?
   - Simplicity vs. flexibility?
   - What's acceptable to defer to later?

Ask focused, **non-obvious** questions using AskUserQuestion (max 12). Questions should surface hidden constraints, unstated assumptions, or preferences that aren't evident from the original request - things that would meaningfully change the plan.

After gathering answers, **update the plan file** with the refined content before calling ExitPlanMode.

### If user chooses NO:
Proceed directly to ExitPlanMode with the current plan.
""".strip()
