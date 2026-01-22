# Fresh Perspective Workflow

## Purpose

Combat **code bias**—the tendency to anchor problem-solving to existing patterns when you can see the current implementation. This workflow provides an unbiased perspective by:

1. Extracting only the essential problem context (stripping implementation details)
2. Sending that abstracted context to an agent with NO file access
3. Receiving first-principles analysis unclouded by "how it's currently done"

## When to Use

- When you feel stuck going in circles
- Before starting a large implementation (sanity check)
- When incremental fixes aren't working
- When you suspect you might be over-engineering
- When you want validation of your approach from a fresh viewpoint

## Process

### Step 1: Explain the Code Bias Problem

Before extracting context, briefly explain to the user:

> **Why Fresh Perspective?**
>
> When we see existing code, we unconsciously anchor to current patterns. This makes us likely to propose incremental improvements rather than potentially better approaches. The Fresh Perspective agent has NO access to your codebase—it can only see an abstracted problem description. This intentional blindness helps surface solutions you might not consider because you're "too close" to the current implementation.

### Step 2: Extract Context (Using context-extractor Agent)

Invoke the `context-extractor` agent (model: haiku, tools: none) to extract abstracted context from the recent conversation.

**Prompt for context-extractor:**
```
Review the conversation context and extract the following into JSON format:
- problem: What is being solved (abstract, no code references)
- stack: Technologies and frameworks in use
- constraints: Hard constraints that cannot change
- success_criteria: How success will be measured

Strip all implementation details, file names, function names, and code snippets.
Preserve only the problem essence.
```

### Step 3: User Reviews Extracted Context

Present the extracted context to the user using AskUserQuestion:

**Header:** "Context Check"
**Question:** "Here's the abstracted context I'll send to the Fresh Perspective agent. Would you like to edit it before proceeding?"
**Options:**
- "Looks good, proceed" — Description: "Send this context as-is"
- "Let me edit it" — Description: "I'll provide corrections or additions"

Display the extracted JSON so the user can see exactly what will be sent:

```
Extracted Context:
─────────────────
Problem: [extracted problem]
Stack: [extracted stack]
Constraints: [extracted constraints]
Success Criteria: [extracted success_criteria]
```

If user chooses to edit, use AskUserQuestion to gather their corrections.

### Step 4: Invoke Fresh Perspective Agent

Invoke the `fresh-perspective` agent (model: sonnet, tools: none) with ONLY the reviewed context.

**Critical:** The fresh-perspective agent has `tools: ""` which means it cannot read any files. This is intentional—do not attempt to provide additional context.

**Prompt for fresh-perspective:**
```
Analyze this problem from first principles and provide your perspective:

{reviewed_context_json}

Remember: You have NO access to the codebase. Approach this as if designing from scratch.
Provide structured output with: Understanding, Proposed Approach, Key Design Decisions,
Suggested Patterns, Questions to Consider, and Comparison Points.
```

### Step 5: Display Advisory Output

Present the Fresh Perspective analysis with a clear disclaimer:

```markdown
# Fresh Perspective Analysis

> **Advisory Only:** This analysis was generated without seeing your code.
> Use your judgment on what applies to your specific situation.

[Agent's structured output here]

---

**Next Steps:**
- Compare these suggestions against your current implementation
- Consider the questions raised before proceeding
- Decide which insights apply to your specific context
```

### Step 6: Save Artifact

Write the analysis to: `_output/cc-native/fresh-perspective/{YYYY-MM-DD}/{HHmmss}-analysis.md`

Include:
- Timestamp
- Extracted context (what was sent)
- Full agent response
- User's original problem description (if different from extracted)

## Output Files

All artifacts go to `_output/cc-native/fresh-perspective/`:
- `{date}/{timestamp}-analysis.md` — Complete analysis record

## Success Criteria

- [ ] Context was successfully abstracted (no code references leaked)
- [ ] User reviewed and approved the context before agent invocation
- [ ] Fresh Perspective agent provided structured analysis
- [ ] Output clearly marked as advisory
- [ ] Artifact saved for future reference

## Relationship with Other Workflows

| Workflow | When | Focus |
|----------|------|-------|
| **Fresh Perspective** | When stuck, before big implementations | Alternative approaches, first principles |
| Skeptic Review | During plan review | Problem-solution alignment, assumptions |
| Plan Review | After writing plan | Quality, completeness, issues |
