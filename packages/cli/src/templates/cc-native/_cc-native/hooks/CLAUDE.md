# CC-Native Hooks Development Guide

> **Keep this document updated.** When you solve an issue related to hooks, add the solution to the relevant section and log it in the Changelog. This document should grow with discovered patterns and fixes—don't wait to be asked.

---

## Quick Reference

| Hook | Trigger | Purpose |
|------|---------|---------|
| `cc-native-plan-review.py` | PreToolUse: ExitPlanMode | Review plans before user approval |
| `add_plan_context.py` | PostToolUse: EnterPlanMode | Add context when entering plan mode |
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
        "hookEventName": "PreToolUse",
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

---

## Debugging Output

Hooks communicate via stdout (JSON) and stderr (logs). Use them correctly:

```python
# CORRECT - logs go to stderr, visible in terminal
def eprint(*args):
    print(*args, file=sys.stderr)

eprint("[hook-name] Starting hook...")
eprint(f"[hook-name] Found {len(items)} items")
```

```python
# WRONG - print() goes to stdout, corrupts JSON output
print("Debug info")  # Breaks JSON parsing
print(json.dumps(output))  # Now invalid because of previous print
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
eprint(f"[hook] Session ID: {session_id}")
eprint(f"[hook] In-flight contexts: {len(in_flight)}")
eprint(f"[hook] Modes: {[c.in_flight.mode for c in in_flight]}")
```

---

## Error Handling

Hooks should fail gracefully - a broken hook shouldn't break the user's workflow:

```python
def main() -> int:
    try:
        # Hook logic...
        return 0
    except Exception as e:
        eprint(f"[hook-name] Error: {e}")
        # Return 0 to not block the user
        return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        import traceback
        eprint(f"[hook-name] FATAL: {e}")
        traceback.print_exc(file=sys.stderr)
        # Still exit 0 to not block - or exit 1 if blocking is intentional
        raise SystemExit(0)
```

Use `sys.exit(1)` only for intentional blocking (e.g., `blockOnFail: true` configured).

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
python -m py_compile packages/cli/src/templates/cc-native/_cc-native/hooks/cc-native-plan-review.py
```

Hooks fail silently on syntax errors - this catches them before they reach production.

---

## Changelog

<!-- Add dated entries as new issues are discovered -->

| Date | Change |
|------|--------|
| 2026-02-03 | Initial creation |
