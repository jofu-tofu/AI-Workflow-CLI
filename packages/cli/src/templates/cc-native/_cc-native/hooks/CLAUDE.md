# CC-Native Hooks Development Guide

> **Keep this document updated.** When you solve an issue related to hooks, add the solution to the relevant section and log it in the Changelog. This document should grow with discovered patterns and fixes—don't wait to be asked.

---

## Quick Reference

| Hook | Trigger | Purpose |
|------|---------|---------|
| `cc-native-plan-review.py` | PreToolUse: ExitPlanMode | Review plans before user approval |
| `add_plan_context.py` | PostToolUse: AskUserQuestion, PreToolUse: Task | Mark questions asked; nudge Plan subagent to ask questions first |
| `suggest-fresh-perspective.py` | PostToolUse | Suggest fresh perspective workflow |

---

## Import Pattern

Hooks run from arbitrary working directories. Always set up sys.path explicitly.

```python
# CORRECT - works in hook context
from pathlib import Path
import sys

_lib = Path(__file__).parent.parent / "lib"
sys.path.insert(0, str(_lib))

# For shared library access
_shared = Path(__file__).parent.parent.parent / "_shared"
sys.path.insert(0, str(_shared))

from utils import eprint, ReviewerResult
from lib.base.subprocess_utils import is_internal_call
from debug import log_debug  # Context-folder debug logging
```

```python
# WRONG - relative imports fail in hook context
from ..lib import utils  # ModuleNotFoundError
```

---

## Internal Call Detection

Hooks can be invoked recursively when spawning subprocesses (agents, orchestrator). Always check and skip:

```python
def main() -> int:
    # FIRST LINE of main - before any other logic
    if is_internal_call():
        return 0  # Skip for subprocess calls

    # Rest of hook logic...
```

Without this check, the hook runs multiple times per plan review, causing duplicate reviews and state corruption.

---

## Hook Output Format

Claude Code hooks return JSON to stdout. The format is specific to each hook type.

### PreToolUse Output

```python
# CORRECT - current API format
import json

out = {
    "hookSpecificOutput": {
        "additionalContext": "Information for Claude to see...",
    }
}

# To block the tool call:
out["hookSpecificOutput"]["permissionDecision"] = "deny"
out["hookSpecificOutput"]["permissionDecisionReason"] = "Reason shown to Claude"

print(json.dumps(out, ensure_ascii=False))
```

```python
# WRONG - old format, silently ignored
{"decision": "block", "reason": "..."}  # Does nothing
{"continue": False, "message": "..."}   # Does nothing
```

**Key insight:** The old `decision`/`reason` format fails silently. If your hook isn't affecting Claude's behavior, check the output format first.

### Using Hook Utilities (Preferred)

Instead of manually constructing hookSpecificOutput dicts, use the shared utilities from `base.hook_utils`:

```python
from base.hook_utils import emit_context, emit_context_and_block

# Inject context without blocking:
emit_context("Information for Claude to see...")

# Block the tool call with context and reason:
emit_context_and_block(
    "Review feedback for Claude to see...",
    "Reason shown to Claude for the denial"
)
```

These handle the JSON serialization and stdout printing. `emit_context` defaults to `ensure_ascii=False`; `emit_context_and_block` defaults to `ensure_ascii=True` (safe for Windows cp1252).

---

## Debugging Output

Hooks communicate via stdout (JSON) and stderr (logs). Use the unified logger for all diagnostic output:

```python
from base.hook_utils import log_debug, log_info, log_warn, log_error

# CORRECT - unified logger: writes to stderr AND _output/hook-log.jsonl
log_debug("hook-name", f"Found {len(items)} items")
log_info("hook-name", "Starting hook...")
log_warn("hook-name", f"Fallback used: {reason}")
log_error("hook-name", f"Failed: {e}", traceback_str=tb)
```

```python
# ACCEPTABLE - eprint() for terminal-only UX (usage help, progress)
eprint("Usage: python hook.py <args>")
```

```python
# WRONG - print() goes to stdout, corrupts JSON output
print("Debug info")  # Breaks JSON parsing

# WRONG - raw print to stderr instead of logger
print(f"Error: {e}", file=sys.stderr)  # Use log_error() instead
```

---

## Context System Integration

Plan review hooks integrate with the shared context system for state management:

```python
from lib.context.context_manager import (
    get_context_by_session_id,
    get_all_in_flight_contexts,
)
from lib.base.constants import get_context_reviews_dir

# Find active context
context = get_context_by_session_id(session_id, project_root)
if not context:
    # Fallback: find single planning context
    in_flight = get_all_in_flight_contexts(project_root)
    planning = [c for c in in_flight if c.in_flight and c.in_flight.mode == "planning"]
    if len(planning) == 1:
        context = planning[0]

# Get reviews directory for this context
reviews_dir = get_context_reviews_dir(context.id, project_root)
```

