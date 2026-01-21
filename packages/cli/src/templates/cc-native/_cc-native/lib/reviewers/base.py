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

AGENT_REVIEW_PROMPT_PREFIX = """# SINGLE-TURN PLAN REVIEW

## CRITICAL: ONE TURN ONLY
You have exactly ONE response to complete this review. Do NOT attempt multi-step workflows, context queries, or phased analysis. Analyze the plan and output your review immediately.

## YOUR TASK
Review the plan below from your area of expertise. Then call StructuredOutput with your assessment.

## REQUIRED OUTPUT (all fields must have content)
Call StructuredOutput with:
- **verdict**: "pass" (no concerns), "warn" (some concerns), or "fail" (critical issues)
- **summary**: 2-3 sentences with your overall assessment and key findings (REQUIRED)
- **issues**: Array of concerns found. Format each as:
  {"severity": "high/medium/low", "category": "...", "issue": "...", "suggested_fix": "..."}
- **missing_sections**: Topics the plan should address but doesn't
- **questions**: Things that need clarification before implementation

## IMPORTANT RULES
1. A "warn" verdict MUST include at least one issue explaining why
2. Summary MUST explain your reasoning, not just "looks good" or empty
3. Focus on your expertise area (architecture, security, performance, etc.)
4. Output StructuredOutput NOW - no other tools, no questions, no delays
"""
