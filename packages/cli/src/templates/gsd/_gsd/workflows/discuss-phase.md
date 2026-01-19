# GSD Workflow: Discuss Phase

## Purpose

Capture pre-planning decisions, clarify ambiguities, and resolve gray areas before detailed task planning. This workflow ensures shared understanding between user and AI before execution begins.

## Overview

Use this workflow BEFORE `/gsd:plan-phase` when:
- Phase scope has ambiguities
- Design decisions need clarification
- Technical approach is unclear
- User preferences matter for implementation

**Output:** `_output/gsd/.planning/CONTEXT.md` with captured decisions for the phase.

## Prerequisites

- `_output/gsd/.planning/ROADMAP.md` exists with defined phases
- Phase number specified by user
- Project context established via `/gsd:new-project`

## Process

### Step 1: Phase Validation

1. Read `_output/gsd/.planning/ROADMAP.md`
2. Verify requested phase exists
3. Check phase status (should be ⏳ Pending or ready to start)
4. Load phase description and high-level tasks

```markdown
## Phase {N}: {Phase Name}

**Description:** {From ROADMAP.md}

**High-Level Tasks:**
- Task 1
- Task 2
- Task 3

**Verification Criteria:**
- Criterion 1
- Criterion 2
```

### Step 2: Identify Gray Areas

Analyze the phase for ambiguities that need resolution before planning.

**Gray Area Categories:**

#### Visual/UI Decisions
Questions about appearance, layout, user experience:
- What should {component} look like?
- What colors/styles should be used?
- How should {feature} be displayed?
- What feedback should users see?
- Mobile vs desktop behavior?

#### API/Data Decisions
Questions about data handling, integrations, backend:
- Where should this data come from?
- How should errors be handled?
- What format should responses use?
- Should this be cached? How long?
- Rate limiting or pagination needed?

#### Content/Copy Decisions
Questions about text, messaging, labels:
- What should error messages say?
- What labels should buttons have?
- How formal should the tone be?
- What placeholder text to use?
- Success/failure message wording?

#### Organization/Structure Decisions
Questions about code architecture, file organization:
- Where should this component live?
- Should this be a shared utility?
- How should this be tested?
- What naming conventions to follow?
- How to handle configuration?

### Step 3: Question Generation

For each gray area identified, generate focused questions.

**Question Format:**
```markdown
### {Category}: {Topic}

**Context:** {Why this matters}

**Options:**
1. {Option A} - {Pros/Cons}
2. {Option B} - {Pros/Cons}
3. Custom: [User specifies]

**Recommendation:** {If there's a clear best practice}

**Your preference?**
```

**Prioritize Questions By:**
1. Blockers - Must be decided before any planning
2. High Impact - Affects multiple tasks
3. Preference - User taste, no wrong answer
4. Deferrable - Can decide during execution

### Step 4: Decision Capture Loop

Present questions to user one category at a time.

**Process:**
```markdown
## Visual/UI Decisions

{Question 1}
→ User response: {captured}
→ Decision recorded: {summarized decision}

{Question 2}
→ User response: {captured}
→ Decision recorded: {summarized decision}

---

## API/Data Decisions

{Question 3}
...
```

**For Each Decision:**
1. Present the question clearly
2. Wait for user response
3. Confirm understanding: "So we'll do {X}, correct?"
4. Record the decision with rationale

**If User is Uncertain:**
- Provide best practice recommendation
- Explain trade-offs
- Offer to defer (mark as "TBD - decide during execution")

### Step 5: Assumptions Capture

Document assumptions made during discussion.

**Process:**
1. List assumptions discovered
2. Note impact if assumption is wrong
3. Identify how to validate assumptions
4. Mark which assumptions need user confirmation

```markdown
## Assumptions

1. **We assume:** {assumption}
   - **Impact if wrong:** {consequence}
   - **Validation:** {how to verify}
   - **Status:** ✅ Confirmed / ⚠️ Unverified

2. **We assume:** {assumption}
   ...
```

### Step 6: Generate CONTEXT.md

Create or update `_output/gsd/.planning/CONTEXT.md` using `_gsd/templates/CONTEXT.md.template`:

1. Find or create `_output/gsd/.planning/CONTEXT.md`
2. Add section for Phase {N}
3. Record all decisions by category
4. Document assumptions
5. Note any deferred decisions

**Structure:**
```markdown
## Phase {N}: {Phase Name}

### Discussion Summary
**Date:** {Date}
**Participants:** User, AI Assistant

### Decisions Made

#### Visual/UI
| Question | Decision | Rationale |
|----------|----------|-----------|
| {Q1} | {Decision} | {Why} |

#### API/Data
| Question | Decision | Rationale |
|----------|----------|-----------|
| {Q2} | {Decision} | {Why} |

#### Content/Copy
...

#### Organization/Structure
...

### Assumptions
{List with impact and validation}

### Deferred Decisions
{Items to decide during execution}

### Out of Scope (This Phase)
{Explicitly excluded items}
```

### Step 7: Update STATE.md

Record discussion completion:

```markdown
## Key Decisions

### Phase {N} Discussion Complete
- **Date:** {Date}
- **Decisions Made:** {Count}
- **Assumptions Documented:** {Count}
- **Deferred:** {Count}
- **See:** _output/gsd/.planning/CONTEXT.md for details
```

### Step 8: Confirmation

Present summary to user:

```markdown
## Discussion Summary - Phase {N}

### Decisions Captured

| Category | Decisions |
|----------|-----------|
| Visual/UI | {count} |
| API/Data | {count} |
| Content/Copy | {count} |
| Organization | {count} |
| **Total** | {total} |

### Assumptions: {count}
### Deferred: {count}

### Files Updated
- `_output/gsd/.planning/CONTEXT.md` - Decisions recorded
- `_output/gsd/.planning/STATE.md` - Status updated

### Ready for Planning?

All ambiguities for Phase {N} have been discussed.

**Next Step:** Run `/gsd:plan-phase {N}` to create detailed execution plan.

The plan will use these decisions as constraints.
```

## Output Files

- `_output/gsd/.planning/CONTEXT.md` - Decisions for the phase
- Updated `_output/gsd/.planning/STATE.md` - Discussion noted

## Next Steps

After discussion completes:
1. **Run `/gsd:plan-phase {N}`** - Create detailed task plan
2. Planning will load CONTEXT.md decisions as constraints

## Success Criteria

- [ ] Phase validated and loaded
- [ ] Gray areas identified by category
- [ ] Questions presented clearly
- [ ] All decisions captured with rationale
- [ ] Assumptions documented
- [ ] CONTEXT.md created/updated
- [ ] STATE.md updated
- [ ] User confirms completeness
- [ ] Ready for plan-phase

## Notes

**When to Skip discuss-phase:**
- Simple, well-defined phases
- Familiar patterns (CRUD, standard UI)
- User has already specified all details
- Time pressure (discuss during execution instead)

**When discuss-phase is Critical:**
- User-facing features
- Integration with external systems
- Design-sensitive work
- Multiple valid approaches
- First time using a pattern

**Question Best Practices:**
- Keep questions focused and specific
- Provide concrete options when possible
- Explain trade-offs objectively
- Accept "I don't know - you decide" as valid
- Don't over-question obvious things

**Deferred Decisions:**
- It's OK to not decide everything upfront
- Mark as "TBD" with context
- Will be resolved during execution
- Update CONTEXT.md when decided later
