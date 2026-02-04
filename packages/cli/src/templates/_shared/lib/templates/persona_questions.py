"""Persona-based question templates for plan clarification.

Uses distinct reasoning lenses to surface hidden constraints and assumptions.
"""

from dataclasses import dataclass
from typing import List, Dict


@dataclass
class PersonaQuestion:
    """A clarifying question from a specific persona lens."""

    persona: str
    display_name: str
    question: str
    purpose: str


CLARIFICATION_PERSONAS: Dict[str, List[PersonaQuestion]] = {
    "problem_validator": [
        PersonaQuestion(
            persona="problem_validator",
            display_name="Questioning the Problem",
            question="Can you describe the problem you're trying to solve without mentioning the solution?",
            purpose="Separates problem from solution to check alignment",
        ),
        PersonaQuestion(
            persona="problem_validator",
            display_name="Challenging the Approach",
            question="What's the simplest possible way to achieve this outcome that we haven't considered?",
            purpose="Identifies potential over-engineering",
        ),
    ],
    "assumption_validator": [
        PersonaQuestion(
            persona="assumption_validator",
            display_name="Surfacing Assumptions",
            question="What must already be true about your users, systems, or constraints for this to succeed?",
            purpose="Surfaces foundational assumptions that could invalidate the plan",
        ),
        PersonaQuestion(
            persona="assumption_validator",
            display_name="Hidden Dependencies",
            question="What are you assuming 'everyone knows' about this problem that might not be documented?",
            purpose="Uncovers implicit knowledge that needs to be made explicit",
        ),
    ],
    "user_advocate": [
        PersonaQuestion(
            persona="user_advocate",
            display_name="Understanding Users",
            question="Who specifically will use this, and what problem does it solve for them today?",
            purpose="Grounds the plan in actual user needs",
        ),
        PersonaQuestion(
            persona="user_advocate",
            display_name="Impact Assessment",
            question="If we did nothing, what would happen? Who would be affected?",
            purpose="Establishes urgency and stakes",
        ),
    ],
    "tradeoff_illuminator": [
        PersonaQuestion(
            persona="tradeoff_illuminator",
            display_name="Revealing Trade-offs",
            question="What are you willing to sacrifice (scope, time, quality, features) to make this work?",
            purpose="Forces explicit prioritization",
        ),
        PersonaQuestion(
            persona="tradeoff_illuminator",
            display_name="Foreclosed Options",
            question="What becomes harder or impossible to do later if we proceed this way?",
            purpose="Surfaces opportunity costs and lock-in risks",
        ),
    ],
}


def get_all_persona_questions() -> List[PersonaQuestion]:
    """Get all persona questions as a flat list."""
    questions = []
    for persona_qs in CLARIFICATION_PERSONAS.values():
        questions.extend(persona_qs)
    return questions


def format_questions_for_prompt() -> str:
    """Format persona questions for injection into Claude prompt."""
    lines = [
        "### Persona-Based Clarifying Questions",
        "",
        "Ask 5-8 questions from these perspectives using AskUserQuestion:",
        "",
    ]

    for persona_qs in CLARIFICATION_PERSONAS.values():
        for q in persona_qs:
            lines.append(f"**{q.display_name}**")
            lines.append(f'- Q: "{q.question}"')
            lines.append(f"- Purpose: {q.purpose}")
            lines.append("")

    lines.extend(
        [
            "**Guidance:**",
            "- Select questions most relevant to THIS plan (skip if already answered)",
            "- Ask one at a time with clear context",
            "- Use answers to refine the plan before ExitPlanMode",
        ]
    )

    return "\n".join(lines)
