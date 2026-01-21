"""
CC-Native Reviewers Base Module.

Provides shared constants and types for plan reviewers.
"""

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List

# Import from parent lib
_lib_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_lib_dir))

from utils import ReviewerResult, REVIEW_SCHEMA

# Re-export for convenience
__all__ = [
    "ReviewerResult",
    "REVIEW_SCHEMA",
    "REVIEW_PROMPT_PREFIX",
    "AGENT_REVIEW_PROMPT_PREFIX",
    "AgentConfig",
    "OrchestratorConfig",
]


# ---------------------------
# Agent Configuration
# ---------------------------

@dataclass
class AgentConfig:
    """Configuration for a Claude Code review agent."""
    name: str
    model: str = "sonnet"
    focus: str = ""
    enabled: bool = True
    categories: List[str] = field(default_factory=lambda: ["code"])
    description: str = ""
    tools: str = ""


@dataclass
class OrchestratorConfig:
    """Configuration for the plan orchestrator."""
    enabled: bool = True
    model: str = "haiku"
    timeout: int = 30
    max_turns: int = 3


# ---------------------------
# Shared Review Prompt Text
# ---------------------------

REVIEW_PROMPT_PREFIX = """You are a senior staff software engineer acting as a strict plan reviewer.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)
"""

AGENT_REVIEW_PROMPT_PREFIX = """IMPORTANT: You must analyze this plan and output your review immediately using StructuredOutput. Do NOT ask questions or request clarification - analyze what is provided and give your assessment.

You are a senior staff software engineer acting as a strict plan reviewer.

Review the PLAN below. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)

Analyze the plan now and call StructuredOutput with your verdict (pass/warn/fail), summary, issues array, missing_sections array, and questions array.
"""
