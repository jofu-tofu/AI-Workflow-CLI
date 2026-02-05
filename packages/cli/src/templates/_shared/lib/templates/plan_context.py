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
## CRITICAL: Write This Plan for a Different Agent

The agent executing this plan has ZERO context from this conversation — no chat history, no memory of files you explored or research you did.

**Write as if YOU are that agent. What would you need?**

### Required Structure

```
# Plan: <descriptive title>

## Background
Why this change is needed (2-3 sentences)

## Task
What exactly to build/change

## Files
**Modify:**
- `exact/path/to/file.py` - What changes (reference line numbers or patterns)

**Reference:**
- `exact/path/to/reference.py` - Why relevant (e.g., "pattern to follow at lines 12-30")

## Steps
1. [Specific steps with function names, patterns, or code snippets]
2. [Enough detail for someone who never saw this conversation]

## Constraints
- Technical requirements, preferences, or limitations
```

### Self-Check
- [ ] Could I execute this if I forgot our entire conversation?
- [ ] Are file paths exact (not "the auth file")?
- [ ] Are implementation details specific (not "use the approach we discussed")?
""".strip()


def get_questions_offer_template() -> str:
    """Get the clarifying questions offer template.

    Uses persona-based questioning to surface hidden constraints.

    Returns:
        Formatted markdown prompt for offering clarifying questions
    """
    from .persona_questions import format_questions_for_prompt

    persona_questions = format_questions_for_prompt()

    return f"""
## First Plan Write - Optional Clarifying Questions

Your initial plan has been saved. Before finalizing, ask the user if they'd like to answer clarifying questions to refine it.

**Use AskUserQuestion now:**

Header: "Questions?"
Question: "I've drafted an initial plan. Would you like to answer a few clarifying questions from different perspectives so I can refine it?"
Options:
- "Yes, ask me questions" (description: "I'll ask targeted questions to surface hidden constraints, then update the plan")
- "No, proceed as-is" (description: "Skip questions and proceed with the current plan")

### If user chooses YES:

{persona_questions}

After gathering answers, **update the plan file** with refined content before calling ExitPlanMode.

### If user chooses NO:
Proceed directly to ExitPlanMode with the current plan.
""".strip()
