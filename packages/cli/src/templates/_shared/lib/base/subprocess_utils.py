"""Utilities for subprocess calls that invoke Claude Code CLI.

Provides centralized management of environment flags for internal subprocess calls
(orchestrator, agents, inference) to prevent recursion and unnecessary hook overhead.
"""
import os
from typing import Dict

# Environment variable names - single source of truth
ENV_INTERNAL_CALL = "AIWCLI_INTERNAL_CALL"


def get_internal_subprocess_env() -> Dict[str, str]:
    """Get environment dict for internal Claude Code subprocess calls.

    This prevents internal subprocess calls (orchestrator, agents, inference)
    from triggering hooks that would cause recursion or unnecessary overhead.

    All hooks should check is_internal_call() and return early if True.

    Returns:
        Environment dict with AIWCLI_INTERNAL_CALL flag set

    Example:
        >>> env = get_internal_subprocess_env()
        >>> subprocess.run(['claude', '--agent', 'my-agent'], env=env)
    """
    env = os.environ.copy()
    env[ENV_INTERNAL_CALL] = 'true'
    return env


def is_internal_call() -> bool:
    """Check if current process is an internal subprocess call.

    Hooks should check this at the beginning and return early to avoid
    recursion and unnecessary processing for internal subprocess calls.

    Returns:
        True if this is an internal call that should skip hooks

    Example:
        >>> if is_internal_call():
        ...     return  # Skip hook processing
    """
    return os.environ.get(ENV_INTERNAL_CALL) == 'true'