If context isn't found, add diagnostic logging:

```python
log_debug("hook", f"Session ID: {session_id}")
log_debug("hook", f"In-flight contexts: {len(in_flight)}")
log_debug("hook", f"Modes: {[c.in_flight.mode for c in in_flight]}")
```

---

## Error Handling

Hooks should fail gracefully - a broken hook shouldn't break the user's workflow:

```python
from base.hook_utils import log_error, run_hook

def main() -> int:
    try:
        # Hook logic...
        return 0
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log_error("hook-name", str(e), traceback_str=tb)
        # Return 0 to not block the user
        return 0

if __name__ == "__main__":
    run_hook(main, "hook-name")
```

Use `sys.exit(1)` only for intentional blocking (e.g., two-stage review decision denies the plan).

---

## DO NOT

These are reminders based on past issues. Not enforcement rules.

- **Don't modify hook output format** without verifying the current Claude Code hook API (it changes between versions)
- **Don't use `sys.exit(1)`** for non-fatal errors - it blocks the user's workflow
- **Don't forget template sync** after modifying hooks in `.aiwcli/` - changes should also go to `packages/cli/src/templates/cc-native/`
- **Don't use `print()`** for anything except the final JSON output
- **Don't assume session_id format** - it can be UUID, path-like, or other formats
- **Don't skip `is_internal_call()` check** - recursive hook execution causes state corruption
- **Don't hardcode paths** - use `Path(__file__)` and environment variables

---

## Verification After Changes

Always validate Python syntax after editing hooks:

```bash
# Validate working copy
python -m py_compile .aiwcli/_cc-native/hooks/cc-native-plan-review.py

# Validate template copy (after sync)
python -m py_compile packages/cli/src/templates/cc-native/_cc-native/hooks/cc-native-plan-review.py

# Validate all shared hooks (loop required — py_compile doesn't accept globs)
for f in .aiwcli/_shared/hooks/*.py; do python -m py_compile "$f"; done
```

Hooks fail silently on syntax errors - this catches them before they reach production.

---

## Changelog

<!-- Add dated entries as new issues are discovered -->

| Date | Change |
|------|--------|
| 2026-02-07 | Handoff staging lifecycle: `has_handoff` mode + `handoff_consumed` flag mirrors plan lifecycle. `save_handoff.py` no longer transitions to idle — stays active for session_end staging. `session_end.py` stages `active→has_handoff` when handoff_path set and not consumed. `session_start.py` restores `has_handoff→active` on /clear. `context_selector.py` has fallback Case 3b for has_handoff. PostToolUse context_monitor matcher simplified from specific tool list to `*`. |
| 2026-02-07 | Removed PreToolUse:Write matcher from `add_plan_context.py`. Write-time plan nudges were redundant after consolidating enforcement to PreToolUse:Task. Removed `is_plan_file_write()`, `load_plan_context_config()`, `PHASE_B_ENFORCEMENT`, `nudge_write_questions()`, and `project_dir` import. |
| 2026-02-07 | Question enforcement is now advisory-only (never blocks). `add_plan_context.py` uses `emit_context()` for all question nudges — no `permissionDecision:deny` anywhere. Removed `emit_context_and_block` import and `TASK_ENFORCEMENT_REASON` constant. |
| 2026-02-07 | Moved question enforcement to PreToolUse:Task (Plan subagent gate). `add_plan_context.py` now handles three events: PostToolUse:AskUserQuestion, PreToolUse:Task (primary gate), PreToolUse:Write (fallback). Added `is_plan_task()`, `is_internal_call()` guard, `TASK_ENFORCEMENT_CONTEXT` constant. Registered `^Task$` command hook in settings.json. |
| 2026-02-07 | Deleted `plan_accepted.py` (dead code — PostToolUse:ExitPlanMode never fires due to /clear race). Plan field assignment handled by `session_end.py` fallback. Added `plan_consumed` flag to prevent infinite plan re-staging. |
| 2026-02-07 | Hook lifecycle diagnostics: all hooks now use `run_hook(main, "hook_name")` entry point. Logs HOOK_START/HOOK_END with template origin, event type, duration_ms, and status. Millisecond timestamps in logger. |
| 2026-02-07 | Unified logger: all diagnostic logging uses `log_debug/log_info/log_warn/log_error` from `_shared/lib/base/logger.py` instead of eprint/print-to-stderr. Updated debugging and error handling docs. |
| 2026-02-06 | Merged mark_questions_asked.py into add_plan_context.py. Hook now handles both PostToolUse:AskUserQuestion and PreToolUse:Write. Deleted standalone mark_questions_asked.py. |
| 2026-02-06 | Fixed add_plan_context.py trigger docs (was PostToolUse: EnterPlanMode, is PreToolUse: Write). Added emit_context/emit_context_and_block utility docs. |
| 2026-02-03 | Initial creation |
