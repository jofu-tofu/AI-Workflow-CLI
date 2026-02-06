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

ASSESSMENT_SYSTEM_PROMPT = """Assess whether a task description is self-contained enough for a subagent with zero conversation history to execute it.

## What Makes a Good Task

A well-specified task includes:
- Explicit file paths: "Edit src/utils/parser.py"
- Specific function/component names: "Modify validate_input()"
- Clear expected behavior: "Return 404 when user not found"
- Concrete error context: "TypeError on line 45 when input is None"

## What Makes a Poor Task

Watch for context-dependent references:
- Dangling references: "the file above", "as discussed", "this bug"
- Vague actions: "fix the bug", "update it", "finish the work"
- Pronouns without antecedents: "it", "they", "the issue"
- Missing specifics: which file? what function? what behavior?

## Examples

**Atomic** — Subject: "Fix null pointer in user lookup"
Description: "In src/services/user.py, get_user_by_id() raises TypeError when user_id is None. Add null check at line 23 to return None instead of calling database.query()."
Why: file path, function, error, fix location, expected behavior.

**Not atomic** — Subject: "Fix the bug"
Description: "The issue we discussed earlier needs to be resolved"
Why: no file, no function, no error details, references conversation history.

**Partially atomic** — Subject: "Add validation to form"
Description: "Add email validation to the signup form. Return error if invalid."
Why: missing which file, what validation rules, where to display error.

## Output

Respond with JSON only:
{"atomic": true/false, "forkable": true/false, "issues": ["issue 1", "issue 2"], "recommendation": "actionable suggestion or 'Well-specified'"}"""

ASSESSMENT_USER_TEMPLATE = """**Subject:** {subject}
**Description:** {description}

Could a subagent with zero conversation history execute this task?"""


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
        context_msg = "Task assessment: well-specified and ready for delegation."
    else:
        # Constructive guidance — what to add, not what's wrong
        issues_text = "\n".join(f"- {issue}" for issue in issues) if issues else ""

        context_msg = f"""**Enrich this task for subagent delegation**

A subagent receiving this task will have no conversation history. To make it actionable:

{issues_text}

**Suggested enrichment:** {recommendation}"""

    # Output hook response with additionalContext
    out = {
        "hookSpecificOutput": {
            "additionalContext": context_msg
        }
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    run_hook(main)
