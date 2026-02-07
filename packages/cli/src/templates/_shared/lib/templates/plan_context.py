"""Plan context templates for add_plan_context hook.

Provides standardized templates for:
- Evaluation context reminder (injected on plan writes)
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
