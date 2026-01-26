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
## IMPORTANT: Add Evaluation Context

Your plan will be reviewed by agents who have NO access to this conversation.
Before completing this plan, ensure it includes:

1. **A title line** at the very top: `# Plan: <descriptive title>`
2. **An Evaluation Context section** near the top with:
   - **Task**: What is being built/changed and why
   - **Goal**: The underlying problem the user wants solved
   - **Constraints**: Technical requirements, preferences, or limitations mentioned
   - **Codebase Context**: Important files, patterns, or architecture decisions

Example:
```markdown
# Plan: Add OAuth2 Authentication

## Evaluation Context
**Task**: Implement OAuth2 flow for user service
**Goal**: Enable secure third-party authentication
**Constraints**: Must support Google and GitHub providers
**Codebase Context**: Uses Express middleware pattern in src/auth/
```

This context allows reviewers to assess whether your plan actually addresses the user's needs—not just whether it's technically sound.
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

Ask 2-4 focused questions using AskUserQuestion. Don't ask obvious questions - focus on things that would meaningfully change the plan.

After gathering answers, **update the plan file** with the refined content before calling ExitPlanMode.

### If user chooses NO:
Proceed directly to ExitPlanMode with the current plan.
""".strip()
