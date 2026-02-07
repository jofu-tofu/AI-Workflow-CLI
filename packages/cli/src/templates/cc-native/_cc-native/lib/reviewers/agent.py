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

from utils import ReviewerResult, parse_json_maybe, coerce_to_review
from debug import debug_log, debug_raw
from .base import AgentConfig, AGENT_REVIEW_PROMPT_PREFIX

# Import logger
_shared_logger = Path(__file__).resolve().parent.parent.parent.parent / "_shared" / "lib"
sys.path.insert(0, str(_shared_logger))
from base.logger import log_debug, log_info, log_warn, log_error

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
                log_debug("agent", "Found structured_output in root dict", component="parse")
                return result["structured_output"]
            if result.get("type") == "assistant":
                message = result.get("message", {})
                content = message.get("content", [])
                for item in content:
                    if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                        log_debug("agent", "Found StructuredOutput in assistant message content", component="parse")
                        return item.get("input", {})
                log_debug("agent", "Assistant message found but no StructuredOutput tool use in content", component="parse")
        elif isinstance(result, list):
            log_debug("agent", f"Received list of {len(result)} events, searching for assistant message", component="parse")
            for i, event in enumerate(result):
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "assistant":
                    message = event.get("message", {})
                    content = message.get("content", [])
                    for item in content:
                        if isinstance(item, dict) and item.get("name") == "StructuredOutput":
                            log_debug("agent", f"Found StructuredOutput in event[{i}] assistant message", component="parse")
                            return item.get("input", {})
            log_debug("agent", "No StructuredOutput found in any assistant message in event list", component="parse")
    except json.JSONDecodeError as e:
        log_warn("agent", f"JSON decode error: {e}", component="parse")
    except Exception as e:
        log_error("agent", f"Unexpected error during structured parsing: {e}", component="parse")

    # Fallback to heuristic extraction with required field validation
    log_debug("agent", "No structured output found, falling back to heuristic JSON extraction", component="parse")
    return parse_json_maybe(raw, require_fields=["verdict", "summary"])


def run_agent_review(
    plan: str,
    agent: AgentConfig,
    schema: Dict[str, Any],
    timeout: int,
    context_path: Optional[Path] = None,
    session_name: str = "unknown",
) -> ReviewerResult:
    """Run a single Claude Code agent to review the plan.

    Args:
        plan: The plan content to review
        agent: Agent configuration (name, model, etc.)
        schema: JSON schema for the review output
        timeout: Timeout in seconds
        context_path: Optional path to context folder for debug logging
        session_name: Session name for debug logging

    Returns:
        ReviewerResult with the review output
    """
    claude_path = shutil.which("claude")
    if claude_path is None:
        log_warn(agent.name, "Claude CLI not found on PATH")
        return ReviewerResult(
            name=agent.name,
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="claude CLI not found on PATH",
        )

    log_debug(agent.name, f"Found Claude CLI at: {claude_path}")

    # User prompt - direct instruction to call StructuredOutput immediately
    prompt = f"""IMMEDIATELY call StructuredOutput with your review of the plan below.
Do NOT output any text before calling StructuredOutput.

PLAN:
<<<
{plan}
>>>
"""

    schema_json = json.dumps(schema, ensure_ascii=False)

    # Build command args - use --system-prompt with the markdown body as persona
    cmd_args = [
        claude_path,
        "-p",  # Enable print mode to read prompt from stdin
        "--model", agent.model,
        "--output-format", "json",
        "--json-schema", schema_json,
        "--max-turns", "3",  # Allow buffer for tool call + result (usually completes in 2)
        "--setting-sources", "",  # Disable user/project settings to avoid PAI context interference
    ]

    # Add system prompt: prefix with single-turn instructions, then agent's persona
    if agent.system_prompt:
        full_prompt = AGENT_REVIEW_PROMPT_PREFIX + "\n\n---\n\n" + agent.system_prompt
        cmd_args.extend(["--system-prompt", full_prompt])

    log_info(agent.name, f"Running with model: {agent.model}, timeout: {timeout}s")

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
        log_warn(agent.name, f"TIMEOUT after {timeout}s")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} timed out after {timeout}s")
    except Exception as ex:
        log_error(agent.name, f"Exception: {ex}")
        return ReviewerResult(agent.name, False, "error", {}, "", f"{agent.name} failed to run: {ex}")

    log_debug(agent.name, f"Exit code: {p.returncode}")
    log_debug(agent.name, f"stdout length: {len(p.stdout or '')} chars")
    if p.stderr:
        log_debug(agent.name, f"stderr: {p.stderr[:500]}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    # Debug logging - capture full raw output for diagnosis
    if context_path:
        debug_raw(context_path, session_name, f"agent:{agent.name}", "stdout", raw)
        if err:
            debug_raw(context_path, session_name, f"agent:{agent.name}", "stderr", err)
        debug_log(context_path, session_name, f"agent:{agent.name}", "subprocess_info", {
            "exit_code": p.returncode,
            "stdout_len": len(raw),
            "stderr_len": len(err),
            "model": agent.model,
            "timeout": timeout,
        })

    if raw:
        log_debug(agent.name, f"stdout preview: {raw[:500]}")

    obj = _parse_claude_output(raw)

    # Debug logging - capture parsed result details
    if context_path:
        debug_log(context_path, session_name, f"agent:{agent.name}", "parsed_result", {
            "parsed_keys": list(obj.keys()) if obj else None,
            "verdict": obj.get("verdict") if obj else None,
            "has_summary": bool(obj.get("summary")) if obj else False,
            "summary_preview": (obj.get("summary", "")[:200] + "...") if obj and obj.get("summary") and len(obj.get("summary", "")) > 200 else (obj.get("summary") if obj else None),
            "issues_count": len(obj.get("issues", [])) if obj else 0,
            "missing_sections_count": len(obj.get("missing_sections", [])) if obj else 0,
            "questions_count": len(obj.get("questions", [])) if obj else 0,
        })

    if obj:
        log_info(agent.name, f"Parsed JSON successfully, verdict: {obj.get('verdict', 'N/A')}")
    else:
        log_warn(agent.name, "Failed to parse JSON from output")

    ok, verdict, norm = coerce_to_review(obj, "Retry or check agent configuration.")

    return ReviewerResult(agent.name, ok, verdict, norm, raw, err)
