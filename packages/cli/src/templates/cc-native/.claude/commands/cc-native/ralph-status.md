---
description: Check Ralph loop progress
---
# Ralph Status

Check the progress of a running Ralph Wiggum loop.

## Steps

1. **Find the output directory:**
   - Look for `.ralph-running.lock` in the project root — it contains the output directory path
   - If no lock file exists, scan `_output/cc-native/ralph/` for the most recent run directory

2. **Read configuration:**
   - Read `ralph-config.json` from the output directory
   - Note the mode, max iterations, and task_id

3. **Check background task:**
   - If `taskId` exists in config, use `TaskOutput` with `block: false` to check if the runner is still active
   - Report whether the loop is still running or has finished

4. **Read progress:**
   - Read `RALPH-PROGRESS.md` — summarize iterations completed and outcomes
   - Read the tail of `RALPH-LOG.md` (last 50 lines) — show recent activity

5. **Check tasks (BUILDING mode):**
   - Read `RALPH-TASKS.json` — report how many tasks are done vs remaining

6. **Check blockers:**
   - If `RALPH-BLOCKERS.md` exists, report any blockers

7. **Report summary:**
   ```
   Ralph Status: [RUNNING / COMPLETED / FAILED / STOPPED]
   Mode: [mode]
   Iterations: [completed] / [max]
   Tasks: [done] / [total] (BUILDING mode only)
   Blockers: [count or "none"]
   Last activity: [timestamp from most recent progress entry]
   ```
