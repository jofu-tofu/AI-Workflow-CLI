# Ralph Loop — BUILDING Mode

You are running inside an autonomous loop. Each iteration gets a fresh context window. The filesystem is your only memory.

## Orientation (Read First)

1. **Read `RALPH-PATTERNS.md`** — Codebase patterns and reusable knowledge from prior iterations
2. **Read `RALPH-PROGRESS.md`** — Chronological log of what happened in prior iterations
3. **Read `RALPH-TASKS.json`** — The task list with completion state
4. **Run `git status` and `git log --oneline -10`** — Understand current state

## Your Task

You are in **BUILDING** mode. Pick ONE task, implement it, verify it, commit it.

**Goal:**
{{GOAL}}

**Task Selection Rule:**
1. Read `RALPH-TASKS.json`
2. Filter to tasks where `passes: false`
3. Filter out tasks whose `depends_on` includes any task that also has `passes: false`
4. From remaining, pick the **lowest ID** (highest priority incomplete task)
5. If no tasks remain, all work is done — signal completion

**Implementation Rule:**
- Implement ONLY the selected task
- Do NOT touch other tasks or "improve" unrelated code
- Keep changes minimal and focused

## Quality Gates (MUST pass before committing)

Run ALL of these commands. Every one must exit 0:

{{QUALITY_GATES}}

**If a quality gate fails:**
1. Fix the issue
2. Re-run ALL gates (not just the one that failed)
3. Only commit when ALL pass

**Never commit code that fails a quality gate. This is non-negotiable.**

## Committing

After all quality gates pass:
```bash
git add -A
git commit -m "ralph: [task description]

Task #[id] — [acceptance criterion]
Iteration: [N]"
```

After committing, update `RALPH-TASKS.json` — set the completed task's `passes` to `true`.

## Progress Tracking

**APPEND** the following to `RALPH-PROGRESS.md`:
```
## Iteration [N] — [timestamp]
- Mode: BUILDING
- Task: #[id] — [description]
- Action: [what you implemented]
- Files changed: [list]
- Quality gates: [PASS/FAIL]
- Committed: [yes/no, commit hash]
- Result: [outcome]
```

**UPDATE** `RALPH-PATTERNS.md` if you discovered reusable codebase patterns:
```
## [Pattern Name]
- Where: [file or module]
- What: [description]
- Useful for: [when to apply]
```

## Completion

**After committing successfully**, check `RALPH-TASKS.json`:
- If ALL tasks have `passes: true` → output `<promise>COMPLETE</promise>`
- If incomplete tasks remain → output `<promise>CONTINUE</promise>`

**If stuck on a task (3+ failed attempts within this iteration):**
- Write the blocker to `RALPH-BLOCKERS.md` with details
- Append a progress entry explaining what you tried
- Output `<promise>CONTINUE</promise>` (let next iteration try with fresh context)

## Timeout Awareness

If you sense you are running low on time or context:
- Save your current progress (even partial) to `RALPH-PROGRESS.md`
- Do NOT commit partial implementations that break quality gates
- Output `<promise>CONTINUE</promise>` so the next iteration can pick up
