"""
CC-Native Agent Reviewer Module.

Runs Claude Code agents to review plans.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Import from parent lib
_lib_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_lib_dir))

from utils import ReviewerResult, eprint, parse_json_maybe, coerce_to_review
from .base import AgentConfig, AGENT_REVIEW_PROMPT_PREFIX

# Import shared subprocess utilities
_shared_lib = Path(__file__).resolve().parent.parent.parent.parent / "_shared" / "lib" / "base"
sys.path.insert(0, str(_shared_lib))
from subprocess_utils import get_internal_subprocess_env


def _parse_claude_output(raw: str) -> Optional[Dict[str, Any]]:
    """Parse Claude CLI JSON output, handling various formats.

    Claude CLI can output in several formats:
    - Direct structured_output dict
    - Assistant message with StructuredOutput tool use
    - List of events with assistant messages

    Args:
        raw: Raw stdout from Claude CLI

    Returns:
        Parsed JSON dict or None if parsing failed
    """
    try:
        result = json.loads(raw)
        if isinstance(result, dict):
            if "structured_output" in result:
                eprint("[parse] Found structured_output in root dict")
                return result["structured_output"]
            if result.get("type") == "assistant":
                message = result.get("message", {})
                content = message.get("content", [])
                for item in content:
                    if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                        eprint("[parse] Found StructuredOutput in assistant message content")
                        return item.get("input", {})
                eprint("[parse] Assistant message found but no StructuredOutput tool use in content")
        elif isinstance(result, list):
            eprint(f"[parse] Received list of {len(result)} events, searching for assistant message")
            for i, event in enumerate(result):
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "assistant":
                    message = event.get("message", {})
                    content = message.get("content", [])
                    for item in content:
                        if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                            eprint(f"[parse] Found StructuredOutput in event[{i}] assistant message")
                            return item.get("input", {})
            eprint("[parse] No StructuredOutput found in any assistant message in event list")
    except json.JSONDecodeError as e:
        eprint(f"[parse] JSON decode error: {e}")
    except Exception as e:
        eprint(f"[parse] Unexpected error during structured parsing: {e}")

    # Fallback to heuristic extraction with required field validation
    eprint("[parse] No structured output found, falling back to heuristic JSON extraction")
    return parse_json_maybe(raw, require_fields=["verdict", "summary"])


def run_agent_review(
    plan: str,
    agent: AgentConfig,
    schema: Dict[str, Any],
    timeout: int,
    max_turns: int = 3,
) -> ReviewerResult:
    """Run a single Claude Code agent to review the plan.

    Args:
        plan: The plan content to review
        agent: Agent configuration (name, model, etc.)
        schema: JSON schema for the review output
        timeout: Timeout in seconds
        max_turns: Maximum agent turns

    Returns:
        ReviewerResult with the review output
    """
    claude_path = shutil.which("claude")
    if claude_path is None:
        eprint(f"[{agent.name}] Claude CLI not found on PATH")
        return ReviewerResult(
            name=agent.name,
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="claude CLI not found on PATH",
        )

    eprint(f"[{agent.name}] Found Claude CLI at: {claude_path}")

    prompt = f"""{AGENT_REVIEW_PROMPT_PREFIX}

PLAN:
<<<
{plan}
>>>
"""

    schema_json = json.dumps(schema, ensure_ascii=False)
    cmd_args = [
        claude_path,
        "--agent", agent.name,
        "--model", agent.model,
        "--permission-mode", "bypassPermissions",
        "--output-format", "json",
        "--max-turns", str(max_turns),
        "--json-schema", schema_json,
        "--settings", "{}",
    ]

    eprint(f"[{agent.name}] Running with model: {agent.model}, timeout: {timeout}s, max-turns: {max_turns}")

    # Get environment for internal subprocess (bypasses hooks)
    env = get_internal_subprocess_env()

    try:
        p = subprocess.run(
            cmd_args,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
    except subprocess.TimeoutExpired:
        eprint(f"[{agent.name}] TIMEOUT after {timeout}s")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[{agent.name}] EXCEPTION: {ex}")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} failed to run: {ex}")

    eprint(f"[{agent.name}] Exit code: {p.returncode}")
    eprint(f"[{agent.name}] stdout length: {len(p.stdout or '')} chars")
    if p.stderr:
        eprint(f"[{agent.name}] stderr: {p.stderr[:500]}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    if raw:
        eprint(f"[{agent.name}] stdout preview: {raw[:500]}")

    obj = _parse_claude_output(raw)
    if obj:
        eprint(f"[{agent.name}] Parsed JSON successfully, verdict: {obj.get('verdict', 'N/A')}")
    else:
        eprint(f"[{agent.name}] Failed to parse JSON from output")

    ok, verdict, norm = coerce_to_review(obj, "Retry or check agent configuration.")

    return ReviewerResult(agent.name, ok, verdict, norm, raw, err)
