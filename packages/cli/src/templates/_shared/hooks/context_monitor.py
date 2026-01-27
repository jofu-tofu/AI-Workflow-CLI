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
import json
import os
import sys
from pathlib import Path
from typing import Optional, Tuple

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.utils import eprint, project_dir
from lib.context.context_manager import (
    get_all_contexts,
    get_context_by_session_id,
    update_plan_status,
)

# Configuration
LOW_CONTEXT_THRESHOLD = 40  # Warn when below 40% remaining
CRITICAL_CONTEXT_THRESHOLD = 25  # Urgent warning below 25%

# Context baseline: preloaded tokens not visible to hooks (~22.6k typical)
# This includes system prompt, tools, MCP tokens that aren't in hook data
CONTEXT_BASELINE = 22_600

# Approximate tokens per character (fallback when actual counts unavailable)
CHARS_PER_TOKEN = 4

# Default context window size (used when not provided in hook input)
DEFAULT_CONTEXT_WINDOW = 200_000


def get_context_tokens_from_hook(hook_input: dict) -> Tuple[Optional[int], Optional[int]]:
    """
    Extract actual token counts from Claude Code hook input.

    Claude Code provides context_window data with actual token counts:
    - cache_read_input_tokens: Tokens read from cache
    - input_tokens: New input tokens
    - cache_creation_input_tokens: Tokens written to cache
    - output_tokens: Model output tokens

    Args:
        hook_input: Hook input data from Claude Code

    Returns:
        Tuple of (tokens_used, max_tokens) or (None, None) if not available
    """
    context_window = hook_input.get("context_window")
    if not context_window:
        return None, None

    current_usage = context_window.get("current_usage")
    if not current_usage:
        return None, None

    # Sum all token types
    cache_read = current_usage.get("cache_read_input_tokens", 0) or 0
    input_tokens = current_usage.get("input_tokens", 0) or 0
    cache_creation = current_usage.get("cache_creation_input_tokens", 0) or 0
    output_tokens = current_usage.get("output_tokens", 0) or 0

    content_tokens = cache_read + input_tokens + cache_creation + output_tokens

    # Add baseline for system prompt, tools, MCP tokens not in hook data
    tokens_used = content_tokens + CONTEXT_BASELINE

    # Get max context window from hook input
    max_tokens = context_window.get("context_window_size") or DEFAULT_CONTEXT_WINDOW

    return tokens_used, max_tokens


