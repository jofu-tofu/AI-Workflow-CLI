# Ralph Wiggum Loop Workflow

## Purpose

Run an autonomous coding loop where each iteration gets a fresh Claude Code context window. The filesystem and git are the only memory bridge between iterations. The orchestrator manages the entire lifecycle — the user never leaves Claude Code.

## When to Use

- Implementing a feature that can be decomposed into small, independent tasks
- Running improvement passes (lint cleanup, test coverage, refactoring) across a codebase
- Planning/gap analysis that benefits from iterative exploration
- Any task where context window degradation is the bottleneck

## Process

### Step 1: INTAKE

Gather requirements from the user.

**Ask via AskUserQuestion:**

1. **"What should Ralph work on?"**
   - Header: "Goal"
   - Options: (free text — user selects "Other" and types their goal)

2. **"Which mode should Ralph use?"**
   - Header: "Mode"
   - Options:
     - "PLANNING" — "Gap analysis only. Produces a prioritized task list, no implementation."
     - "BUILDING" — "Pick a task, implement, verify, commit. One task per iteration."
     - "IMPROVEMENT" — "Review existing code, make it measurably better each pass."

3. **"What quality gate commands should pass before each commit?"**
   - Header: "Quality Gates"
   - Options:
     - "npm test" — "Run the project's test suite"
     - "npm run lint" — "Run linting checks"
     - "npm run build" — "Verify the project builds"
   - multiSelect: true
   - (User can select "Other" to specify custom commands like `pytest`, `cargo test`, etc.)

4. **"How many iterations maximum?"**
   - Header: "Max Iterations"
   - Options:
     - "5" — "Quick pass, good for small tasks"
     - "10 (Recommended)" — "Standard run, good for most tasks"
     - "20" — "Extended run for larger goals"
     - "30" — "Long run, use for comprehensive improvement passes"

**Cost warning:** After gathering inputs, inform the user:
> Each iteration costs approximately $2-5 in API usage. At {{iterations}} iterations, estimated total: ${{min}}-${{max}}.

### Step 2: PRE-FLIGHT

Verify everything needed for the loop to work.

**Checks (run each via Bash tool):**

1. **Claude CLI exists:**
   ```bash
   which claude || where claude
   ```
   If not found: stop and tell user to install Claude Code CLI.

2. **Print mode works:**
   ```bash
   echo "hello" | claude --print 2>&1
   ```
   If fails: stop and explain the requirement.

3. **Git configured:**
   ```bash
   git config user.name && git config user.email
   ```
   If not configured: warn user, suggest `git config --global user.name "Name"`.

4. **Quality gates run:**
   Run each quality gate command once. If any fails, warn the user:
   > Quality gate `{{command}}` failed before Ralph even started. Fix this first or remove the gate.

5. **No existing Ralph loop:**
   Check for `.ralph-running.lock` in the project root.
   If exists: warn that another loop may be active. Ask user to confirm (force start or abort).

6. **Git status:**
   Run `git status --porcelain`. If dirty, ask via AskUserQuestion:
   - Header: "Dirty Repo"
   - Options:
     - "Continue anyway" — "Ralph will work on top of uncommitted changes"
     - "Let me clean up first" — "I'll stash or commit, then re-run /ralph"

### Step 3: DECOMPOSE (BUILDING mode only)

Break the goal into Ralph-sized tasks.

**Guidelines:**
- Each task touches 2-5 files (one functional unit)
- Each task has a binary-testable acceptance criterion
- Tasks are ordered by dependency, then priority
- Estimate: one task per iteration

**Output:** Write `RALPH-TASKS.json` to the output directory:
```json
[
  {
    "id": 1,
    "task": "Short description",
    "priority": 1,
    "depends_on": [],
    "passes": false,
    "files": ["path/to/likely/files"],
    "acceptance": "Binary testable criterion"
  }
]
```

For PLANNING mode: skip this step (the loop itself produces the task list).
For IMPROVEMENT mode: skip this step (each iteration finds its own target).

### Step 4: CRAFT PROMPT

Select and fill the appropriate prompt template.

**Template selection:**
- PLANNING → `_cc-native/templates/ralph-prompt-planning.md`
- BUILDING → `_cc-native/templates/ralph-prompt-building.md`
- IMPROVEMENT → `_cc-native/templates/ralph-prompt-improvement.md`

**Template filling:**
1. Read the template file
2. Replace `{{GOAL}}` with the user's goal (from Step 1)
3. Replace `{{QUALITY_GATES}}` with formatted quality gate commands:
   ```
   - `npm test` — must exit 0
   - `npm run lint` — must exit 0
   ```
4. **Sanitize user input:** Strip any `{{` or `}}` from user-provided values to prevent template injection. Escape shell metacharacters (backticks, `$`, `!`).

**Output:** Write the filled prompt to `RALPH-PROMPT.md` in the output directory.

### Step 5: INITIALIZE STATE

Create all state files before the first iteration.

