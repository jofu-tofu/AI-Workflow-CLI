#!/usr/bin/env python3
"""PostToolUse hook for ExitPlanMode — assigns plan fields to state.json.

This hook fires when the user ACCEPTS the plan (ExitPlanMode succeeds).
PostToolUse fires ONLY on success, so this reliably indicates acceptance.

The plan was already archived by archive_plan.py (PermissionRequest).
This hook finds the archived plan, computes hash + signature, and assigns
plan_hash, plan_signature, plan_path to state.json — without changing mode.

Separation of concerns:
- archive_plan.py (PermissionRequest) -> archives file only, no state.json changes
- plan_accepted.py (PostToolUse) -> assigns plan fields (hash/signature/path)
- session_end.py (SessionEnd) -> transitions active -> has_plan when plan is assigned
- context_selector.py -> matches plan content, transitions has_plan -> active

Usage in .claude/settings.json:
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "ExitPlanMode",
      "hooks": [{
        "type": "command",
        "command": "python .aiwcli/_cc-native/hooks/plan_accepted.py",
        "timeout": 5000
      }]
    }]
  }
}
"""
import hashlib
import sys
from pathlib import Path

# Add parent directories to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_LIB = SCRIPT_DIR.parent.parent / "_shared" / "lib"
sys.path.insert(0, str(SHARED_LIB.parent))

from lib.base.hook_utils import load_hook_input, log_hook_error
from lib.base.logger import log_info, log_debug, log_warn, log_error
from lib.base.utils import project_dir
from lib.context.context_store import get_context_by_session_id, update_mode
from lib.context.plan_manager import (
    find_latest_plan,
    extract_plan_path_from_result,
    generate_plan_id,
    normalize_plan_content,
    extract_plan_anchors,
)


def main():
    """Assign plan fields (hash/signature/path) to state.json on plan acceptance."""
    hook_input = load_hook_input()
    if not hook_input:
        log_warn("plan_accepted", "EXIT: no hook_input (stdin empty or invalid JSON)")
        return

    hook_event = hook_input.get("hook_event_name", "")
    tool_name = hook_input.get("tool_name", "")
    session_id = hook_input.get("session_id", "MISSING")

    if not (hook_event == "PostToolUse" and tool_name == "ExitPlanMode"):
        log_debug("plan_accepted", f"Skipping: {hook_event}/{tool_name}")
        return

    project_root = project_dir(hook_input)
    state = get_context_by_session_id(session_id, project_root)
    if not state:
        log_warn("plan_accepted", f"No context for session {session_id}")
        return

    log_debug("plan_accepted", f"Found context: {state.id}, mode: {state.mode}")

    # Find the latest archived plan
    plan_path = find_latest_plan(state.id, project_root)
    if not plan_path:
        log_warn("plan_accepted", f"No archived plan found for {state.id}")
        return

    # Find the original plan file (in ~/.claude/plans/) to inject plan-id there too
    original_plan_path = extract_plan_path_from_result(hook_input.get("tool_result", ""))
    if not original_plan_path:
        claude_plans_dir = Path.home() / ".claude" / "plans"
        if claude_plans_dir.exists():
            plans = sorted(claude_plans_dir.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
            if plans:
                original_plan_path = str(plans[0])

    # Generate plan ID and inject into plan files
    plan_id = generate_plan_id()
    id_marker = f"<!-- plan-id: {plan_id} -->\n"

    for file_path in [plan_path, original_plan_path]:
        if file_path and Path(file_path).exists():
            file_content = Path(file_path).read_text(encoding="utf-8")
            if "<!-- plan-id:" not in file_content:
                Path(file_path).write_text(id_marker + file_content, encoding="utf-8")

    # Read the modified content (with plan ID) for hashing
    content = Path(plan_path).read_text(encoding="utf-8")

    # Compute normalized hash (Tier 2)
    normalized = normalize_plan_content(content)
    plan_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]
    plan_signature = content[:200]  # Keep for backward compat

    # Extract structural anchors (Tier 3)
    plan_anchors = extract_plan_anchors(content)

    # Assign plan to context (no mode change — keep current mode)
    update_mode(
        state.id, state.mode,
        project_root=project_root,
        plan_path=plan_path,
        plan_hash=plan_hash,
        plan_signature=plan_signature,
        plan_id=plan_id,
        plan_anchors=plan_anchors,
    )
    log_info("plan_accepted", f"Assigned plan to {state.id} (id: {plan_id}, hash: {plan_hash}, anchors: {len(plan_anchors)})")


if __name__ == "__main__":
    from lib.base.hook_utils import run_hook
    run_hook(main, "plan_accepted")