def estimate_transcript_tokens(transcript_path: str) -> Tuple[int, int]:
    """
    Fallback: Estimate token usage from transcript file character count.

    This is less accurate than actual token counts from hook input,
    but serves as a fallback when context_window data is unavailable.

    Args:
        transcript_path: Path to transcript.jsonl

    Returns:
        Tuple of (estimated_tokens, entry_count)
    """
    try:
        total_chars = 0
        entry_count = 0

        with open(transcript_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue

                try:
                    entry = json.loads(line)
                    # Count the full entry - messages, tool calls, results
                    total_chars += len(json.dumps(entry))
                    entry_count += 1
                except json.JSONDecodeError:
                    # Skip malformed lines
                    continue

        # Estimate tokens and add baseline for system/tools/MCP
        estimated_tokens = (total_chars // CHARS_PER_TOKEN) + CONTEXT_BASELINE
        return estimated_tokens, entry_count

    except FileNotFoundError:
        eprint(f"[context_monitor] Transcript not found: {transcript_path}")
        return CONTEXT_BASELINE, 0  # Return baseline as minimum
    except Exception as e:
        eprint(f"[context_monitor] Error reading transcript: {e}")
        return CONTEXT_BASELINE, 0


def calculate_context_remaining(
    hook_input: dict,
    transcript_path: Optional[str] = None
) -> Tuple[int, int, int]:
    """
    Calculate remaining context percentage.

    Uses actual token counts from hook input when available,
    falls back to transcript character estimation otherwise.

    Args:
        hook_input: Hook input data from Claude Code
        transcript_path: Path to transcript.jsonl (for fallback)

    Returns:
        Tuple of (percent_remaining, tokens_used, max_tokens)
    """
    # Try to get actual token counts from hook input
    tokens_used, max_tokens = get_context_tokens_from_hook(hook_input)

    if tokens_used is None or max_tokens is None:
        # context_window data not available - cannot accurately calculate
        # Transcript estimation is unreliable (transcript grows faster than actual context)
        # Log what we received for debugging
        context_window = hook_input.get("context_window")
        eprint(f"[context_monitor] context_window data unavailable: {context_window}")
        # Return None to indicate we can't calculate - don't use broken transcript estimation
        return None, None, None

    remaining = max_tokens - tokens_used
    percent_remaining = max(0, min(100, (remaining / max_tokens) * 100))

    return int(percent_remaining), tokens_used, max_tokens


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
    tokens_used: int,
    max_tokens: int,
    context_id: Optional[str],
    tool_name: str
) -> str:
    """
    Generate appropriate warning based on context level.

    Args:
        percent_remaining: Percentage of context remaining
        tokens_used: Estimated tokens used
        max_tokens: Maximum context window
        context_id: Current context ID (if any)
        tool_name: Tool that triggered this check

    Returns:
        System reminder markdown
    """
    # Format token counts
    tokens_used_k = tokens_used // 1000
    max_tokens_k = max_tokens // 1000

    if percent_remaining <= CRITICAL_CONTEXT_THRESHOLD:
        urgency = "CRITICAL"
        instruction = "You MUST wrap up immediately and create a handoff document."
    else:
        urgency = "LOW"
        instruction = "Please wrap up your current task and prepare for handoff."

    context_info = ""
    if context_id:
        context_info = f"""
To create a handoff document, use the /handoff command or describe:
- What you were working on
- What's completed
- What still needs to be done
- Any important decisions or context

Context ID: `{context_id}`"""

    return f"""<system-reminder>
## {urgency} CONTEXT WARNING ({percent_remaining}% remaining)

**Estimated usage**: ~{tokens_used_k}k / {max_tokens_k}k tokens
**Triggered by**: {tool_name} tool completion

{instruction}
{context_info}

**Actions:**
1. Complete your current atomic task (if 1-2 steps away)
2. Do NOT start new multi-step work
3. Create a handoff document summarizing progress
4. Ask user: "Context is getting low. I've summarized my progress. Should we continue in a new session?"
</system-reminder>"""


def check_and_transition_mode(hook_input: dict) -> None:
    """
    Check if context needs to transition from pending_implementation to implementing.

    This handles the case where a plan was approved and implementation has started,
    but the context mode wasn't updated. If we're seeing tool usage (Edit, Write, Bash)
    and the context is in "pending_implementation", we transition to "implementing".

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

    # Check if we need to transition
    if context.in_flight and context.in_flight.mode == "pending_implementation":
        eprint(f"[context_monitor] Transitioning {context.id} from pending_implementation to implementing")
        update_plan_status(context.id, "implementing", project_root=project_root)


def check_context_level(hook_input: dict) -> Optional[str]:
    """
    Check context level and return warning if low.

    Args:
        hook_input: Hook input data from Claude Code

    Returns:
        System reminder string if context is low, None otherwise
    """
    # First, check if we need to transition mode based on tool usage
    check_and_transition_mode(hook_input)

    transcript_path = hook_input.get("transcript_path")

    # Calculate context remaining (uses actual tokens when available)
    result = calculate_context_remaining(hook_input, transcript_path)

    # If context_window data unavailable, we can't accurately monitor
    if result[0] is None:
        return None

    percent_remaining, tokens_used, max_tokens = result

    # Log for debugging
    eprint(f"[context_monitor] Context: {percent_remaining}% remaining "
           f"(~{tokens_used//1000}k/{max_tokens//1000}k tokens)")

    # Check if we need to warn
    if percent_remaining > LOW_CONTEXT_THRESHOLD:
        return None

    # Get current context
    project_root = project_dir(hook_input)
    context_id = get_current_context_id(project_root)

    # Get tool name for context
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

    Reads hook input from stdin, estimates context usage,
    and prints system reminder if context is low.
    """
    try:
        # Read hook input from stdin
        input_data = sys.stdin.read().strip()

        if not input_data:
            return

        try:
            hook_input = json.loads(input_data)
        except json.JSONDecodeError:
            return

        # Check context level
        warning = check_context_level(hook_input)

        if warning:
            # Output JSON with additionalContext so Claude sees the warning
            # Plain stdout from PostToolUse only goes to verbose mode, not Claude's context
            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PostToolUse",
                    "additionalContext": warning
                }
            }
            print(json.dumps(output))

    except Exception as e:
        eprint(f"[context_monitor] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
