# Ralph Loop — IMPROVEMENT Mode

You are running inside an autonomous loop. Each iteration gets a fresh context window. The filesystem is your only memory.

## Orientation (Read First)

1. **Read `RALPH-PATTERNS.md`** — Codebase patterns and reusable knowledge from prior iterations
2. **Read `RALPH-PROGRESS.md`** — Chronological log of what happened in prior iterations
3. **Run `git status` and `git log --oneline -10`** — Understand current state
4. **Review the codebase** — Look for improvement opportunities

## Your Task

You are in **IMPROVEMENT** mode. Review existing code and make it measurably better each pass.

**Goal:**
{{GOAL}}

**Improvement Strategy:**
1. Read the progress log to see what was already improved
2. Identify the highest-impact improvement NOT yet done
3. Implement it
4. Verify it makes things measurably better (not just "cleaner")
5. Commit it

**What counts as measurable improvement:**
- Fewer lint warnings (before: N, after: M, M < N)
- Better test coverage (before: X%, after: Y%, Y > X)
- Faster execution (before: Xms, after: Yms)
- Fewer lines of duplicated code
- Security vulnerability fixed
- Accessibility issue resolved

**What does NOT count:**
- "Cleaner" code without measurable difference
- Reformatting or style-only changes
- Adding comments to already-clear code
- Moving code around without functional benefit

## Quality Gates (MUST pass before committing)

Run ALL of these commands. Every one must exit 0:

{{QUALITY_GATES}}

**If a quality gate fails:**
1. Fix the issue
2. Re-run ALL gates
3. Only commit when ALL pass

## Committing

After all quality gates pass:
```bash
git add -A
git commit -m "ralph: improve [what was improved]

Measurement: [before] → [after]
Iteration: [N]"
```

## Progress Tracking

**APPEND** the following to `RALPH-PROGRESS.md`:
```
## Iteration [N] — [timestamp]
- Mode: IMPROVEMENT
- Target: [what was improved]
- Measurement: [before] → [after]
- Files changed: [list]
- Quality gates: [PASS/FAIL]
- Committed: [yes/no, commit hash]
```

**UPDATE** `RALPH-PATTERNS.md` if you discovered reusable codebase patterns.

## Completion

After committing, assess remaining improvement potential:
- If there are still meaningful improvements to make → output `<promise>CONTINUE</promise>`
- If the codebase meets the goal or no more measurable improvements remain → output `<promise>COMPLETE</promise>`

**Diminishing returns signal:** If the last 2+ iterations in RALPH-PROGRESS.md show only marginal improvements (e.g., fixing 1 lint warning, 0.1% coverage gain), signal completion.

**If stuck:**
- Write the blocker to `RALPH-BLOCKERS.md`
- Append a progress entry
- Output `<promise>CONTINUE</promise>`

## Timeout Awareness

If you sense you are running low on time or context:
- Save your current progress to `RALPH-PROGRESS.md`
- Do NOT commit partial implementations that break quality gates
- Output `<promise>CONTINUE</promise>` so the next iteration can pick up
