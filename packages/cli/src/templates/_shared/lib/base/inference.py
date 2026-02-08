"""Inference utility for AI-powered text processing.

Provides a unified interface for Claude API calls using the claude CLI.
Supports multiple model tiers: fast (Haiku), standard (Sonnet), smart (Opus).
"""
import json
import re
import subprocess
import sys
import os
from typing import Optional

from .logger import log_debug, log_info, log_warn, log_error
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


# Stop words for filtering (from corpus analysis of 1,424 documents)
from .stop_words import STOP_WORDS


def filter_stop_words(text: str) -> str:
    """Remove stop words from text, keeping only content keywords."""
    words = text.lower().split()
    filtered = [w for w in words if w not in STOP_WORDS and len(w) > 1]
    return ' '.join(filtered)


# System prompt for generating context ID summaries (keyword extraction for recognition)
CONTEXT_ID_SYSTEM_PROMPT = """Extract 6-12 keywords from what the user wants to do.

Rules:
- Output 6-12 keywords only
- Keywords: nouns, verbs, adjectives, technical terms, proper names
- NO function words: the, to, with, for, in, a, an, of, on, is, it, and, or, that, this, be, as, at, by, from
- Most important/specific words preferred
- No punctuation, no quotes

Examples:
- "I want to add user authentication" -> "add user authentication login security JWT tokens webapp service"
- "Fix the bug in the login flow" -> "fix bug login flow validation error redirect session auth handler"
- "Can you help me refactor this code" -> "refactor code cleanup architecture maintainability legacy modules structure patterns"
- "Update the README with new instructions" -> "update README documentation instructions setup configuration install guide steps"

Output ONLY the keywords separated by spaces, nothing else."""


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

    # Filter stop words
    summary = filter_stop_words(summary)

    # Validate 6-12 words for sufficient context
    words = summary.split()
    if len(words) < 6 or len(words) > 12:
        return None

    return summary


# System prompt for generating context ID slugs (8-12 word summary phrases for folder names)
CONTEXT_ID_SLUG_PROMPT = """You generate short title phrases for work sessions. These become folder names like `260206-1959-fix-auth-middleware-redirect-loop-session-timeout`.

Users scan 100+ such names to find past sessions. Your title must make THIS session instantly recognizable.

Rules:
- Exactly 8-12 lowercase words
- First word is an action verb (fix, add, implement, refactor, update, create, remove, optimize, debug, migrate, integrate, configure, deploy, scaffold, restructure)
- Coherent phrase, not disjointed keywords — reads like a short task description
- Prefer specific technical terms over generic words
- No articles (the, a, an), no pronouns, no filler words, no punctuation, no quotes
- Input may come from speech-to-text with filler words (uh, um, like, you know, basically, so) — ignore them entirely

Examples:

Input: "um so basically I need to like fix the auth bug in the login page"
{"slug": "fix authentication bug login page redirect session handling flow"}

Input: "hey uh can we add dark mode to the settings page"
{"slug": "add dark mode toggle settings page user preference storage"}

Input: "the context ids are bad can we change how we generate them towards a summary"
{"slug": "improve context id generation use prompt summary slugs"}

Input: "I want to refactor the database connection pooling for PostgreSQL"
{"slug": "refactor postgresql database connection pooling optimize query performance"}

Input: "so like you know the webhook retry logic is broken and stuff"
{"slug": "fix webhook retry logic broken error handling recovery mechanism"}

Input: "update the CI pipeline to cache node modules between runs"
{"slug": "update ci pipeline cache node modules between workflow runs"}

Respond with ONLY a JSON object: {"slug": "your 8-12 word phrase here"}"""


def generate_context_id_slug(prompt: str, timeout: int = 3) -> Optional[str]:
    """
    Generate a 5-12 word context ID slug from a user prompt using AI inference.

    Uses Haiku (fast tier) for low-latency summary generation within hook timeout budgets.
    Prompts for JSON output {"slug": "..."} with fallback to raw text parsing.

    Args:
        prompt: Raw user prompt to summarize (may include STT filler words)
        timeout: Timeout in seconds (default 3, fits within 5-10s hook budget)

    Returns:
        Space-separated summary slug (5-12 words) or None if failed
    """
    # Truncate input to 500 chars to keep inference fast
    truncated = prompt[:500] if len(prompt) > 500 else prompt

    result = inference(
        system_prompt=CONTEXT_ID_SLUG_PROMPT,
        user_prompt=truncated,
        level="fast",
        timeout=timeout,
    )

    if not result.success or not result.output:
        log_warn("inference", f"Context ID slug inference failed: {result.error}")
        return None

    raw = result.output.strip()

    # Parse JSON response {"slug": "..."}, fall back to raw text
    slug = None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and "slug" in parsed:
            slug = parsed["slug"]
    except (json.JSONDecodeError, TypeError):
        pass

    if not slug:
        # Fallback: treat entire output as raw text
        slug = raw

    # Clean: strip quotes, punctuation, hyphens
    slug = slug.strip('"\'`')
    slug = slug.rstrip('.!?')
    slug = slug.replace('-', ' ')

    # Remove non-alphanumeric chars (except spaces)
    slug = re.sub(r'[^a-zA-Z0-9 ]', '', slug)

    # Normalize whitespace
    slug = re.sub(r'\s+', ' ', slug).strip()

    words = slug.split()

    # Validate word count: truncate if over 12, reject if under 5
    if len(words) > 12:
        words = words[:12]
    if len(words) < 5:
        log_debug("inference", f"Context ID slug too short ({len(words)} words): '{slug}'")
        return None

    result_slug = ' '.join(words)
    log_debug("inference", f"Generated context ID slug: '{result_slug}' ({result.latency_ms}ms)")
    return result_slug
