#!/usr/bin/env python3
"""Context monitor hook for proactive handoff warnings.

This hook runs on PostToolUse for context-heavy tools and monitors
context window usage. When context drops below a threshold, it injects
a system reminder instructing Claude to wrap up and create a handoff document.

Unlike UserPromptSubmit hooks, this fires DURING Claude's work,
allowing proactive intervention without waiting for user input.

Monitored tools (configured via settings.json matcher):
- Task: Subagent responses can be huge
- Read: File content loads into context
- Bash: Command output can be large
- WebFetch: Web content loads into context

Hook input (from Claude Code):
{
    "hook_event_name": "PostToolUse",
    "tool_name": "Task",
    "tool_input": {...},
    "tool_result": {...},
    "transcript_path": "/path/to/transcript.jsonl",
    "session_id": "abc123",
    "context_window": {
        "current_usage": {
            "cache_read_input_tokens": 0,
            "input_tokens": 12345,
            "cache_creation_input_tokens": 0,
            "output_tokens": 6789
        },
        "context_window_size": 200000
    },
    ...
}

Hook output:
- Outputs JSON with additionalContext if context is low
- This injects a system reminder into Claude's context
- Plain stdout from PostToolUse only goes to verbose mode, not Claude
- Using additionalContext ensures Claude sees and responds to the warning

KNOWN LIMITATION: Context percentage won't match /context exactly.
Hook JSON excludes system prompt, tools, MCP tokens. We add a baseline
to compensate (~22.6k tokens typical). See:
https://github.com/anthropics/claude-code/issues/13783
"""
import sys
from pathlib import Path
from typing import Optional

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import emit_context, load_hook_input, get_context_percent_remaining, log_debug, log_info, log_warn, log_error, log_diagnostic
from lib.base.utils import now_iso, project_dir
from lib.context.context_store import (
    get_all_contexts,
    get_context_by_session_id,
    maybe_activate,
    save_state,
)

# Module-level flag: only save auto-state once per process lifetime
_PROGRESSIVE_SAVE_MARKER = ".progressive-save-done"

# Configuration
SAVE_STATE_THRESHOLD = 60  # Silently save auto-state at 60% remaining
HANDOFF_SUGGEST_THRESHOLD = 30  # Gentle nudge at 30% remaining (70% used)
HANDOFF_PREPARE_THRESHOLD = 20  # Stronger warning at 20% remaining (80% used)
CRITICAL_CONTEXT_THRESHOLD = 10  # Urgent warning at 10% remaining (90% used)


def get_current_context_id(project_root: Path = None) -> Optional[str]:
    """Determine the current active context (most recently active)."""
    contexts = get_all_contexts(status="active", project_root=project_root)
    if contexts:
        return contexts[0].id
    return None


def get_context_warning(
    percent_remaining: int,
    tokens_used: Optional[int],
    max_tokens: Optional[int],
    context_id: Optional[str],
    tool_name: str
) -> str:
    """Generate appropriate warning based on context level."""
    if tokens_used is not None and max_tokens is not None:
        tokens_used_k = tokens_used // 1000
        max_tokens_k = max_tokens // 1000
        usage_line = f"**Estimated usage**: ~{tokens_used_k}k / {max_tokens_k}k tokens"
    else:
        usage_line = f"**Estimated usage**: ~{percent_remaining}% remaining"

    context_line = f"\nContext ID: `{context_id}`" if context_id else ""

    if percent_remaining <= CRITICAL_CONTEXT_THRESHOLD:
        return f"""<system-reminder>
## CRITICAL CONTEXT WARNING ({percent_remaining}% remaining)

{usage_line}
**Triggered by**: {tool_name} tool completion

**CRITICAL: Run `/handoff` now before context is compacted.**
{context_line}

You are about to lose context. Stop all other work and run `/handoff` immediately.
</system-reminder>"""

    elif percent_remaining <= HANDOFF_PREPARE_THRESHOLD:
        return f"""<system-reminder>
## LOW CONTEXT WARNING ({percent_remaining}% remaining)

{usage_line}
**Triggered by**: {tool_name} tool completion

**Context is getting low. Please finish your current task and run `/handoff`.**
{context_line}

**Actions:**
1. Complete your current atomic task (if 1-2 steps away)
2. Do NOT start new multi-step work
3. Run `/handoff` to generate a handoff document
</system-reminder>"""

    else:
        return f"""<system-reminder>
## CONTEXT NOTICE ({percent_remaining}% remaining)

{usage_line}
**Triggered by**: {tool_name} tool completion

**Consider preparing a handoff soon. When ready, run `/handoff` to generate a handoff document.**
{context_line}

Continue your current work, but avoid starting large new tasks.
</system-reminder>"""


