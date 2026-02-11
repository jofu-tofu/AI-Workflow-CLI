# CC-Native Library Development Guide

> **Keep this document updated.** When you solve an issue related to library code, add the solution to the relevant section and log it in the Changelog. This document should grow with discovered patterns and fixes—don't wait to be asked.

---

## Module Overview

| Module | Purpose |
|--------|---------|
| `utils.py` | Core utilities: eprint, sanitize, JSON parsing, artifact writing |
| `state.py` | Plan state file management and iteration tracking |
| `orchestrator.py` | Plan complexity analysis and agent selection |
| `reviewers/` | Plan review implementations (package — see below) |
| `constants.py` | Shared constants and feature flags (e.g., `ENABLE_ROBUST_PLAN_WRITES`) |
| `debug.py` | Permanent debug logging to context folder (`CCNATIVE_DEBUG_DISABLE=1` to disable) |
| `__init__.py` | Package exports |

### reviewers/ Package

| File | Purpose |
|------|---------|
| `__init__.py` | Re-exports: `ReviewerResult`, `run_codex_review`, `run_gemini_review`, `run_agent_review` |
| `base.py` | `ReviewerResult`, `REVIEW_SCHEMA`, `AgentConfig`, `OrchestratorConfig` |
| `agent.py` | Claude Code agent-based reviewer (uses `--system-prompt`) |
| `codex.py` | Codex CLI reviewer |
| `gemini.py` | Google Gemini API reviewer |

---

## Dependency Graph

```
Hooks (cc-native-plan-review.py, etc.)
    │
    ├── lib/utils.py (core utilities)
    │       └── lib/constants.py
    │
    ├── lib/state.py (state management)
    │       └── lib/utils.py (eprint)
    │
    ├── lib/orchestrator.py (agent selection)
    │       └── lib/utils.py (ReviewerResult, etc.)
    │
    ├── lib/reviewers/ (plan review package)
    │       ├── base.py (ReviewerResult, AgentConfig, schemas)
    │       ├── agent.py → base.py
    │       ├── codex.py → base.py
    │       └── gemini.py → base.py
    │
    ├── lib/debug.py (context-folder debug logging)
    │
    └── _shared/lib-ts/ (shared TS infrastructure — see _shared/lib-ts/CLAUDE.md)
```

**Import direction:** Hooks --> cc-native lib --> `_shared/`. Never the reverse. See `_shared/lib-ts/CLAUDE.md` for the full shared library index.

---

## Key Data Classes

### ReviewerResult

```python
@dataclass
class ReviewerResult:
    name: str           # Reviewer name (e.g., "codex", "architect-reviewer")
    ok: bool            # True if review completed successfully
    verdict: str        # "pass" | "warn" | "fail" | "error" | "skip"
    data: Dict[str, Any]  # Structured review data (summary, issues, etc.)
    raw: str            # Raw response text
    err: str            # Error message if any
```

### OrchestratorResult

```python
@dataclass
class OrchestratorResult:
    complexity: str         # "simple" | "medium" | "high"
    category: str           # "code" | "infrastructure" | "documentation" | etc.
    selected_agents: List[str]  # Agent names to run
    reasoning: str          # Why these agents were selected
    skip_reason: Optional[str]  # Why review was skipped (if applicable)
    error: Optional[str]    # Error message if orchestrator failed
```

### CombinedReviewResult

```python
@dataclass
class CombinedReviewResult:
    plan_hash: str                          # SHA256 hash (first 16 chars)
    overall_verdict: str                    # Worst verdict across all reviewers
    cli_reviewers: Dict[str, ReviewerResult]  # Codex, Gemini results
    orchestration: Optional[OrchestratorResult]
    agents: Dict[str, ReviewerResult]       # Agent review results
    timestamp: str                          # ISO format
```

---

## Windows Path Handling

Windows uses backslashes in paths. Always normalize when comparing:

```python
# CORRECT - works on Windows and Unix
if ".claude/plans/" in file_path.replace("\\", "/"):
    # Found a plan file

# Also correct - use Path for comparisons
from pathlib import Path
if Path(".claude/plans") in Path(file_path).parents:
    # Found a plan file
```

