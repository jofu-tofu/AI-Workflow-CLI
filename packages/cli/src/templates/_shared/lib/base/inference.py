"""Inference utility for AI-powered text processing.

Provides a unified interface for Claude API calls using the claude CLI.
Supports multiple model tiers: fast (Haiku), standard (Sonnet), smart (Opus).
"""
import subprocess
import sys
import os
from typing import Optional
from dataclasses import dataclass


@dataclass
class InferenceResult:
    """Result from an inference call."""
    success: bool
    output: str
    error: Optional[str] = None
    latency_ms: int = 0


# Model configurations
MODELS = {
    "fast": "claude-3-haiku-20240307",
    "standard": "claude-sonnet-4-20250514",
    "smart": "claude-opus-4-20250514",
}

TIMEOUTS = {
    "fast": 15,      # 15 seconds
    "standard": 30,  # 30 seconds
    "smart": 90,     # 90 seconds
}


def inference(
    system_prompt: str,
    user_prompt: str,
    level: str = "fast",
    timeout: Optional[int] = None,
) -> InferenceResult:
    """
    Run inference using the claude CLI.

    Args:
        system_prompt: System instructions for the model
        user_prompt: User message to process
        level: Model level - "fast" (Haiku), "standard" (Sonnet), "smart" (Opus)
        timeout: Custom timeout in seconds (uses level default if not specified)

    Returns:
        InferenceResult with success status, output, and any error
    """
    import time
    start_time = time.time()

    model = MODELS.get(level, MODELS["fast"])
    timeout_sec = timeout or TIMEOUTS.get(level, TIMEOUTS["fast"])

    # Combine prompts
    full_prompt = f"{system_prompt}\n\n{user_prompt}"

    # Build command
    cmd = [
        "claude",
        "--model", model,
        "--print",
        "--no-hooks",
        "-p", full_prompt,
    ]

    # Remove ANTHROPIC_API_KEY to force subscription auth
    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            env=env,
            # Windows needs shell=True for command resolution
            shell=(sys.platform == "win32"),
        )

        latency_ms = int((time.time() - start_time) * 1000)

        if result.returncode != 0:
            return InferenceResult(
                success=False,
                output=result.stdout.strip() if result.stdout else "",
                error=result.stderr.strip() if result.stderr else f"Exit code: {result.returncode}",
                latency_ms=latency_ms,
            )

        return InferenceResult(
            success=True,
            output=result.stdout.strip(),
            latency_ms=latency_ms,
        )

    except subprocess.TimeoutExpired:
        latency_ms = int((time.time() - start_time) * 1000)
        return InferenceResult(
            success=False,
            output="",
            error=f"Timeout after {timeout_sec}s",
            latency_ms=latency_ms,
        )
    except FileNotFoundError:
        latency_ms = int((time.time() - start_time) * 1000)
        return InferenceResult(
            success=False,
            output="",
            error="claude CLI not found",
            latency_ms=latency_ms,
        )
    except Exception as e:
        latency_ms = int((time.time() - start_time) * 1000)
        return InferenceResult(
            success=False,
            output="",
            error=str(e),
            latency_ms=latency_ms,
        )


# System prompt for generating context ID summaries
CONTEXT_ID_SYSTEM_PROMPT = """Generate a 10-word summary of what the user wants to do. Start with a gerund (verb ending in -ing).

Rules:
- Exactly 10 words
- Start with gerund: Creating, Fixing, Adding, Updating, Implementing, etc.
- Be specific about the task
- No punctuation
- No quotes

Examples:
- "I want to add user authentication" -> "Adding user authentication with JWT tokens to the web app"
- "Fix the bug in the login flow" -> "Fixing critical bug in user login flow validation logic"
- "Can you help me refactor this code" -> "Refactoring legacy code for better maintainability and cleaner architecture"
- "Update the README with new instructions" -> "Updating README with new setup instructions and configuration examples"

Output ONLY the 10-word summary, nothing else."""


def generate_semantic_summary(prompt: str, timeout: int = 15) -> Optional[str]:
    """
    Generate a semantic 10-word summary of a user prompt.

    Uses Sonnet for quality inference. Returns None if inference fails.

    Args:
        prompt: User prompt to summarize
        timeout: Timeout in seconds (default 15)

    Returns:
        10-word summary string or None if failed
    """
    # Pass full prompt - AI can summarize any length into 10 words
    result = inference(
        system_prompt=CONTEXT_ID_SYSTEM_PROMPT,
        user_prompt=prompt,
        level="standard",
        timeout=timeout,
    )

    if not result.success or not result.output:
        return None

    # Clean up the output
    summary = result.output.strip()
    # Remove any quotes
    summary = summary.strip('"\'')
    # Remove trailing punctuation
    summary = summary.rstrip('.!?')

    # Validate it starts with a gerund (capital letter + letters + "ing")
    import re
    if not re.match(r'^[A-Z][a-z]*ing\b', summary):
        return None

    # Validate roughly 10 words (allow 8-12 for flexibility)
    words = summary.split()
    if len(words) < 8 or len(words) > 12:
        return None

    return summary
