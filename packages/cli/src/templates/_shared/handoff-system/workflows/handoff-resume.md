# Resume Handoff Workflow

## Purpose

Restore session context from a handoff document programmatically, then create actionable ISC tasks so work continues without re-discovering what was already learned.

## Arguments

- `$ARGUMENTS` - Optional path to a handoff folder or index.md. If omitted, auto-discovers the most recent handoff from the active context.

## Process

### Step 1: Gather Context via Script

Run the resume script to collect and format all handoff sections:

**If `$ARGUMENTS` is provided:**
```bash
bun .aiwcli/_shared/handoff-system/scripts/resume_handoff.ts "$ARGUMENTS"
```

**If `$ARGUMENTS` is empty:**
The script auto-discovers the active context ID programmatically — no manual lookup needed:
```bash
bun .aiwcli/_shared/handoff-system/scripts/resume_handoff.ts
```

Present the script's output to the conversation. The output is already structured in priority order (dead ends first, then pending items, decisions, git delta, completed work, context notes).

If the script exits with an error, show the error message and stop.

### Step 2: Create ISC Tasks

Convert each actionable item from the script output into a task via `TaskCreate`:
- Each pending issue from the **Pending Items** section
- Each remaining plan item from the **Plan — Remaining Items** section

Each task follows ISC format — ~8 words, states a desired end-state (not an action), and is binary testable in 2 seconds.

**Example:**

| Source | ISC Task |
|--------|----------|
| Pending: "Fix race condition in SessionStore" | "SessionStore handles concurrent access without race conditions" |
| Plan remaining: "Add retry logic to API client" | "API client retries failed requests with exponential backoff" |
| Next step: "Write tests for auth flow" | "Auth flow has passing integration test coverage" |

### Step 3: Confirm Ready

After creating tasks, run `TaskList` and confirm ready to continue.

## Constraints

- Dead ends are presented verbatim from the script output — never summarize or omit entries
- ISC tasks use ~8-word end-state format, not action descriptions
- Skip missing files gracefully (the script handles this)
- If the script warns about staleness (>7 days), surface the warning prominently

## Success Criteria

- [ ] Script ran successfully and output the structured briefing
- [ ] Dead ends visible in conversation (not summarized)
- [ ] Pending items converted to ISC tasks via TaskCreate
- [ ] Plan completion percentage visible (if plan exists)
- [ ] Git delta visible
- [ ] Tasks confirmed via TaskList
