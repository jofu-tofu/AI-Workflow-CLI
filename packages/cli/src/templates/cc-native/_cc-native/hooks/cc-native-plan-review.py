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

Configuration: _cc-native/plan-review.config.json -> planReview, agentReview

Output: _output/cc-native/plans/{YYYY-MM-DD}/{slug}/reviews/
  - review.json (combined review data)
  - review.md (combined markdown)
  - {reviewer}.json (individual reviewer results)
"""

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# Import shared library
try:
    _lib = Path(__file__).parent.parent / "lib"
    sys.path.insert(0, str(_lib))

    # Add shared library path
    _shared = Path(__file__).parent.parent.parent / "_shared"
    sys.path.insert(0, str(_shared))

    # Import subprocess utilities
    from lib.base.subprocess_utils import is_internal_call

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
    # Import shared context system
    from lib.context.context_manager import (
        get_context_by_session_id,
        get_all_in_flight_contexts,
        get_all_contexts,
    )
    from lib.base.constants import get_context_reviews_dir, get_review_folder_path
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

DEFAULT_REVIEW_ITERATIONS: Dict[str, int] = {
    "simple": 1,
    "medium": 1,
    "high": 2,
}


# ---------------------------
# Context-based State Management
# ---------------------------

def get_active_context_for_review(session_id: str, project_root: Path) -> Optional[Any]:
    """Find active context for plan review.

    Strategy:
    1. Find context by session_id
    2. Fallback: Single context in 'planning' mode
    3. Return None if multiple planning contexts or no planning contexts found

    Only triggers for contexts in 'planning' mode, not 'handoff_pending' or other modes.

    Args:
        session_id: Current session ID
        project_root: Project root path

    Returns:
        Context object or None
    """
    # Strategy 1: Find by session_id
    context = get_context_by_session_id(session_id, project_root)
    if context:
        eprint(f"[cc-native-plan-review] Found context by session_id: {context.id}")
        return context

    # Strategy 2: Single planning context (only planning mode)
    in_flight = get_all_in_flight_contexts(project_root)
    planning_contexts = [c for c in in_flight if c.in_flight and c.in_flight.mode == "planning"]
    if len(planning_contexts) == 1:
        eprint(f"[cc-native-plan-review] Found single planning context: {planning_contexts[0].id}")
        return planning_contexts[0]

    # Multiple or no planning contexts found
    if len(planning_contexts) > 1:
        eprint(f"[cc-native-plan-review] Multiple planning contexts ({len(planning_contexts)}), cannot determine which to use")
    elif len(in_flight) > 0:
        modes = [c.in_flight.mode if c.in_flight else "none" for c in in_flight]
        eprint(f"[cc-native-plan-review] Found {len(in_flight)} in-flight context(s) with modes {modes}, but none in 'planning' mode")
    else:
        eprint("[cc-native-plan-review] No in-flight contexts found")
    return None


def load_iteration_state(reviews_dir: Path) -> Optional[Dict[str, Any]]:
    """Load iteration state from context reviews folder.

    Args:
        reviews_dir: Path to the reviews directory

    Returns:
        Iteration state dict or None if not found
    """
    iteration_file = reviews_dir / "iteration.json"
    if not iteration_file.exists():
        return None

    try:
        return json.loads(iteration_file.read_text(encoding="utf-8"))
    except Exception as e:
        eprint(f"[cc-native-plan-review] Failed to load iteration state: {e}")
        return None


def save_iteration_state(reviews_dir: Path, state: Dict[str, Any]) -> bool:
    """Save iteration state to context reviews folder.

    Args:
        reviews_dir: Path to the reviews directory
        state: Iteration state dict

    Returns:
        True on success, False on failure
    """
    iteration_file = reviews_dir / "iteration.json"
    try:
        reviews_dir.mkdir(parents=True, exist_ok=True)
        state["schema_version"] = "1.0.0"
        iteration_file.write_text(json.dumps(state, indent=2), encoding="utf-8")
        return True
    except Exception as e:
        eprint(f"[cc-native-plan-review] Failed to save iteration state: {e}")
        return False


def get_iteration_state_from_context(
    reviews_dir: Path,
    complexity: str,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Get or initialize iteration state based on complexity.

    Args:
        reviews_dir: Path to the reviews directory
        complexity: Plan complexity level (simple/medium/high)
        config: Optional config dict with reviewIterations settings

    Returns:
        Iteration dict with: current, max, complexity, history
    """
    existing = load_iteration_state(reviews_dir)
    if existing:
        return existing

    # Initialize new iteration state
    review_iterations = DEFAULT_REVIEW_ITERATIONS.copy()
    if config:
        review_iterations.update(config.get("reviewIterations", {}))
    max_iterations = review_iterations.get(complexity, 1)

    return {
        "current": 1,
        "max": max_iterations,
        "complexity": complexity,
        "history": [],
    }


