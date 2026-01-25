#!/usr/bin/env python3
"""
Phase 1 Verification Script for Shared Context Management Infrastructure.

This script verifies all Phase 1 criteria from the implementation plan:
1. create_context() creates folder in _output/contexts/ (not method subfolder)
2. get_all_contexts() returns all active contexts sorted by recency
3. complete_context() appends event and updates caches
4. append_event() appends to JSONL without corruption
5. read_events() handles corrupted lines gracefully
6. events.jsonl is append-only
7. context.json can be rebuilt from events.jsonl
8. context.json includes in_flight state (no separate .state.json)
9. index.json can be rebuilt from context.json files
10. All data written to _output/contexts/, no method subfolders

Run from project root: python _shared/test_phase1.py
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Set up import path
_script_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_script_dir))

from lib.base.constants import get_contexts_dir, get_context_dir, get_index_path
from lib.context.context_manager import (
    create_context,
    get_context,
    get_all_contexts,
    complete_context,
    update_plan_status,
    get_context_with_pending_plan,
)
from lib.context.event_log import (
    append_event,
    read_events,
    get_current_state,
    are_all_tasks_completed,
    EVENT_TASK_ADDED,
    EVENT_TASK_COMPLETED,
)
from lib.context.cache import (
    rebuild_context_from_events,
    rebuild_index_from_folders,
    verify_cache_integrity,
)


class TestRunner:
    """Simple test runner with ASCII-safe output (Windows compatible)."""

    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.test_root = None

    def setup(self):
        """Create temporary test directory."""
        self.test_root = Path(tempfile.mkdtemp(prefix="phase1_test_"))
        os.environ["CLAUDE_PROJECT_DIR"] = str(self.test_root)
        print(f"\n[DIR] Test root: {self.test_root}\n")

    def teardown(self):
        """Clean up test directory."""
        if self.test_root and self.test_root.exists():
            shutil.rmtree(self.test_root)
        print(f"\n[CLEANUP] Cleaned up test directory\n")

    def test(self, name: str, condition: bool, message: str = ""):
        """Run a single test assertion."""
        if condition:
            print(f"  [PASS] {name}")
            self.passed += 1
        else:
            print(f"  [FAIL] {name}")
            if message:
                print(f"     -> {message}")
            self.failed += 1

    def section(self, name: str):
        """Print section header."""
        print(f"\n{'='*60}")
        print(f"[TEST] {name}")
        print(f"{'='*60}")

    def results(self) -> bool:
        """Print final results and return success status."""
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"[RESULTS] {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"[FAILED] {self.failed} tests failed")
            return False
        else:
            print("[SUCCESS] All tests passed!")
            return True


def run_tests():
    """Run all Phase 1 verification tests."""
    runner = TestRunner()

    try:
        runner.setup()
        project_root = runner.test_root

        # ============================================================
        runner.section("Test 1: Context Creation in _output/contexts/")
        # ============================================================

        ctx1 = create_context(
            "test-auth",
            "JWT authentication system",
            method="cc-native",
            tags=["auth", "security"],
            project_root=project_root
        )

        runner.test(
            "Context created with correct ID",
            ctx1.id == "test-auth",
            f"Got: {ctx1.id}"
        )

        ctx_dir = get_context_dir("test-auth", project_root)
        runner.test(
            "Context folder exists in _output/contexts/",
            ctx_dir.exists(),
            f"Path: {ctx_dir}"
        )

        runner.test(
            "No method subfolder in path",
            "cc-native" not in str(ctx_dir),
            f"Path should not contain method: {ctx_dir}"
        )

        runner.test(
            "events.jsonl created",
            (ctx_dir / "events.jsonl").exists()
        )

        runner.test(
            "context.json created",
            (ctx_dir / "context.json").exists()
        )

        # ============================================================
        runner.section("Test 2: Event Logging (JSONL)")
        # ============================================================

        # Add a task
        append_event(
            "test-auth",
            EVENT_TASK_ADDED,
            project_root,
            task_id="task-1",
            subject="Add JWT middleware",
            description="Create bearer token validation"
        )

        events = read_events("test-auth", project_root)
        runner.test(
            "Events can be read from JSONL",
            len(events) >= 2,  # context_created + task_added
            f"Found {len(events)} events"
        )

        runner.test(
            "Events are in chronological order",
            events[0]["event"] == "context_created" and events[-1]["event"] == "task_added"
        )

        # Verify append-only (check file content directly)
        events_path = ctx_dir / "events.jsonl"
        lines = events_path.read_text().strip().split('\n')
        runner.test(
            "JSONL has correct number of lines",
            len(lines) == len(events),
            f"Lines: {len(lines)}, Events: {len(events)}"
        )

        # ============================================================
        runner.section("Test 3: Corrupted Line Handling")
        # ============================================================

        # Inject a corrupted line
        with open(events_path, 'a') as f:
            f.write("NOT VALID JSON\n")

        events_after = read_events("test-auth", project_root)
        runner.test(
            "Corrupted lines are skipped gracefully",
            len(events_after) == len(events),
            f"Should still have {len(events)} valid events, got {len(events_after)}"
        )

        # ============================================================
        runner.section("Test 4: Get All Contexts (Sorted)")
        # ============================================================

        # Create a second context
        ctx2 = create_context(
            "test-db",
            "Database migration",
            method="gsd",
            project_root=project_root
        )

        all_contexts = get_all_contexts(project_root=project_root)
        runner.test(
            "get_all_contexts returns both contexts",
            len(all_contexts) == 2,
            f"Found {len(all_contexts)} contexts"
        )

        runner.test(
            "Contexts sorted by last_active (most recent first)",
            all_contexts[0].id == "test-db",  # Created more recently
            f"First context: {all_contexts[0].id}"
        )

        # Filter by method
        cc_native_only = get_all_contexts(method="cc-native", project_root=project_root)
        runner.test(
            "Filter by method works",
            len(cc_native_only) == 1 and cc_native_only[0].id == "test-auth"
        )

        # ============================================================
        runner.section("Test 5: Context Completion")
        # ============================================================

        completed = complete_context("test-auth", project_root)
        runner.test(
            "complete_context returns updated context",
            completed is not None and completed.status == "completed"
        )

        # Verify event was appended
        events_after_complete = read_events("test-auth", project_root)
        completion_events = [e for e in events_after_complete if e["event"] == "context_completed"]
        runner.test(
            "context_completed event appended",
            len(completion_events) == 1
        )

        # Verify filter by status
        active_only = get_all_contexts(status="active", project_root=project_root)
        runner.test(
            "Filter by status=active excludes completed",
            len(active_only) == 1 and active_only[0].id == "test-db"
        )

        # ============================================================
        runner.section("Test 6: Plan Status (in_flight state)")
        # ============================================================

        update_plan_status(
            "test-db",
            "pending_implementation",
            path="_output/contexts/test-db/plans/plan.md",
            hash="abc123",
            project_root=project_root
        )

        ctx_with_plan = get_context("test-db", project_root)
        runner.test(
            "in_flight.mode updated to pending_implementation",
            ctx_with_plan.in_flight.mode == "pending_implementation",
            f"Got: {ctx_with_plan.in_flight.mode}"
        )

        runner.test(
            "in_flight.artifact_path set correctly",
            ctx_with_plan.in_flight.artifact_path is not None
        )

        pending_plan_ctx = get_context_with_pending_plan(project_root)
        runner.test(
            "get_context_with_pending_plan finds context",
            pending_plan_ctx is not None and pending_plan_ctx.id == "test-db"
        )

        # context.json should have in_flight (not separate .state.json)
        context_json_path = ctx_dir.parent / "test-db" / "context.json"
        ctx_data = json.loads(context_json_path.read_text())
        runner.test(
            "context.json contains in_flight field",
            "in_flight" in ctx_data
        )

        state_json_path = ctx_dir.parent / "test-db" / ".state.json"
        runner.test(
            "No separate .state.json file",
            not state_json_path.exists()
        )

        # ============================================================
        runner.section("Test 7: Cache Rebuild from Events")
        # ============================================================

        # Delete context.json cache
        ctx_db_json = ctx_dir.parent / "test-db" / "context.json"
        ctx_db_json.unlink()

        # Rebuild from events
        rebuilt = rebuild_context_from_events(ctx_dir.parent / "test-db")
        runner.test(
            "Context rebuilt from events.jsonl",
            rebuilt is not None,
        )

        runner.test(
            "Rebuilt context has correct status",
            rebuilt.status == "active",
            f"Got: {rebuilt.status}"
        )

        runner.test(
            "Rebuilt context has correct in_flight.mode",
            rebuilt.in_flight.mode == "pending_implementation",
            f"Got: {rebuilt.in_flight.mode}"
        )

        # ============================================================
        runner.section("Test 8: Index Rebuild from Folders")
        # ============================================================

        # Delete index.json
        index_path = get_index_path(project_root)
        if index_path.exists():
            index_path.unlink()

        # Rebuild index
        index = rebuild_index_from_folders(project_root)
        runner.test(
            "Index rebuilt from context folders",
            len(index["contexts"]) == 2,
            f"Found {len(index['contexts'])} contexts in index"
        )

        runner.test(
            "Index has version field",
            index.get("version") == "2.0"
        )

        # ============================================================
        runner.section("Test 9: Task State Tracking")
        # ============================================================

        # Create fresh context for task testing
        ctx3 = create_context("test-tasks", "Task tracking test", project_root=project_root)

        # Add tasks
        append_event("test-tasks", EVENT_TASK_ADDED, project_root,
                    task_id="t1", subject="Task 1")
        append_event("test-tasks", EVENT_TASK_ADDED, project_root,
                    task_id="t2", subject="Task 2")

        runner.test(
            "Tasks not all completed initially",
            not are_all_tasks_completed("test-tasks", project_root)
        )

        # Complete both tasks
        append_event("test-tasks", EVENT_TASK_COMPLETED, project_root,
                    task_id="t1", evidence="Done 1")
        append_event("test-tasks", EVENT_TASK_COMPLETED, project_root,
                    task_id="t2", evidence="Done 2")

        runner.test(
            "Tasks all completed after completion events",
            are_all_tasks_completed("test-tasks", project_root)
        )

        state = get_current_state("test-tasks", project_root)
        runner.test(
            "get_current_state returns correct task count",
            len(state.tasks) == 2
        )

        runner.test(
            "All tasks have completed status",
            all(t.status == "completed" for t in state.tasks)
        )

        # ============================================================
        runner.section("Test 10: Cache Integrity Verification")
        # ============================================================

        # Restore caches first
        from lib.context.cache import rebuild_all_caches
        rebuild_all_caches(project_root)

        report = verify_cache_integrity(project_root)
        runner.test(
            "Cache integrity check passes",
            report["ok"],
            f"Issues: {report.get('issues', [])}"
        )

        runner.test(
            "All contexts checked",
            report["contexts_checked"] == 3  # test-auth, test-db, test-tasks
        )

    finally:
        runner.teardown()

    return runner.results()


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
