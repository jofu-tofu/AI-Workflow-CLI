#!/usr/bin/env python3
"""
CC-Native Plan Review Hook (Unified)

Claude Code PreToolUse hook that intercepts ExitPlanMode and
automatically reviews plans using:
1. CLI reviewers (Codex + Gemini)
2. Plan orchestrator for complexity analysis
3. Claude Code agents in parallel

Trigger: ExitPlanMode tool use (PreToolUse - runs BEFORE user approval prompt)

Features:
- Detects plans via ExitPlanMode PreToolUse
- Phase 1: Runs CLI reviewers (Codex/Gemini) if enabled
- Phase 2: Runs orchestrator to analyze complexity and select agents
- Phase 3: Runs selected agents in parallel
- Phase 4: Generates combined output (single JSON + single Markdown)
- Returns feedback to Claude via hook additionalContext
- Optional blocking on FAIL verdict

Configuration: _cc-native/config.json -> planReview, agentReview

Output: _output/cc-native/plans/{YYYY-MM-DD}/{slug}/reviews/
  - review.json (combined review data)
  - review.md (combined markdown)
  - {reviewer}.json (individual reviewer results)
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Import shared library
try:
    _lib = Path(__file__).parent.parent / "lib"
    sys.path.insert(0, str(_lib))
    from utils import (
        DEFAULT_DISPLAY,
        DEFAULT_SANITIZATION,
        REVIEW_SCHEMA,
        ReviewerResult,
        CombinedReviewResult,
        eprint,
        project_dir,
        find_plan_file,
        compute_plan_hash,
        is_plan_already_reviewed,
        mark_plan_reviewed,
        worst_verdict,
        format_combined_markdown,
        write_combined_artifacts,
        load_config,
        get_display_settings,
    )
    from state import (
        load_state,
        save_state,
        get_iteration_state,
        update_iteration_state,
        should_continue_iterating,
        DEFAULT_REVIEW_ITERATIONS,
    )
    from reviewers import (
        run_codex_review,
        run_gemini_review,
        run_agent_review,
        AgentConfig,
        OrchestratorConfig,
    )
    from orchestrator import (
        run_orchestrator,
        DEFAULT_AGENT_SELECTION,
        DEFAULT_COMPLEXITY_CATEGORIES,
    )
except ImportError as e:
    print(f"[cc-native-plan-review] Failed to import lib: {e}", file=sys.stderr)
    sys.exit(0)  # Non-blocking failure

# Add scripts directory to path for aggregate_agents import
_scripts_dir = Path(__file__).parent.parent / "scripts"
if str(_scripts_dir) not in sys.path:
    sys.path.insert(0, str(_scripts_dir))

try:
    from aggregate_agents import aggregate_agents
except ImportError:
    def aggregate_agents(agents_dir: Path) -> List[Dict[str, Any]]:
        eprint("[cc-native-plan-review] Warning: aggregate_agents not found")
        return []


# ---------------------------
# Default Configuration
# ---------------------------

DEFAULT_AGENTS: List[Dict[str, Any]] = [
    {"name": "architect-reviewer", "model": "sonnet", "focus": "architectural concerns and scalability", "enabled": True, "categories": ["code", "infrastructure", "design"]},
    {"name": "penetration-tester", "model": "sonnet", "focus": "security vulnerabilities and attack vectors", "enabled": True, "categories": ["code", "infrastructure"]},
    {"name": "performance-engineer", "model": "sonnet", "focus": "performance bottlenecks and optimization", "enabled": True, "categories": ["code", "infrastructure"]},
    {"name": "accessibility-tester", "model": "sonnet", "focus": "accessibility compliance and UX concerns", "enabled": True, "categories": ["code", "design"]},
]

DEFAULT_ORCHESTRATOR: Dict[str, Any] = {
    "enabled": True,
    "model": "haiku",
    "timeout": 30,
    "maxTurns": 3,
}

DEFAULT_AGENT_MODEL: str = "sonnet"


# ---------------------------
# Settings Loading
# ---------------------------

def load_settings(proj_dir: Path) -> Dict[str, Any]:
    """Load CC-Native settings from _cc-native/config.json"""
    defaults = {
        "planReview": {
            "enabled": True,
            "reviewers": {
                "codex": {"enabled": True, "model": "", "timeout": 120},
                "gemini": {"enabled": False, "model": "", "timeout": 120},
            },
            "blockOnFail": False,
            "display": DEFAULT_DISPLAY.copy(),
        },
        "agentReview": {
            "enabled": True,
            "orchestrator": DEFAULT_ORCHESTRATOR.copy(),
            "timeout": 120,
            "blockOnFail": True,
            "legacyMode": False,
            "maxTurns": 3,
            "display": DEFAULT_DISPLAY.copy(),
            "agentSelection": DEFAULT_AGENT_SELECTION.copy(),
            "agentDefaults": {"model": DEFAULT_AGENT_MODEL},
            "complexityCategories": DEFAULT_COMPLEXITY_CATEGORIES.copy(),
            "sanitization": DEFAULT_SANITIZATION.copy(),
        },
    }

    config = load_config(proj_dir)
    if not config:
        return defaults

    # Merge planReview settings
    plan_review = config.get("planReview", {})
    merged_plan = defaults["planReview"].copy()
    merged_plan.update(plan_review)
    if "reviewers" in plan_review:
        merged_plan["reviewers"] = defaults["planReview"]["reviewers"].copy()
        merged_plan["reviewers"].update(plan_review["reviewers"])
    merged_plan["display"] = get_display_settings(config, "planReview")

    # Merge agentReview settings
    agent_review = config.get("agentReview", {})
    merged_agent = defaults["agentReview"].copy()
    merged_agent.update(agent_review)

    # Handle orchestrator nested config
    if "orchestrator" not in merged_agent or not isinstance(merged_agent["orchestrator"], dict):
        merged_agent["orchestrator"] = DEFAULT_ORCHESTRATOR.copy()
    else:
        orch = DEFAULT_ORCHESTRATOR.copy()
        orch.update(merged_agent["orchestrator"])
        merged_agent["orchestrator"] = orch

    merged_agent["display"] = get_display_settings(config, "agentReview")
    merged_agent["agentSelection"] = {**DEFAULT_AGENT_SELECTION, **config.get("agentSelection", {})}
    merged_agent["agentDefaults"] = {**{"model": DEFAULT_AGENT_MODEL}, **config.get("agentDefaults", {})}
    merged_agent["complexityCategories"] = config.get("complexityCategories", DEFAULT_COMPLEXITY_CATEGORIES.copy())
    merged_agent["sanitization"] = {**DEFAULT_SANITIZATION, **config.get("sanitization", {})}

    # Merge reviewIterations settings
    merged_agent["reviewIterations"] = {**DEFAULT_REVIEW_ITERATIONS, **agent_review.get("reviewIterations", {})}
    merged_agent["earlyExitOnAllPass"] = agent_review.get("earlyExitOnAllPass", True)

    return {"planReview": merged_plan, "agentReview": merged_agent}


def load_agent_library(proj_dir: Path, settings: Optional[Dict[str, Any]] = None) -> List[AgentConfig]:
    """Load agent library by auto-detecting from frontmatter."""
    agents_dir = proj_dir / ".claude" / "agents" / "cc-native"
    agents_data = aggregate_agents(agents_dir)

    default_model = DEFAULT_AGENT_MODEL
    if settings:
        default_model = settings.get("agentDefaults", {}).get("model", DEFAULT_AGENT_MODEL)

    if not agents_data:
        eprint("[cc-native-plan-review] No agents found in frontmatter, using defaults")
        return [
            AgentConfig(
                name=a["name"],
                model=a.get("model", default_model),
                focus=a.get("focus", "general review"),
                enabled=a.get("enabled", True),
                categories=a.get("categories", ["code"]),
            )
            for a in DEFAULT_AGENTS
        ]

    agents = []
    for a in agents_data:
        if a.get("name") == "plan-orchestrator":
            continue
        agents.append(AgentConfig(
            name=a["name"],
            model=a.get("model", default_model),
            focus=a.get("focus", "general review"),
            enabled=a.get("enabled", True),
            categories=a.get("categories", ["code"]),
            description=a.get("description", ""),
            tools=a.get("tools", ""),
        ))

    return agents


# ---------------------------
# Main Hook
# ---------------------------

def main() -> int:
    eprint("[cc-native-plan-review] Unified hook started (PreToolUse)")

    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        eprint(f"[cc-native-plan-review] Invalid JSON input: {e}")
        return 0

    tool_name = payload.get("tool_name")
    eprint(f"[cc-native-plan-review] tool_name: {tool_name}")

    # Only process ExitPlanMode
    if tool_name != "ExitPlanMode":
        eprint("[cc-native-plan-review] Skipping: not ExitPlanMode")
        return 0

    session_id = str(payload.get("session_id", "unknown"))
    base = project_dir(payload)
    settings = load_settings(base)

    plan_settings = settings.get("planReview", {})
    agent_settings = settings.get("agentReview", {})

    plan_review_enabled = plan_settings.get("enabled", True)
    agent_review_enabled = agent_settings.get("enabled", True)

    if not plan_review_enabled and not agent_review_enabled:
        eprint("[cc-native-plan-review] Skipping: both plan and agent review disabled")
        return 0

    # Find and read plan FIRST (state file is keyed by plan path)
    plan_path = find_plan_file()
    if not plan_path:
        eprint("[cc-native-plan-review] Skipping: no plan file found in ~/.claude/plans/")
        return 0

    try:
        plan = Path(plan_path).read_text(encoding="utf-8").strip()
    except Exception as e:
        eprint(f"[cc-native-plan-review] Failed to read plan file: {e}")
        return 0

    if not plan:
        eprint("[cc-native-plan-review] Skipping: plan file is empty")
        return 0

    eprint(f"[cc-native-plan-review] Found plan at: {plan_path}")
    eprint(f"[cc-native-plan-review] Plan length: {len(plan)} chars")

    # Load state file (keyed by plan path, created by set_plan_state.py)
    state = load_state(plan_path)
    task_folder = state.get("task_folder") if state else None
    if task_folder:
        eprint(f"[cc-native-plan-review] Using task_folder from state: {task_folder}")
    else:
        eprint("[cc-native-plan-review] No task_folder in state, will generate folder path")

    # Check if we've exhausted review iterations
    if state and "iteration" in state:
        iter_state = state["iteration"]
        current = iter_state.get("current", 1)
        max_iter = iter_state.get("max", 1)
        if current > max_iter:
            eprint(f"[cc-native-plan-review] Skipping: review iterations exhausted ({current}/{max_iter})")
            return 0

    # Plan-hash deduplication
    plan_hash = compute_plan_hash(plan)
    eprint(f"[cc-native-plan-review] Plan hash: {plan_hash}")
    if is_plan_already_reviewed(session_id, plan_hash):
        eprint("[cc-native-plan-review] Skipping: plan already reviewed (hash match)")
        return 0

    # Initialize combined result
    cli_results: Dict[str, ReviewerResult] = {}
    orch_result = None
    agent_results: Dict[str, ReviewerResult] = {}
    all_verdicts: List[str] = []
    iteration_state: Optional[Dict[str, Any]] = None
    detected_complexity: str = "medium"  # Will be updated by orchestrator

    # ============================================
    # PHASE 1: CLI Reviewers (Codex/Gemini)
    # ============================================
    if plan_review_enabled:
        eprint("[cc-native-plan-review] === PHASE 1: CLI Reviewers ===")
        reviewers_config = plan_settings.get("reviewers", {})
        codex_enabled = reviewers_config.get("codex", {}).get("enabled", True)
        gemini_enabled = reviewers_config.get("gemini", {}).get("enabled", False)

        eprint(f"[cc-native-plan-review] Codex enabled: {codex_enabled}, Gemini enabled: {gemini_enabled}")

        if codex_enabled:
            result = run_codex_review(plan, REVIEW_SCHEMA, plan_settings)
            cli_results["codex"] = result
            if result.verdict and result.verdict not in ("skip", "error"):
                all_verdicts.append(result.verdict)
        else:
            eprint("[cc-native-plan-review] Skipping Codex (disabled)")

        if gemini_enabled:
            result = run_gemini_review(plan, REVIEW_SCHEMA, plan_settings)
            cli_results["gemini"] = result
            if result.verdict and result.verdict not in ("skip", "error"):
                all_verdicts.append(result.verdict)
        else:
            eprint("[cc-native-plan-review] Skipping Gemini (disabled)")

    # ============================================
    # PHASE 2 & 3: Orchestrator + Agent Reviews
    # ============================================
    if agent_review_enabled:
        eprint("[cc-native-plan-review] === PHASE 2: Orchestrator ===")

        agent_library = load_agent_library(base, agent_settings)
        timeout = agent_settings.get("timeout", 120)
        legacy_mode = agent_settings.get("legacyMode", False)

        orch_settings = agent_settings.get("orchestrator", DEFAULT_ORCHESTRATOR)
        orchestrator_config = OrchestratorConfig(
            enabled=orch_settings.get("enabled", True),
            model=orch_settings.get("model", "haiku"),
            timeout=orch_settings.get("timeout", 30),
            max_turns=orch_settings.get("maxTurns", 3),
        )

        enabled_agents = [a for a in agent_library if a.enabled]
        eprint(f"[cc-native-plan-review] Agent library: {[a.name for a in agent_library]}")
        eprint(f"[cc-native-plan-review] Enabled agents: {[a.name for a in enabled_agents]}")
        eprint(f"[cc-native-plan-review] Legacy mode: {legacy_mode}")
        eprint(f"[cc-native-plan-review] Orchestrator enabled: {orchestrator_config.enabled}")

        selected_agents: List[AgentConfig] = []

        if enabled_agents:
            if orchestrator_config.enabled and not legacy_mode:
                orch_result = run_orchestrator(plan, enabled_agents, orchestrator_config, agent_settings)
                detected_complexity = orch_result.complexity

                if orch_result.complexity == "simple" and not orch_result.selected_agents:
                    eprint("[cc-native-plan-review] Orchestrator determined: simple complexity, no agent review needed")
                else:
                    selected_names = set(orch_result.selected_agents)
                    selected_agents = [a for a in enabled_agents if a.name in selected_names]

                    if not selected_agents and selected_names:
                        eprint(f"[cc-native-plan-review] Warning: orchestrator selected unknown agents: {selected_names}")
                        selected_agents = [a for a in enabled_agents if orch_result.category in a.categories]

                    eprint(f"[cc-native-plan-review] Orchestrator selected: {[a.name for a in selected_agents]}")
            else:
                eprint("[cc-native-plan-review] Running in legacy mode (all enabled agents)")
                selected_agents = enabled_agents
                detected_complexity = "medium"  # Default for legacy mode

        # Initialize iteration state based on complexity (after orchestrator runs)
        if state:
            iteration_state = get_iteration_state(state, detected_complexity, agent_settings)
            eprint(f"[cc-native-plan-review] Iteration state: {iteration_state['current']}/{iteration_state['max']} ({detected_complexity})")

        # PHASE 3: Run selected agents
        if selected_agents:
            eprint("[cc-native-plan-review] === PHASE 3: Agent Reviews ===")
            max_turns = agent_settings.get("maxTurns", 3)

            with ThreadPoolExecutor(max_workers=len(selected_agents)) as executor:
                futures = {
                    executor.submit(run_agent_review, plan, agent, REVIEW_SCHEMA, timeout, max_turns): agent
                    for agent in selected_agents
                }
                for future in as_completed(futures):
                    agent = futures[future]
                    try:
                        result = future.result()
                        agent_results[agent.name] = result
                        if result.verdict and result.verdict not in ("skip", "error"):
                            all_verdicts.append(result.verdict)
                        eprint(f"[cc-native-plan-review] {agent.name} completed with verdict: {result.verdict}")
                    except Exception as ex:
                        eprint(f"[cc-native-plan-review] {agent.name} failed with exception: {ex}")
                        agent_results[agent.name] = ReviewerResult(
                            name=agent.name,
                            ok=False,
                            verdict="error",
                            data={},
                            raw="",
                            err=str(ex),
                        )

    # ============================================
    # PHASE 4: Generate Combined Output
    # ============================================
    eprint("[cc-native-plan-review] === PHASE 4: Generate Output ===")

    if not cli_results and not agent_results:
        eprint("[cc-native-plan-review] No review results, exiting")
        return 0

    overall = worst_verdict(all_verdicts) if all_verdicts else "pass"

    combined_result = CombinedReviewResult(
        plan_hash=plan_hash,
        overall_verdict=overall,
        cli_reviewers=cli_results,
        orchestration=orch_result,
        agents=agent_results,
        timestamp=datetime.now().isoformat(),
    )

    # Merge display settings from both configs
    display_settings = {**plan_settings.get("display", {}), **agent_settings.get("display", {})}
    combined_settings = {"display": display_settings}

    review_file = write_combined_artifacts(base, plan, combined_result, payload, combined_settings, task_folder)
    eprint(f"[cc-native-plan-review] Saved review: {review_file}")

    # Build context message
    md_content = format_combined_markdown(combined_result, combined_settings)

    context_parts = [
        "**CC-Native Plan Review Complete**\n\n",
        f"Review saved to: `{review_file}`\n\n",
    ]

    if cli_results:
        cli_verdicts = [f"{name}={r.verdict}" for name, r in cli_results.items()]
        context_parts.append(f"**CLI Reviewers:** {', '.join(cli_verdicts)}\n")

    if orch_result:
        context_parts.append(f"**Orchestration:** Complexity=`{orch_result.complexity}`, Category=`{orch_result.category}`, Agents selected: {len(agent_results)}\n")

    context_parts.append("\nUse these findings before starting implementation.\n\n")
    context_parts.append(md_content)

    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": "".join(context_parts),
        }
    }

    # Check blocking conditions
    block_on_fail_plan = plan_settings.get("blockOnFail", False)
    block_on_fail_agent = agent_settings.get("blockOnFail", True)
    should_block = (overall == "fail") and (block_on_fail_plan or block_on_fail_agent)

    # Handle iteration logic
    needs_more_iterations = False
    if iteration_state and state:
        # Update iteration state with this review result
        state = update_iteration_state(state, iteration_state, plan_hash, overall)

        # Check if more iterations needed
        if should_continue_iterating(iteration_state, overall, agent_settings):
            needs_more_iterations = True
            # Increment iteration counter for next round
            iteration_state["current"] = iteration_state.get("current", 1) + 1
            state["iteration"] = iteration_state

            # Save updated state for next iteration
            save_state(plan_path, state)

            current = iteration_state["current"] - 1  # Display the just-completed iteration
            max_iter = iteration_state["max"]
            remaining = max_iter - current

            out["decision"] = "block"
            out["reason"] = (
                f"CC-Native plan review iteration {current}/{max_iter} verdict = {overall.upper()}.\n\n"
                f"REVISION REQUIRED: Address the issues identified above.\n"
                f"Revise the plan in place, then attempt ExitPlanMode again.\n"
                f"({remaining} revision{'s' if remaining != 1 else ''} remaining)"
            )
        else:
            # Final iteration - increment current and save state
            iteration_state["current"] = iteration_state.get("current", 1) + 1
            state["iteration"] = iteration_state
            save_state(plan_path, state)

    # Standard blocking (only if not already blocked by iteration)
    if should_block and not needs_more_iterations:
        out["decision"] = "block"
        out["reason"] = (
            "CC-Native plan review verdict = FAIL. Do NOT start implementation yet. "
            "Revise the plan to address the high-severity issues and missing sections, "
            "then present an updated plan."
        )

    mark_plan_reviewed(session_id, plan_hash, "cc-native-plan-review", iteration_state)
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