**Output directory:** `_output/cc-native/ralph/{YYYY-MM-DD}/{HHMMSS}-{slug}/`
- `{YYYY-MM-DD}` — today's date
- `{HHMMSS}` — current time (hours, minutes, seconds)
- `{slug}` — first 4 words of goal, kebab-case, max 30 chars

**Files to create:**

1. `RALPH-PROMPT.md` — from Step 4
2. `RALPH-PATTERNS.md`:
   ```markdown
   # Codebase Patterns

   Reusable patterns discovered during Ralph iterations.
   Each iteration should add patterns it discovers here.
   ```
3. `RALPH-PROGRESS.md`:
   ```markdown
   # Progress Log

   Chronological record of each Ralph iteration.
   ```
4. `RALPH-TASKS.json` — from Step 3 (BUILDING mode) or empty array `[]`
5. `RALPH-LOG.md` — empty file (runner script appends to this)
6. `ralph-config.json`:
   ```json
   {
     "mode": "BUILDING",
     "goal": "user's goal text",
     "maxIterations": 10,
     "qualityGates": ["npm test", "npm run lint"],
     "workingDir": "/absolute/path/to/project",
     "outputDir": "/absolute/path/to/output/dir",
     "perIterationTimeout": 600,
     "startedAt": "ISO timestamp",
     "taskId": null
   }
   ```

**Lock file:** Create `.ralph-running.lock` in the project root with contents:
```
Ralph loop started at [ISO timestamp]
Output: [output directory path]
```

### Step 6: GENERATE RUNNER

Generate a platform-specific runner script.

**Platform detection:**
```bash
uname -s 2>/dev/null
```
- If returns "Linux" or "Darwin" → generate bash script
- If command fails (Windows without WSL) → generate PowerShell script
- Note: On Windows with Git Bash/WSL, bash is preferred

**Script generation:**
1. Read the appropriate template (`ralph-runner.sh` or `ralph-runner.ps1`)
2. Replace all `{{VAR}}` placeholders with actual values from ralph-config.json
3. Write the filled script to the output directory
4. For bash: make executable with `chmod +x`

**Placeholder values:**
| Placeholder | Source |
|---|---|
| `{{MAX_ITERATIONS}}` | ralph-config.json `maxIterations` |
| `{{PROMPT_FILE}}` | Absolute path to RALPH-PROMPT.md |
| `{{LOG_FILE}}` | Absolute path to RALPH-LOG.md |
| `{{WORKING_DIR}}` | ralph-config.json `workingDir` |
| `{{LOCK_FILE}}` | Absolute path to `.ralph-running.lock` |
| `{{PER_ITERATION_TIMEOUT}}` | ralph-config.json `perIterationTimeout` |

### Step 7: EXECUTE

Launch the runner script in the background.

```
Use Bash tool with run_in_background: true
Command: bash /path/to/ralph-runner.sh   (or pwsh /path/to/ralph-runner.ps1)
```

**After launching:**
- Capture the task_id from the Bash tool response
- Update ralph-config.json: set `taskId` to the captured value

### Step 8: REPORT

Tell the user the loop is running.

**Output format:**
```
Ralph is running in the background.

**Mode:** BUILDING
**Goal:** [goal]
**Max iterations:** 10
**Output directory:** _output/cc-native/ralph/[date]/[slug]/

**Check progress:** `/ralph-status`
**Stop the loop:** `/ralph-stop`

Ralph will commit after each successful task. You can continue working in this session — Ralph runs independently.
```

## Output Files

All artifacts go to `_output/cc-native/ralph/{date}/{time}-{slug}/`:
- `RALPH-PROMPT.md` — The crafted prompt sent to each iteration
- `RALPH-TASKS.json` — Task list with completion state
- `RALPH-PATTERNS.md` — Reusable codebase patterns
- `RALPH-PROGRESS.md` — Chronological iteration log
- `RALPH-LOG.md` — Full stdout from all iterations
- `RALPH-BLOCKERS.md` — Blockers encountered (if any)
- `ralph-runner.sh` or `.ps1` — Generated runner script
- `ralph-config.json` — Configuration and metadata

## Success Criteria

- [ ] User provided goal, mode, quality gates, and iteration count
- [ ] Pre-flight checks all passed
- [ ] Prompt template filled correctly with user inputs
- [ ] State files initialized before first iteration
- [ ] Runner script launched in background
- [ ] User informed of how to check progress and stop

## REVIEW (User-Initiated After Loop Completes)

When the user says "ralph is done" or asks for results:

1. Read `RALPH-PROGRESS.md` — summarize iterations and outcomes
2. Read `RALPH-PATTERNS.md` — highlight discovered patterns
3. Read `RALPH-BLOCKERS.md` if it exists — report blockers
4. Run `git log --oneline` — show commits made by Ralph
5. Run quality gates one final time — confirm codebase is clean
6. Remove `.ralph-running.lock` if it still exists
7. Report: iterations completed, tasks done, final state, any issues