def update_iteration_state_in_context(
    reviews_dir: Path,
    iteration: Dict[str, Any],
    plan_hash: str,
    verdict: str,
) -> Dict[str, Any]:
    """Record review result in iteration history.

    Args:
        reviews_dir: Path to the reviews directory
        iteration: The iteration state dict
        plan_hash: Hash of the current plan content
        verdict: Review verdict (pass/warn/fail)

    Returns:
        Updated iteration state dict
    """
    from datetime import datetime

    iteration["history"].append({
        "hash": plan_hash,
        "verdict": verdict,
        "timestamp": datetime.now().isoformat(),
    })
    return iteration


def should_continue_iterating_context(
    iteration: Dict[str, Any],
    verdict: str,
    config: Optional[Dict[str, Any]] = None,
) -> bool:
    """Determine if more review iterations are needed.

    Args:
        iteration: The iteration state dict
        verdict: Current review verdict
        config: Optional config dict with earlyExitOnAllPass setting

    Returns:
        True if more iterations needed, False otherwise
    """
    current = iteration.get("current", 1)
    max_iter = iteration.get("max", 1)

    # At or past max iterations - no more iterations
    if current >= max_iter:
        eprint(f"[cc-native-plan-review] At max iterations ({current}/{max_iter}), no more iterations")
        return False

    # Check early exit on all pass
    early_exit = True
    if config:
        early_exit = config.get("earlyExitOnAllPass", True)
    if early_exit and verdict == "pass":
        eprint(f"[cc-native-plan-review] All reviewers passed and earlyExitOnAllPass=true, exiting early")
        return False

    # More iterations available and verdict is not pass (or early exit disabled)
    eprint(f"[cc-native-plan-review] Continuing to next iteration ({current + 1}/{max_iter}), verdict={verdict}")
    return True


# ---------------------------
# Settings Loading
# ---------------------------

