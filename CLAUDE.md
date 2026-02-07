# Instructions for Claude

## Before Development or Testing

**Read DEVELOPMENT.md first.** It contains environment setup that prevents path errors, test failures, and cross-environment pollution.

## Template Synchronization

**When modifying hooks, library code, or settings in `.aiwcli/`:**

Changes to the working directory (`.aiwcli/`) should also be applied to the template at `packages/cli/src/templates/cc-native/`. This ensures new project initializations receive the updates.

**Files that need synchronization:**
- `.aiwcli/_shared/hooks/*.py` → `packages/cli/src/templates/cc-native/_shared/hooks/`
- `.aiwcli/_shared/lib/**/*.py` → `packages/cli/src/templates/cc-native/_shared/lib/`
- `.aiwcli/_cc-native/**/*.py` → `packages/cli/src/templates/cc-native/_cc-native/`
- `.claude/settings.json` → `packages/cli/src/templates/cc-native/.claude/settings.json`

**When to sync:**
- Adding new hooks
- Modifying hook behavior
- Adding/changing library functions used by hooks
- Updating settings.json hook configurations

**Note:** The `dist/` directory is auto-generated during build - only update `src/templates/`.

## Hook Development

See `.aiwcli/_cc-native/hooks/CLAUDE.md` for hook development patterns, API format, debugging, and the py_compile verification workflow.

### Hook Entry Point Standard

**All hooks MUST use `run_hook()` as their entry point.** This provides automatic lifecycle logging (HOOK_START/HOOK_END with template origin, duration, status) and standardized error handling.

```python
if __name__ == "__main__":
    from lib.base.hook_utils import run_hook  # shared hooks
    # or: from base.hook_utils import run_hook  # cc-native hooks
    run_hook(main, "hook_name")
```

**Do NOT** use bare `main()`, `sys.exit(main())`, `raise SystemExit(main())`, or manual try/except blocks in `__main__`. These patterns bypass lifecycle logging and produce inconsistent error handling. `run_hook()` handles all of this automatically.

## Logging Standard

All hook and library code must use the unified logger at `_shared/lib/base/logger.py`:

```python
from lib.base.logger import log_debug, log_info, log_warn, log_error

log_debug("hook_name", "checking value")
log_info("hook_name", "session started")
log_warn("hook_name", f"fallback used: {reason}")
log_error("hook_name", f"failed: {e}", traceback_str=tb)
```

- **Never use** `print(..., file=sys.stderr)` for diagnostic logging
- **`eprint()`** is only for terminal-only UX messages (usage help, progress indicators)
- Logs go to `_output/hook-log.jsonl` (JSONL format) and stderr
- Control via `HOOK_LOG_LEVEL=warn` (minimum level) or `HOOK_LOG_DISABLE=1`

## Plan Lifecycle (Separation of Concerns)

Plan assignment is decoupled from mode transitions. Each hook has a single responsibility:

| Hook | Event | Responsibility |
|------|-------|---------------|
| `archive_plan.py` | PermissionRequest:ExitPlanMode | Archives plan file to `plans/` folder only. No state.json changes. |
| `session_end.py` | SessionEnd | **Fallback:** assigns plan fields from archived plan if plan_hash missing. Transitions `active` → `has_plan` when `plan_hash` exists **and `plan_consumed` is False**. |
| `session_start.py` | SessionStart(clear) | Finds `has_plan` context, binds new session, transitions `has_plan` → `active`, sets `plan_consumed=True`. Injects task/git restoration. |
| `session_start.py` | SessionStart(compact) | Restores context after compaction. Inlines plan content (not auto-pasted in compact). |
| `context_selector.py` | UserPromptSubmit (via determine_context) | Fallback: cross-session plan matching via hash/signature for edge cases. Sets `plan_consumed=True`. |

**Mode lifecycle:**
```
Plan accepted → archive_plan archives file (PermissionRequest, before user decision)
Session ends  → session_end: fallback assigns plan_hash from archived plan if missing (plan_consumed=False)
                session_end: active → has_plan ONLY when plan_hash exists AND plan_consumed=False
/clear fires  → session_start: has_plan → active (plan_consumed=True — one-shot latch)
Next /clear   → session_end: plan_consumed=True → skip has_plan (no infinite loop)
```

**Critical: Auto-paste bypasses hooks.** After ExitPlanMode "clear context", Claude Code runs `/clear` and auto-pastes the plan content. This auto-paste is an internal mechanism that does NOT trigger UserPromptSubmit. The `session_start.py` handler for `source=clear` bridges this gap.

**plan_consumed is a one-shot latch.** Set to `True` when a plan transitions from `has_plan` → `active` (consumed by session_start or context_selector). Prevents `session_end` from re-staging the same plan. Reset to `False` when a new plan is archived (fallback assignment in session_end) or when mode returns to idle.

**has_plan is transient.** It exists only between SessionEnd (which sets it) and SessionStart(clear) (which consumes it). It should not persist across multiple sessions. If not consumed, `context_selector.py` in UserPromptSubmit provides fallback matching via plan hash.

**Rejection handling:** `archive_plan` archives the file on PermissionRequest (before accept/reject decision). If rejected, the archive exists but `session_end`'s fallback may assign plan_hash. This is acceptable — rejected plans with hash set don't cause harm because has_plan matching in context_selector requires content match.

**Two restore paths:**
- **source=clear** (plan acceptance): Plan auto-pasted by Claude Code. Hook injects task/git context only.
- **source=compact** (auto-compaction): Plan NOT auto-pasted. Hook inlines plan content via `_build_restore_sections(inline_plan=True)`.

**Design principles:**
- `has_plan` = transient bridge between SessionEnd and SessionStart(clear)
- `active` = "working" (with or without plan)
- Plan fields (`plan_path`, `plan_hash`, `plan_signature`) are persistent metadata — never cleared by mode transitions
- `plan_consumed` = one-shot latch preventing infinite plan re-staging
