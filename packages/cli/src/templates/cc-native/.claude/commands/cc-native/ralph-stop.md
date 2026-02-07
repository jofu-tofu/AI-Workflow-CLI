---
description: Stop a running Ralph loop
---
# Stop Ralph

Stop a running Ralph Wiggum loop and report what was completed.

## Steps

1. **Find the output directory:**
   - Read `.ralph-running.lock` in the project root for the output directory path
   - If no lock file exists, inform user that no Ralph loop appears to be running

2. **Stop the background task:**
   - Read `ralph-config.json` from the output directory
   - Use `TaskStop` with the `taskId` from config to kill the runner process

3. **Read final progress:**
   - Read `RALPH-PROGRESS.md` — summarize all completed iterations
   - Read `RALPH-TASKS.json` (if BUILDING mode) — report tasks completed vs remaining

4. **Clean up:**
   - Remove `.ralph-running.lock` from the project root

5. **Report:**
   ```
   Ralph stopped.
   Iterations completed: [N]
   Tasks done: [done] / [total] (BUILDING mode only)
   Last commit: [hash and message, or "none"]
   Progress saved to: [output directory]
   ```
