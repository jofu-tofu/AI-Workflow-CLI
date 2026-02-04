#!/usr/bin/env python3
"""PreToolUse hook for TaskCreate - assesses atomicity and forkability via inference.

Ensures tasks contain sufficient self-contained context for independent execution,
especially when delegated to subagents with zero conversation history.

Non-blocking: Warns but allows creation even if atomicity is poor.
"""

import json
import sys
from pathlib import Path

# Path setup
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import (
    load_hook_input,
    validate_hook_event,
    get_tool_input,
    safe_hook_main,
    run_hook,
)
from lib.base.utils import eprint
from lib.base.subprocess_utils import is_internal_call
from lib.base.inference import inference

# Prompt engineered per Prompting/Standards.md:
# - Markdown-only (no XML)
# - Positive framing (tell what TO do)
# - 1-3 clear examples matching desired output
# - Direct imperative instructions
# - Explicit JSON output format

ASSESSMENT_SYSTEM_PROMPT = """You assess task descriptions for atomicity and forkability.

## Definitions

**Atomic Task:** Contains ALL context needed for independent execution without reading prior conversation.

**Forkable Task:** Can be delegated to a subagent with ZERO conversation history and still be completed successfully.

## Signs of Non-Atomic Tasks

Look for these indicators:
- Contextual references: "the file above", "as discussed", "the mentioned function", "this bug"
- Vague descriptions assuming prior knowledge: "fix the bug", "update it", "finish the work"
- Missing specifics: which file? what function? what expected behavior? what error?
- Pronouns without antecedents: "it", "they", "the issue" without explicit definition

## Signs of Atomic Tasks

Well-specified tasks include:
- Explicit file paths: "Edit src/utils/parser.py"
- Specific function names: "Modify the validate_input() function"
- Clear expected behavior: "Should return 404 when user not found"
- Complete error context: "TypeError on line 45 when input is None"

## Examples

**Example 1: Non-Atomic Task**
Subject: "Fix the bug"
Description: "The issue we discussed earlier needs to be resolved"
Assessment: NOT atomic (no file, no function, no error details, references "discussed earlier")

**Example 2: Atomic Task**
Subject: "Fix null pointer in user lookup"
Description: "In src/services/user.py, the get_user_by_id() function raises TypeError when user_id is None. Add null check at line 23 that returns None early instead of calling database.query()."
Assessment: Atomic (file path, function name, specific error, exact fix location, expected behavior)

**Example 3: Partially Atomic Task**
Subject: "Add validation to form"
Description: "Add email validation to the signup form. Return error message if invalid."
Assessment: NOT fully atomic (missing: which file contains the form? what validation rules? where to display error?)

## Output Format

Respond with valid JSON only:
{
  "atomic": true/false,
  "forkable": true/false,
  "issues": ["specific issue 1", "specific issue 2"],
  "recommendation": "brief actionable suggestion if issues exist, or 'Task is well-specified' if good"
}"""

ASSESSMENT_USER_TEMPLATE = """Assess this task for atomicity and forkability:

**Subject:** {subject}

**Description:** {description}

Evaluate whether a subagent with zero prior context could execute this task successfully."""


@safe_hook_main("task_create_atomicity")
def main() -> int:
    # Skip internal calls (prevents recursion from orchestrator/inference)
    if is_internal_call():
        return 0

    # Load and validate hook input
    payload = load_hook_input()
    if not payload:
        return 0

    # Only process TaskCreate
    if not validate_hook_event(payload, "PreToolUse", "TaskCreate"):
        return 0

    tool_input = get_tool_input(payload)
    if not tool_input:
        return 0

    subject = tool_input.get("subject", "")
    description = tool_input.get("description", "")

    # Skip very short tasks (likely intentionally brief or simple acknowledgments)
    if len(description.strip()) < 15:
        return 0

    # Call inference to assess atomicity and forkability
    result = inference(
        system_prompt=ASSESSMENT_SYSTEM_PROMPT,
        user_prompt=ASSESSMENT_USER_TEMPLATE.format(
            subject=subject,
            description=description
        ),
        level="fast",  # Use Haiku for minimal latency (~1-2s)
        timeout=12,    # Allow up to 12s for inference
    )

    if not result.success:
        eprint(f"[task_create_atomicity] Inference failed: {result.error}")
        return 0  # Non-blocking on failure

    # Parse JSON response
    try:
        # Handle potential markdown code blocks in response
        output = result.output.strip()
        if output.startswith("```"):
            # Extract JSON from code block
            lines = output.split("\n")
            json_lines = []
            in_block = False
            for line in lines:
                if line.startswith("```") and not in_block:
                    in_block = True
                    continue
                elif line.startswith("```") and in_block:
                    break
                elif in_block:
                    json_lines.append(line)
            output = "\n".join(json_lines)

        assessment = json.loads(output)
    except json.JSONDecodeError:
        eprint(f"[task_create_atomicity] Failed to parse inference response: {result.output[:100]}")
        return 0

    # Extract assessment fields
    atomic = assessment.get("atomic", True)
    forkable = assessment.get("forkable", True)
    issues = assessment.get("issues", [])
    recommendation = assessment.get("recommendation", "")

    # Build context message based on assessment
    if atomic and forkable:
        # Task is good - minimal positive feedback
        context_msg = "Task Assessment: Well-specified and forkable."
    else:
        # Task has issues - inject detailed warning
        status_parts = []
        if not atomic:
            status_parts.append("NOT ATOMIC")
        if not forkable:
            status_parts.append("NOT FORKABLE")

        issues_text = "\n".join(f"- {issue}" for issue in issues) if issues else "- See recommendation below"

        context_msg = f"""**TASK ATOMICITY WARNING** ({', '.join(status_parts)})

This task may lack sufficient context for independent execution by a subagent.

**Issues detected:**
{issues_text}

**Recommendation:** {recommendation}

Consider adding specific file paths, function names, expected behaviors, or error details before creating this task."""

    # Output hook response with additionalContext
    out = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": context_msg
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    run_hook(main)
