"""
CC-Native Gemini Reviewer Module.

Runs Gemini CLI to review plans.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict

# Import from parent lib
_lib_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_lib_dir))

from utils import ReviewerResult, eprint, parse_json_maybe, coerce_to_review


def run_gemini_review(
    plan: str,
    schema: Dict[str, Any],
    settings: Dict[str, Any],
) -> ReviewerResult:
    """Run Gemini CLI to review the plan.

    Args:
        plan: The plan content to review
        schema: JSON schema for the review output
        settings: Gemini reviewer settings (timeout, model)

    Returns:
        ReviewerResult with the review output
    """
    gemini_settings = settings.get("reviewers", {}).get("gemini", {})
    timeout = gemini_settings.get("timeout", 120)
    model = gemini_settings.get("model", "")

    gemini_path = shutil.which("gemini")
    if gemini_path is None:
        eprint("[gemini] CLI not found on PATH")
        return ReviewerResult(
            name="gemini",
            ok=False,
            verdict="skip",
            data={},
            raw="",
            err="gemini CLI not found on PATH",
        )

    eprint(f"[gemini] Found CLI at: {gemini_path}")

    instruction = f"""

Review the PLAN above as a senior staff software engineer. Focus on:
- missing steps, unclear assumptions, edge cases
- security/privacy concerns
- testing/rollout/rollback completeness
- operational concerns (observability, failure modes)

Return ONLY a JSON object that matches this JSON Schema (no markdown, no code fences):
{json.dumps(schema, ensure_ascii=False)}
"""

    cmd = [
        gemini_path,
        "-y",  # YOLO mode - auto-approve all actions
        "-p",
        instruction,
    ]

    if model:
        cmd.extend(["--model", model])

    eprint("[gemini] Running command: gemini -y -p <instruction>")

    try:
        p = subprocess.run(
            cmd,
            input=plan,
            text=True,
            capture_output=True,
            timeout=timeout,
            encoding='utf-8',
            errors='replace',
        )
    except subprocess.TimeoutExpired:
        eprint(f"[gemini] TIMEOUT after {timeout}s")
        return ReviewerResult("gemini", False, "error", {}, "", f"gemini timed out after {timeout}s")
    except Exception as ex:
        eprint(f"[gemini] EXCEPTION: {ex}")
        return ReviewerResult("gemini", False, "error", {}, "", f"gemini failed to run: {ex}")

    eprint(f"[gemini] Exit code: {p.returncode}")

    raw = (p.stdout or "").strip()
    err = (p.stderr or "").strip()

    obj = parse_json_maybe(raw)
    ok, verdict, norm = coerce_to_review(obj, "Retry or check CLI auth/config.")

    return ReviewerResult("gemini", ok, verdict, norm, raw, err)
