#!/usr/bin/env python3
"""Context monitor hook for proactive handoff warnings.

This hook runs on PostToolUse for context-heavy tools and monitors
context window usage by analyzing the transcript. When context drops
below a threshold, it injects a system reminder instructing Claude
to wrap up and create a handoff document.

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
    ...
}

Hook output:
- Prints system reminder to stdout if context is low
- Reminder instructs Claude to wrap up and create handoff
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

# Approximate tokens per character (conservative estimate)
CHARS_PER_TOKEN = 4

# Model context windows (tokens)
MODEL_CONTEXT_WINDOWS = {
    "claude-opus-4": 200_000,
    "claude-sonnet-4": 200_000,
    "claude-3-opus": 200_000,
    "claude-3-sonnet": 200_000,
    "claude-3-haiku": 200_000,
    "default": 200_000,
}


def get_model_context_window(model_name: Optional[str] = None) -> int:
    """Get context window size for a model."""
    if not model_name:
        return MODEL_CONTEXT_WINDOWS["default"]

    for prefix, window in MODEL_CONTEXT_WINDOWS.items():
        if prefix in model_name.lower():
            return window

    return MODEL_CONTEXT_WINDOWS["default"]


def estimate_transcript_tokens(transcript_path: str) -> Tuple[int, int]:
    """
    Estimate token usage from transcript file.

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

        estimated_tokens = total_chars // CHARS_PER_TOKEN
        return estimated_tokens, entry_count

    except FileNotFoundError:
        eprint(f"[context_monitor] Transcript not found: {transcript_path}")
        return 0, 0
    except Exception as e:
        eprint(f"[context_monitor] Error reading transcript: {e}")
        return 0, 0


def calculate_context_remaining(
    transcript_path: str,
    model_name: Optional[str] = None
) -> Tuple[int, int, int]:
    """
    Calculate remaining context percentage.

    Args:
        transcript_path: Path to transcript.jsonl
        model_name: Model name for context window lookup

    Returns:
        Tuple of (percent_remaining, tokens_used, max_tokens)
    """
    max_tokens = get_model_context_window(model_name)
    tokens_used, _ = estimate_transcript_tokens(transcript_path)

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
    if not transcript_path:
        eprint("[context_monitor] No transcript_path in hook input")
        return None

    # Get model name if available (not always present)
    model_name = hook_input.get("model")

    # Calculate context remaining
    percent_remaining, tokens_used, max_tokens = calculate_context_remaining(
        transcript_path, model_name
    )

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
            print(warning)

    except Exception as e:
        eprint(f"[context_monitor] ERROR: {e}")
        import traceback
        eprint(traceback.format_exc())


if __name__ == "__main__":
    main()