```python
# WRONG - fails on Windows
if ".claude/plans/" in file_path:  # Windows path: ".claude\\plans\\"
    # Never matches on Windows!
```

This is a recurring issue. Any path string comparison must handle both separators.

---

## Atomic Writes

For critical files (state, reviews), use atomic writes. See `_shared/lib-ts/CLAUDE.md` for the TS version (`atomicWriteFileSync`).

Python equivalent:

```python
from _shared.lib.base.atomic_write import atomic_write

success, error = atomic_write(path, content)
if not success:
    eprint(f"[module] Write failed: {error}")
```

The `constants.ENABLE_ROBUST_PLAN_WRITES` feature flag (env: `CC_NATIVE_ROBUST_WRITES`, default: `true`) controls whether atomic writes are used for plan state files.

---

## Adding New Reviewers

1. **Create reviewer file** in `reviewers/` package (e.g., `reviewers/myreviewer.py`):
   ```python
   from .base import ReviewerResult, REVIEW_SCHEMA

   def run_myreviewer_review(
       plan: str,
       schema: Dict[str, Any],
       settings: Dict[str, Any],
   ) -> ReviewerResult:
       # Implementation
       return ReviewerResult(
           name="myreviewer",
           ok=True,
           verdict="pass",
           data=parsed_data,
           raw=raw_response,
           err="",
       )
   ```

2. **Export in `reviewers/__init__.py`**:
   ```python
   from .myreviewer import run_myreviewer_review
   ```

3. **Add config** in `plan-review.config.json`:
   ```json
   {
     "planReview": {
       "reviewers": {
         "myreviewer": {"enabled": true, "timeout": 120}
       }
     }
   }
   ```

4. **Wire in hook** (`cc-native-plan-review.py`):
   ```python
   from reviewers import run_myreviewer_review

   if myreviewer_enabled:
       phase1_tasks.append(("myreviewer", lambda: run_myreviewer_review(...)))
   ```

---

## JSON Parsing

Use `parse_json_maybe` for LLM responses - it handles markdown code blocks and extraction:

```python
from utils import parse_json_maybe, coerce_to_review

# Parse with field validation
obj = parse_json_maybe(raw_response, require_fields=["verdict", "summary"])

# Normalize to expected structure
ok, verdict, data = coerce_to_review(obj)
```

The parser tries:
1. Strict JSON parse
2. Extract `{...}` block from text (handles ```json blocks)

---

## Encoding

Always specify encoding on file operations:

```python
# CORRECT
content = path.read_text(encoding="utf-8")
path.write_text(content, encoding="utf-8")

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
```

```python
# WRONG - uses system default (can fail on Windows)
content = path.read_text()  # May use cp1252 on Windows
```

---

## DO NOT

These are reminders based on past issues. Not enforcement rules.

- **Don't import from `_cc-native/lib/` in `_shared/lib/`** - wrong direction, creates circular deps
- **Don't use `print()` for debugging** - use `log_debug/log_info/log_warn/log_error` from `_shared/lib/base/logger.py` (writes to stderr + `_output/hook-log.jsonl`)
- **Don't modify data class fields** without updating all consumers (hooks, formatters, tests)
- **Don't hardcode paths** - use `Path(__file__)`, env vars, or config
- **Don't forget `encoding="utf-8"`** on file operations - Windows defaults are unsafe
- **Don't assume forward slashes** in file paths - Windows uses backslashes
- **Don't skip atomic writes** for critical state files - use `atomic_write` function

---

## Changelog

<!-- Add dated entries as new issues are discovered -->

| Date | Change |
|------|--------|
| 2026-02-10 | Fixed `debug.py`: removed `context_path=` keyword from `hook_log()` calls — Python logger doesn't accept it (was causing `TypeError` crash in plan review) |
| 2026-02-07 | Unified logger: all diagnostic logging uses `_shared/lib/base/logger.py` instead of eprint/print-to-stderr |
| 2026-02-06 | Remove duplicate `atomic_write.py` — consolidated to `_shared/lib/base/atomic_write.py` |
| 2026-02-03 | Initial creation |
