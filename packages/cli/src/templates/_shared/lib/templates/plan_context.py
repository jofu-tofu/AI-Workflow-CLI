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

## Documentation
Decisions not written down are lost when this session ends. Update the nearest CLAUDE.md and MEMORY.md so the next session inherits what you learned.

**CLAUDE.md** (nearest to changed code — cascades to subdirectories):
- `exact/path/to/CLAUDE.md` — What to document

**What to write:**
- Architectural choices and why alternatives were rejected
- Non-obvious constraints (what breaks if this changes)
- Workarounds with context on the underlying issue
- Patterns that prevent future mistakes

**Format:** `## Topic` / `**Decision:** ...` / `**Rationale:** ...`

**MEMORY.md** (cross-session learning for the AI agent):
- Insight that would prevent a future mistake (e.g., "hook X silently drops field Y")

**Include when:** Architectural decisions, non-obvious constraints, workarounds, or patterns discovered during implementation.
**Omit entries for:** Routine changes with no decisions (rename, formatting, dependency bump).
When in doubt, write it — a lean entry is better than a lost decision.
```

### Self-Check
- [ ] Could I execute this if I forgot our entire conversation?
- [ ] Are file paths exact (not "the auth file")?
- [ ] Are implementation details specific (not "use the approach we discussed")?
- [ ] Do documentation entries capture decisions the next session would otherwise lose?
""".strip()
