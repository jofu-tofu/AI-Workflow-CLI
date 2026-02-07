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

from lib.base.hook_utils import emit_context, load_hook_input, get_context_percent_remaining
from lib.base.utils import eprint, project_dir
from lib.context.context_manager import (
    get_all_contexts,
    get_context_by_session_id,
    update_plan_status,
)
from lib.context.auto_state import save_auto_state
from lib.context.event_log import EVENT_AUTO_STATE_SAVED, append_event

# Module-level flag: only save auto-state once per process lifetime
# Since hooks are separate processes per invocation, we use a file marker instead
_PROGRESSIVE_SAVE_MARKER = ".progressive-save-done"

# Configuration
SAVE_STATE_THRESHOLD = 60  # Silently save auto-state at 60% remaining
HANDOFF_SUGGEST_THRESHOLD = 30  # Gentle nudge at 30% remaining (70% used)
HANDOFF_PREPARE_THRESHOLD = 20  # Stronger warning at 20% remaining (80% used)
CRITICAL_CONTEXT_THRESHOLD = 10  # Urgent warning at 10% remaining (90% used)


def get_current_context_id(project_root: Path = None) -> Optional[str]:
    """
    Determine the current active context.

    Falls back to most recently active context.

    Returns:
        Context ID or None if no active context
    """
    contexts = get_all_contexts(status="active", project_root=project_root)
    if contexts:
        return contexts[0].id  # Sorted by last_active desc
    return None


