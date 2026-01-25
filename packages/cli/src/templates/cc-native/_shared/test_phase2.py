#!/usr/bin/env python3
"""Phase 2 verification tests for SessionStart discovery and plan handoff.

Run from project root:
    python _shared/test_phase2.py

Tests:
1. Discovery module formatting functions
2. Task sync hydration instructions
3. Plan archive to context
4. SessionStart hook integration
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Add lib to path
script_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(script_dir))

from lib.context import (
    # Context manager
    create_context,
    get_context,
    get_all_contexts,
    update_plan_status,
    get_context_with_pending_plan,
    get_context_with_in_flight_work,
    # Event log
    append_event,
    get_current_state,
    get_pending_tasks,
    # Discovery
    discover_contexts_for_session,
    get_in_flight_context,
    format_context_list,
    format_pending_plan_continuation,
    format_handoff_continuation,
    format_implementation_continuation,
    format_context_picker_prompt,
    format_ready_for_new_work,
    # Task sync
    generate_hydration_instructions,
    generate_task_summary,
    record_session_start,
    record_task_created,
    generate_next_task_id,
    # Plan archive
    archive_plan_to_context,
    get_active_context_for_plan,
    create_context_from_plan,
    mark_plan_implementation_started,
)
from lib.base.constants import get_contexts_dir, get_context_plans_dir


def setup_test_dir():
    """Create temporary test directory."""
    test_dir = Path(tempfile.mkdtemp(prefix="phase2_test_"))
    os.chdir(test_dir)
    return test_dir


def cleanup_test_dir(test_dir: Path):
    """Clean up test directory."""
    os.chdir(Path.home())
    shutil.rmtree(test_dir, ignore_errors=True)


def test_discovery_formatting():
    """Test discovery module formatting functions."""
    print("\n=== Test: Discovery Formatting ===")

    # Create test context
    ctx = create_context("test-discovery", "Test discovery formatting")

    # Test format_context_list
    contexts = get_all_contexts()
    output = format_context_list(contexts)
    assert "test-discovery" in output, "Context name should be in list"
    assert "Test discovery formatting" in output, "Summary should be in list"
    print("  format_context_list: OK")

    # Test format_ready_for_new_work
    output = format_ready_for_new_work()
    assert "Ready" in output or "ready" in output or "No active" in output
    print("  format_ready_for_new_work: OK")

    # Test format_context_picker_prompt
    output = format_context_picker_prompt()
    assert "continue" in output.lower() or "which" in output.lower()
    print("  format_context_picker_prompt: OK")

    print("  PASSED: Discovery formatting")


def test_plan_continuation_formatting():
    """Test plan continuation formatting."""
    print("\n=== Test: Plan Continuation Formatting ===")

    # Create context with pending plan
    ctx = create_context("test-plan", "Test plan continuation")
    update_plan_status(
        "test-plan",
        status="pending_implementation",
        path="_output/contexts/test-plan/plans/test.md",
        hash="abc123"
    )

    # Reload context
    ctx = get_context("test-plan")
    assert ctx.in_flight.mode == "pending_implementation"

    # Test format_pending_plan_continuation
    output = format_pending_plan_continuation(ctx)
    assert "test-plan" in output, "Context ID should be in output"
    assert "pending" in output.lower() or "implementation" in output.lower()
    print("  format_pending_plan_continuation: OK")

    # Test format_implementation_continuation
    update_plan_status("test-plan", status="implementing")
    ctx = get_context("test-plan")
    output = format_implementation_continuation(ctx)
    assert "test-plan" in output
    print("  format_implementation_continuation: OK")

    print("  PASSED: Plan continuation formatting")


def test_task_sync():
    """Test task synchronization functions."""
    print("\n=== Test: Task Sync ===")

    # Create context with tasks
    ctx = create_context("test-tasks", "Test task synchronization")

    # Add tasks via events
    record_task_created("test-tasks", "aiw-1", "First task", "Description 1")
    record_task_created("test-tasks", "aiw-2", "Second task", "Description 2")

    # Verify tasks exist
    pending = get_pending_tasks("test-tasks")
    assert len(pending) == 2, f"Expected 2 pending tasks, got {len(pending)}"
    print("  record_task_created: OK")

    # Test hydration instructions
    instructions = generate_hydration_instructions("test-tasks")
    assert "First task" in instructions
    assert "Second task" in instructions
    assert "TaskCreate" in instructions
    print("  generate_hydration_instructions: OK")

    # Test task summary
    summary = generate_task_summary("test-tasks")
    assert "First task" in summary
    assert "Pending" in summary
    print("  generate_task_summary: OK")

    # Test next task ID generation
    next_id = generate_next_task_id("test-tasks")
    assert next_id == "aiw-3", f"Expected aiw-3, got {next_id}"
    print("  generate_next_task_id: OK")

    # Test session start recording
    success = record_session_start("test-tasks", tasks_hydrated=["aiw-1", "aiw-2"])
    assert success
    print("  record_session_start: OK")

    print("  PASSED: Task sync")


def test_plan_archive():
    """Test plan archival functions."""
    print("\n=== Test: Plan Archive ===")

    # Create a context
    ctx = create_context("test-archive", "Test plan archival")

    # Create a test plan file that matches the context name
    # (so get_active_context_for_plan can find it even with multiple contexts)
    plans_dir = get_context_plans_dir("test-archive")
    plans_dir.mkdir(parents=True, exist_ok=True)

    test_plan_path = Path("test-archive-plan.md")
    test_plan_path.write_text("# Test Plan\n\nThis is a test plan.", encoding='utf-8')

    # Test get_active_context_for_plan - should match by name in path
    active_ctx = get_active_context_for_plan(str(test_plan_path))
    assert active_ctx == "test-archive", f"Expected test-archive, got {active_ctx}"
    print("  get_active_context_for_plan (name matching): OK")

    # Test archive_plan_to_context
    archived_path, plan_hash = archive_plan_to_context(str(test_plan_path), "test-archive")
    assert archived_path is not None, "Archive path should not be None"
    assert plan_hash is not None, "Plan hash should not be None"
    assert Path(archived_path).exists(), f"Archived plan should exist at {archived_path}"
    print("  archive_plan_to_context: OK")

    # Verify context was updated
    ctx = get_context("test-archive")
    assert ctx.in_flight.mode == "pending_implementation"
    assert ctx.in_flight.artifact_path == archived_path
    print("  Context updated with pending plan: OK")

    # Test mark_plan_implementation_started
    success = mark_plan_implementation_started("test-archive")
    assert success
    ctx = get_context("test-archive")
    assert ctx.in_flight.mode == "implementing"
    print("  mark_plan_implementation_started: OK")

    # Cleanup
    if test_plan_path.exists():
        test_plan_path.unlink()

    print("  PASSED: Plan archive")


def test_create_context_from_plan():
    """Test creating context from plan file."""
    print("\n=== Test: Create Context from Plan ===")

    # Create a test plan file
    test_plan_path = Path("new-feature-plan.md")
    test_plan_path.write_text("# New Feature Implementation\n\nPlan details here.", encoding='utf-8')

    # Clear any existing contexts by moving to fresh state
    # (Actually we'll create a unique context)

    # Test create_context_from_plan
    context_id = create_context_from_plan(str(test_plan_path))
    assert context_id is not None, "Should create context"
    assert "new-feature" in context_id.lower() or "plan" in context_id.lower()
    print(f"  Created context: {context_id}")

    # Verify context exists
    ctx = get_context(context_id)
    assert ctx is not None
    print("  create_context_from_plan: OK")

    # Cleanup
    test_plan_path.unlink()

    print("  PASSED: Create context from plan")


def test_discovery_integration():
    """Test discover_contexts_for_session integration."""
    print("\n=== Test: Discovery Integration ===")

    # Clear contexts by creating fresh
    ctx1 = create_context("discovery-int-1", "First integration context")
    ctx2 = create_context("discovery-int-2", "Second integration context")

    # Set up pending plan on ctx2
    update_plan_status(
        "discovery-int-2",
        status="pending_implementation",
        path="test/plan.md",
        hash="xyz789"
    )

    # Test discover_contexts_for_session
    active, pending = discover_contexts_for_session()

    # Should find both active contexts
    active_ids = {c.id for c in active}
    assert "discovery-int-1" in active_ids
    assert "discovery-int-2" in active_ids
    print("  discover_contexts_for_session (active): OK")

    # Should identify pending plan context
    assert pending is not None
    assert pending.id == "discovery-int-2"
    print("  discover_contexts_for_session (pending): OK")

    # Test get_in_flight_context
    in_flight = get_in_flight_context()
    assert in_flight is not None
    assert in_flight.id == "discovery-int-2"
    print("  get_in_flight_context: OK")

    print("  PASSED: Discovery integration")


def run_all_tests():
    """Run all Phase 2 tests."""
    print("=" * 60)
    print("PHASE 2 VERIFICATION TESTS")
    print("SessionStart Discovery + Plan Handoff")
    print("=" * 60)

    test_dir = setup_test_dir()
    print(f"\nTest directory: {test_dir}")

    try:
        test_discovery_formatting()
        test_plan_continuation_formatting()
        test_task_sync()
        test_plan_archive()
        test_create_context_from_plan()
        test_discovery_integration()

        print("\n" + "=" * 60)
        print("ALL PHASE 2 TESTS PASSED!")
        print("=" * 60)

    except AssertionError as e:
        print(f"\nTEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        cleanup_test_dir(test_dir)


if __name__ == "__main__":
    run_all_tests()