def check_and_transition_mode(hook_input: dict) -> None:
    """
    Check if context mode needs to transition based on tool usage.

    Handles:
    - has_plan + implementation tool -> active (started implementing)
    - idle + implementation tool -> active
    """
    project_root = project_dir(hook_input)
    session_id = hook_input.get("session_id")

    if not session_id:
        return

    state = get_context_by_session_id(session_id, project_root)
    if not state:
        return

    # Implementation transitions only trigger on implementation tools
    implementation_tools = {"Edit", "Write", "Bash", "NotebookEdit"}
    tool_name = hook_input.get("tool_name", "")

    if tool_name not in implementation_tools:
        return

    permission_mode = hook_input.get("permission_mode", "default")
    maybe_activate(state.id, permission_mode, project_root=project_root, caller="context_monitor")


def _try_progressive_save(hook_input: dict, percent_remaining: int) -> None:
    """Silently save state at SAVE_STATE_THRESHOLD (60%)."""
    try:
        session_id = hook_input.get("session_id", "")
        if not session_id:
            return

        project_root = project_dir(hook_input)
        state = get_context_by_session_id(session_id, project_root)
        if not state:
            return

        from lib.base.constants import get_context_dir
        marker_path = get_context_dir(state.id, project_root) / _PROGRESSIVE_SAVE_MARKER
        if marker_path.exists():
            try:
                saved_session = marker_path.read_text(encoding="utf-8").strip()
                if saved_session == session_id:
                    return
            except OSError:
                pass

        log_info("context_monitor", f"Progressive save at {percent_remaining}% remaining")

        # Just update last_active and save state
        state.last_active = now_iso()
        save_state(state, project_root)

        try:
            marker_path.write_text(session_id, encoding="utf-8")
        except OSError:
            pass

    except Exception as e:
        log_warn("context_monitor", f"Progressive save error (non-fatal): {e}")


def check_context_level(hook_input: dict) -> Optional[str]:
    """Check context level and return warning if low."""
    tool_name = hook_input.get("tool_name", "Unknown")
    percent_remaining, tokens_used, max_tokens = get_context_percent_remaining(hook_input)

    log_diagnostic("context_monitor", "receive", f"tool={tool_name}, pct_remaining={percent_remaining}",
                    inputs={"tool_name": tool_name, "percent_remaining": percent_remaining,
                            "tokens_used": tokens_used, "max_tokens": max_tokens})

    if percent_remaining is None:
        return None

    if percent_remaining > SAVE_STATE_THRESHOLD:
        return None

    if percent_remaining > HANDOFF_SUGGEST_THRESHOLD:
        _try_progressive_save(hook_input, percent_remaining)
        return None

    if tokens_used is not None and max_tokens is not None:
        log_info("context_monitor", f"Context: {percent_remaining}% remaining "
                 f"(~{tokens_used//1000}k/{max_tokens//1000}k tokens)")
    else:
        log_info("context_monitor", f"Context: ~{percent_remaining}% remaining (from context.json)")

    project_root = project_dir(hook_input)
    context_id = get_current_context_id(project_root)

    threshold = ("critical" if percent_remaining <= CRITICAL_CONTEXT_THRESHOLD
                 else "prepare" if percent_remaining <= HANDOFF_PREPARE_THRESHOLD
                 else "suggest")
    log_diagnostic("context_monitor", "decide", f"Threshold={threshold} at {percent_remaining}%",
                    decision=threshold, reasoning=f"{percent_remaining}% remaining",
                    inputs={"context_id": context_id, "percent_remaining": percent_remaining})

    return get_context_warning(percent_remaining, tokens_used, max_tokens, context_id, tool_name)


def main():
    """Main entry point for PostToolUse hook."""
    try:
        hook_input = load_hook_input()
        if not hook_input:
            return

        check_and_transition_mode(hook_input)

        warning = check_context_level(hook_input)
        if warning:
            emit_context(warning)

    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        from lib.base.hook_utils import log_hook_error
        log_hook_error("context_monitor", e, "PostToolUse", traceback_str=tb)


if __name__ == "__main__":
    from lib.base.hook_utils import run_hook
    run_hook(main, "context_monitor")
