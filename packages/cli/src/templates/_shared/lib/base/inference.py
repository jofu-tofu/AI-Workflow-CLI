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


# Minimum word length for context IDs (filters out short words like "I", "a", "to", "is")
MIN_WORD_LENGTH = 3

# Maximum number of words in context ID
MAX_WORDS = 10


def filter_short_words(text: str) -> str:
    """Filter words by minimum length, keeping only words with 3+ characters.

    This replaces the stopword list approach - a 3-char minimum naturally
    filters out most function words (the, to, a, an, of, on, is, it, etc.)
    """
    # Handle contractions by replacing apostrophes before splitting
    text = text.replace("'", " ").replace("'", " ")
    words = text.lower().split()
    # Filter to words with 3+ characters and limit to MAX_WORDS
    filtered = [w for w in words if len(w) >= MIN_WORD_LENGTH][:MAX_WORDS]
    return ' '.join(filtered)


# System prompt for generating context ID summaries (recognition-focused, not summarization)
CONTEXT_ID_SYSTEM_PROMPT = """Generate a memorable context ID that helps instantly recall what was being worked on.

This is for RECOGNITION - the user will see this ID in a list and needs to immediately remember "oh yeah, THAT session."

Rules:
- Output 3-6 words that capture the DISTINCTIVE essence
- Lead with the ACTION (verb) being taken
- Include the SPECIFIC target (file name, feature name, component name)
- Prefer proper nouns and specific names over generic categories
- NO function words: the, to, with, for, in, a, an, of, on, is, it, and, or
- NO generic padding: code, project, app, webapp, system, implementation
- No punctuation, no quotes

Examples:
- "I want to add user authentication using JWT" -> "adding jwt auth user-service"
- "Fix the bug in the login flow where users get redirected to a 404" -> "fixing login 404 redirect bug"
- "Can you help me refactor the PaymentProcessor class" -> "refactoring paymentprocessor class"
- "Update the README with new installation instructions" -> "readme installation instructions"
- "Search for where the context ID extraction prompt is" -> "search context extraction prompt"

Output ONLY the words separated by spaces, nothing else."""


def generate_semantic_summary(prompt: str, timeout: int = 15) -> Optional[str]:
    """
    Generate a keyword summary of a user prompt.

    Uses Sonnet for quality inference. Returns None if inference fails.

    Args:
        prompt: User prompt to summarize
        timeout: Timeout in seconds (default 15)

    Returns:
        Keyword summary string (5-10 words) or None if failed
    """
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

    # Filter to words with 3+ characters (removes short function words)
    summary = filter_short_words(summary)

    # Validate 3-10 words (allow flexibility for short prompts)
    words = summary.split()
    if len(words) < 3 or len(words) > 10:
        return None

    return summary