def load_settings(proj_dir: Path) -> Dict[str, Any]:
    """Load CC-Native settings from _cc-native/plan-review.config.json"""
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

    # Skip if internal subprocess call (orchestrator, agents)
    if is_internal_call():
        eprint("[cc-native-plan-review] Skipping: internal subprocess call")
        return 0

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

    # Find active context for this review (required)
    active_context = get_active_context_for_review(session_id, base)

    if not active_context:
        eprint("[cc-native-plan-review] Skipping: no active context found")
        return 0

    # Get base reviews dir from shared lib, then add cc-native namespace
    reviews_dir = get_context_reviews_dir(active_context.id, base) / "cc-native"
    eprint(f"[cc-native-plan-review] Using context reviews dir: {reviews_dir}")

    # Check if we've exhausted review iterations from context
    existing_iteration = load_iteration_state(reviews_dir)
    if existing_iteration:
        current = existing_iteration.get("current", 1)
        max_iter = existing_iteration.get("max", 1)
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
    # PHASE 1 & 2: CLI Reviewers + Orchestrator (PARALLEL)
    # ============================================
    # Run CLI reviewers and orchestrator concurrently for speed
    reviewers_config = plan_settings.get("reviewers", {}) if plan_review_enabled else {}
    codex_enabled = plan_review_enabled and reviewers_config.get("codex", {}).get("enabled", True)
    gemini_enabled = plan_review_enabled and reviewers_config.get("gemini", {}).get("enabled", False)

    agent_library = load_agent_library(base, agent_settings) if agent_review_enabled else []
    enabled_agents = [a for a in agent_library if a.enabled]
    timeout = agent_settings.get("timeout", 120)
    legacy_mode = agent_settings.get("legacyMode", False)

    orch_settings = agent_settings.get("orchestrator", DEFAULT_ORCHESTRATOR)
    orchestrator_config = OrchestratorConfig(
        enabled=orch_settings.get("enabled", True) and agent_review_enabled,
        model=orch_settings.get("model", "haiku"),
        timeout=orch_settings.get("timeout", 30),
        max_turns=orch_settings.get("maxTurns", 3),
    )

    eprint(f"[cc-native-plan-review] Codex enabled: {codex_enabled}, Gemini enabled: {gemini_enabled}")
    eprint(f"[cc-native-plan-review] Agent library: {[a.name for a in agent_library]}")
    eprint(f"[cc-native-plan-review] Enabled agents: {[a.name for a in enabled_agents]}")
    eprint(f"[cc-native-plan-review] Orchestrator enabled: {orchestrator_config.enabled}")

    # Run CLI reviewers + orchestrator in parallel
    phase1_tasks = []
    if codex_enabled:
        phase1_tasks.append(("codex", lambda: run_codex_review(plan, REVIEW_SCHEMA, plan_settings)))
    if gemini_enabled:
        phase1_tasks.append(("gemini", lambda: run_gemini_review(plan, REVIEW_SCHEMA, plan_settings)))
    if orchestrator_config.enabled and enabled_agents and not legacy_mode:
        phase1_tasks.append(("orchestrator", lambda: run_orchestrator(plan, enabled_agents, orchestrator_config, agent_settings)))

    eprint(f"[cc-native-plan-review] === PHASE 1: Running {len(phase1_tasks)} tasks in parallel ===")

    phase1_results: Dict[str, Any] = {}
    if phase1_tasks:
        with ThreadPoolExecutor(max_workers=len(phase1_tasks)) as executor:
            futures = {executor.submit(task_fn): name for name, task_fn in phase1_tasks}
            for future in as_completed(futures):
                name = futures[future]
                try:
                    phase1_results[name] = future.result()
                    eprint(f"[cc-native-plan-review] {name} completed")
                except Exception as ex:
                    eprint(f"[cc-native-plan-review] {name} failed: {ex}")
                    phase1_results[name] = None

    # Collect CLI results
    if "codex" in phase1_results and phase1_results["codex"]:
        cli_results["codex"] = phase1_results["codex"]
        if phase1_results["codex"].verdict and phase1_results["codex"].verdict not in ("skip", "error"):
            all_verdicts.append(phase1_results["codex"].verdict)
    if "gemini" in phase1_results and phase1_results["gemini"]:
        cli_results["gemini"] = phase1_results["gemini"]
        if phase1_results["gemini"].verdict and phase1_results["gemini"].verdict not in ("skip", "error"):
            all_verdicts.append(phase1_results["gemini"].verdict)

    # Get orchestrator result
    if "orchestrator" in phase1_results and phase1_results["orchestrator"]:
        orch_result = phase1_results["orchestrator"]

    # ============================================
    # PHASE 2: Agent Selection (from orchestrator result)
    # ============================================
    if agent_review_enabled:
        eprint("[cc-native-plan-review] === PHASE 2: Agent Selection ===")

        selected_agents: List[AgentConfig] = []

        if enabled_agents:
            if orch_result and not legacy_mode:
                # Use orchestrator result from phase 1
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
        if reviews_dir:
            iteration_state = get_iteration_state_from_context(reviews_dir, detected_complexity, agent_settings)
            eprint(f"[cc-native-plan-review] Iteration state: {iteration_state['current']}/{iteration_state['max']} ({detected_complexity})")

        # PHASE 3: Run selected agents in parallel
        if selected_agents:
            eprint("[cc-native-plan-review] === PHASE 3: Agent Reviews ===")
            max_turns = agent_settings.get("maxTurns", 3)
            max_parallel = agent_settings.get("maxParallelAgents", 0)  # 0 = unlimited
            num_workers = len(selected_agents) if max_parallel <= 0 else min(max_parallel, len(selected_agents))
            eprint(f"[cc-native-plan-review] Launching {len(selected_agents)} agents in parallel (workers={num_workers})")

            with ThreadPoolExecutor(max_workers=num_workers) as executor:
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

    # Get current iteration number for folder naming
    current_iteration = 1
    if iteration_state:
        current_iteration = iteration_state.get("current", 1)

    # Create review folder with datetime and iteration in name
    review_folder = get_review_folder_path(active_context.id, current_iteration, base)
    review_folder.mkdir(parents=True, exist_ok=True)
    eprint(f"[cc-native-plan-review] Created review folder: {review_folder}")

    review_file = write_combined_artifacts(
        base, plan, combined_result, payload, combined_settings,
        review_folder=review_folder,
        iteration=current_iteration,
    )
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

    # Check blocking conditions
    block_on_fail_plan = plan_settings.get("blockOnFail", False)
    block_on_fail_agent = agent_settings.get("blockOnFail", True)
    should_block = (overall == "fail") and (block_on_fail_plan or block_on_fail_agent)

    # Handle iteration logic
    needs_more_iterations = False
    if iteration_state and reviews_dir:
        # Update iteration state with this review result
        iteration_state = update_iteration_state_in_context(reviews_dir, iteration_state, plan_hash, overall)

        # Check if more iterations needed
        if should_continue_iterating_context(iteration_state, overall, agent_settings):
            needs_more_iterations = True
            # Increment iteration counter for next round
            iteration_state["current"] = iteration_state.get("current", 1) + 1
            # Save updated state for next iteration
            save_iteration_state(reviews_dir, iteration_state)
        else:
            # Final iteration - increment current and save state
            iteration_state["current"] = iteration_state.get("current", 1) + 1
            save_iteration_state(reviews_dir, iteration_state)

    # Build output with correct Claude Code hook format
    # See: https://docs.anthropic.com/en/docs/claude-code/hooks
    out: Dict[str, Any] = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": "".join(context_parts),
        }
    }

    # Handle blocking scenarios - use permissionDecision/permissionDecisionReason inside hookSpecificOutput
    # Note: md_content is already in additionalContext, so permissionDecisionReason only needs the instruction
    if needs_more_iterations:
        current = iteration_state["current"] - 1  # Display the just-completed iteration
        max_iter = iteration_state["max"]
        remaining = max_iter - current

        out["hookSpecificOutput"]["permissionDecision"] = "deny"
        out["hookSpecificOutput"]["permissionDecisionReason"] = (
            f"CC-Native plan review iteration {current}/{max_iter} verdict = {overall.upper()}. "
            f"REVISION REQUIRED: Address the issues in additionalContext. "
            f"Revise the plan in place, then attempt ExitPlanMode again. "
            f"({remaining} revision{'s' if remaining != 1 else ''} remaining)"
        )
    elif should_block:
        out["hookSpecificOutput"]["permissionDecision"] = "deny"
        out["hookSpecificOutput"]["permissionDecisionReason"] = (
            "CC-Native plan review verdict = FAIL. Do NOT start implementation yet. "
            "Revise the plan to address the issues in additionalContext, "
            "then attempt ExitPlanMode again."
        )

    mark_plan_reviewed(session_id, plan_hash, "cc-native-plan-review", iteration_state)
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