def get_context_warning(
    percent_remaining: int,
    tokens_used: Optional[int],
    max_tokens: Optional[int],
    context_id: Optional[str],
    tool_name: str
) -> str:
    """
    Generate appropriate warning based on context level.

    Three tiers:
    - SUGGEST (<=30%): Gentle nudge to consider /handoff
    - PREPARE (<=20%): Stronger warning to finish up and run /handoff
    - CRITICAL (<=10%): Urgent — run /handoff now

    Args:
        percent_remaining: Percentage of context remaining
        tokens_used: Estimated tokens used (may be None if from fallback)
        max_tokens: Maximum context window (may be None if from fallback)
        context_id: Current context ID (if any)
        tool_name: Tool that triggered this check

    Returns:
        System reminder markdown
    """
    # Format usage info — handle None when from context.json fallback
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
        # SUGGEST tier (<=30%)
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
    Check if context needs to transition to implementing mode.

    This handles two cases:
    1. Plan was approved (pending_implementation) and implementation tools are used
    2. Plan was in planning mode but permission_mode is no longer "plan"
       (e.g., after /clear which clears permissions and pastes the plan)

    If we're seeing tool usage (Edit, Write, Bash) and either:
    - Context is in "pending_implementation", OR
    - Context is in "planning" and permission_mode is not "plan"
    We transition to "implementing".

    Args:
        hook_input: Hook input data from Claude Code
    """
    # Only transition on tools that indicate implementation work
    implementation_tools = {"Edit", "Write", "Bash", "NotebookEdit"}
    tool_name = hook_input.get("tool_name", "")

    if tool_name not in implementation_tools:
        return

    project_root = project_dir(hook_input)
    session_id = hook_input.get("session_id")

    if not session_id:
        return

    # Get context for this session
    context = get_context_by_session_id(session_id, project_root)
    if not context:
        return

    if not context.in_flight:
        return

    current_mode = context.in_flight.mode
    permission_mode = hook_input.get("permission_mode", "default")

    # Transition from pending_implementation to implementing
    if current_mode == "pending_implementation":
        eprint(f"[context_monitor] Transitioning {context.id} from pending_implementation to implementing")
        update_plan_status(context.id, "implementing", project_root=project_root)

    # Transition from planning to implementing if permission_mode is not "plan"
    elif current_mode == "planning" and permission_mode != "plan":
        eprint(f"[context_monitor] Transitioning {context.id} from planning to implementing (permission_mode={permission_mode})")
        update_plan_status(context.id, "implementing", project_root=project_root)


def _try_progressive_save(hook_input: dict, percent_remaining: int) -> None:
    """
    Silently save auto-state at SAVE_STATE_THRESHOLD (60%).

    Uses a marker file in the context folder to ensure this fires only
    once per session. The marker is the session_id written to a file.

    Args:
        hook_input: Hook input data from Claude Code
        percent_remaining: Current context percentage remaining
    """
    try:
        session_id = hook_input.get("session_id", "")
        if not session_id:
            return

        project_root = project_dir(hook_input)
        context = get_context_by_session_id(session_id, project_root)
        if not context:
            return

        from lib.base.constants import get_context_dir
        marker_path = get_context_dir(context.id, project_root) / _PROGRESSIVE_SAVE_MARKER
        # Check if already saved for this session
        if marker_path.exists():
            try:
                saved_session = marker_path.read_text(encoding="utf-8").strip()
                if saved_session == session_id:
                    return  # Already saved this session
            except OSError:
                pass

        eprint(f"[context_monitor] Progressive save at {percent_remaining}% remaining")

        in_flight_mode = context.in_flight.mode if context.in_flight else "none"
        plan_path = context.in_flight.artifact_path if context.in_flight else None
        handoff_path = context.in_flight.handoff_path if context.in_flight else None
        transcript_path = hook_input.get("transcript_path")

        saved = save_auto_state(
            context_id=context.id,
            session_id=session_id,
            save_reason="progressive",
            project_root=project_root,
            in_flight_mode=in_flight_mode,
            plan_path=plan_path,
            handoff_path=handoff_path,
            transcript_path=transcript_path,
        )

        if saved:
            append_event(
                context.id, EVENT_AUTO_STATE_SAVED, project_root,
                session_id=session_id, save_reason="progressive",
            )
            # Write marker so we don't save again this session
            try:
                marker_path.write_text(session_id, encoding="utf-8")
            except OSError:
                pass

    except Exception as e:
        eprint(f"[context_monitor] Progressive save error (non-fatal): {e}")


def check_context_level(hook_input: dict) -> Optional[str]:
    """
    Check context level and return warning if low.

    Optimized for fail-fast: checks cheap conditions first before any file I/O.

    Args:
        hook_input: Hook input data from Claude Code

    Returns:
        System reminder string if context is low, None otherwise
    """
    # === FAST PATH: Try hook input first, then context.json fallback ===

    # get_context_percent_remaining tries hook input first (fast dict access),
    # then falls back to context.json (written by status_line.py)
    percent_remaining, tokens_used, max_tokens = get_context_percent_remaining(hook_input)

    if percent_remaining is None:
        return None  # No data available from either source

    # 3. Most common case: context is fine, exit early
    if percent_remaining > SAVE_STATE_THRESHOLD:
        return None

    # === PROGRESSIVE SAVE: At 60% remaining, silently save auto-state ===
    if percent_remaining > HANDOFF_SUGGEST_THRESHOLD:
        # Only save once per session (check marker file)
        _try_progressive_save(hook_input, percent_remaining)
        return None

    # === SLOW PATH: Only reached when context is low (rare) ===

    # Log since we're in warning territory
    if tokens_used is not None and max_tokens is not None:
        eprint(f"[context_monitor] Context: {percent_remaining}% remaining "
               f"(~{tokens_used//1000}k/{max_tokens//1000}k tokens)")
    else:
        eprint(f"[context_monitor] Context: ~{percent_remaining}% remaining (from context.json)")

    # Get current context for handoff info (file I/O)
    project_root = project_dir(hook_input)
    context_id = get_current_context_id(project_root)

    tool_name = hook_input.get("tool_name", "Unknown")

    return get_context_warning(
        percent_remaining,
        tokens_used,
        max_tokens,
        context_id,
        tool_name
    )


def main():
    """
    Main entry point for PostToolUse hook.

    Reads hook input from stdin, checks for mode transitions,
    and prints system reminder if context is low.
    """
    try:
        # Read hook input using shared utility
        hook_input = load_hook_input()

        if not hook_input:
            return

        # Always check for mode transitions on implementation tools
        # This handles the case where /clear pastes the plan with non-plan permission mode
        check_and_transition_mode(hook_input)

        # Check context level
        warning = check_context_level(hook_input)

        if warning:
            # Emit via utility so Claude sees the warning
            # Plain stdout from PostToolUse only goes to verbose mode, not Claude's context
            emit_context(warning)

    except Exception as e:
        eprint(f"[context_monitor] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
