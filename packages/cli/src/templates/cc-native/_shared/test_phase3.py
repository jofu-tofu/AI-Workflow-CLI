#!/usr/bin/env python3
"""Phase 3: Context-Aware Handoff Tests

Tests the handoff system for graceful context degradation:
1. Handoff document generation
2. Handoff status management
3. Context-aware hook behavior
4. Session continuation from handoff
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

# Add lib to path
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from lib.context.context_manager import (
    create_context,
    get_context,
    update_handoff_status,
    clear_handoff_status,
    get_context_with_handoff_pending,
)
from lib.context.event_log import read_events, get_pending_tasks
from lib.context.discovery import format_handoff_continuation, get_in_flight_context
from lib.handoff.document_generator import (
    generate_handoff_document,
    get_handoff_continuation_prompt,
    get_low_context_warning,
    HandoffDocument,
)


def test_handoff_document_generation(test_dir: Path) -> bool:
    """Test generating a handoff document."""
    print("\n--- Test: Handoff Document Generation ---")

    # Create a context first
    ctx = create_context(
        "handoff-test",
        "Testing handoff functionality",
        method="cc-native",
        project_root=test_dir
    )
    print(f"  Created context: {ctx.id}")

    # Generate handoff document
    doc = generate_handoff_document(
        context_id=ctx.id,
        reason="low_context",
        work_summary="Working on implementing JWT middleware. Token validation is complete but refresh token rotation needs work.",
        next_steps=[
            "Fix failing tests (4 remaining)",
            "Implement refresh token rotation",
            "Add token revocation endpoint",
        ],
        important_notes=[
            "Using HS256 for signing (per user preference)",
            "Refresh tokens stored in httpOnly cookies",
        ],
        completed_this_session=["Research auth patterns", "Set up test fixtures"],
        project_root=test_dir
    )

    if not doc:
        print("  FAIL: Failed to generate handoff document")
        return False

    print(f"  Generated document: {doc.file_path}")

    # Verify file exists
    if not Path(doc.file_path).exists():
        print("  FAIL: Handoff document file not created")
        return False

    # Verify content
    content = Path(doc.file_path).read_text()
    print(f"  Document length: {len(content)} chars")

    checks = [
        ("context ID in content", ctx.id in content),
        ("work summary in content", "JWT middleware" in content),
        ("next steps in content", "refresh token rotation" in content),
        ("important notes in content", "HS256" in content),
        ("completed tasks in content", "Research auth patterns" in content),
    ]

    for name, passed in checks:
        print(f"  - {name}: {'OK' if passed else 'FAIL'}")
        if not passed:
            return False

    # Verify event was recorded
    events = read_events(ctx.id, test_dir)
    handoff_events = [e for e in events if e.get("event") == "handoff_created"]
    if not handoff_events:
        print("  FAIL: handoff_created event not recorded")
        return False

    print(f"  Event recorded: {handoff_events[-1]}")

    print("  PASS: Handoff document generation")
    return True


def test_handoff_status_management(test_dir: Path) -> bool:
    """Test handoff status updates in context."""
    print("\n--- Test: Handoff Status Management ---")

    # Create a context
    ctx = create_context(
        "status-test",
        "Testing status management",
        project_root=test_dir
    )
    print(f"  Created context: {ctx.id}")

    # Verify initial state
    if ctx.in_flight.mode != "none":
        print(f"  FAIL: Initial mode should be 'none', got '{ctx.in_flight.mode}'")
        return False
    print("  Initial mode: none (OK)")

    # Update handoff status
    handoff_path = "_output/contexts/status-test/handoffs/test-handoff.md"
    updated = update_handoff_status(ctx.id, handoff_path, test_dir)

    if not updated:
        print("  FAIL: update_handoff_status returned None")
        return False

    if updated.in_flight.mode != "handoff_pending":
        print(f"  FAIL: Mode should be 'handoff_pending', got '{updated.in_flight.mode}'")
        return False

    if updated.in_flight.handoff_path != handoff_path:
        print(f"  FAIL: Handoff path not set correctly")
        return False

    print(f"  Mode after update: {updated.in_flight.mode} (OK)")
    print(f"  Handoff path: {updated.in_flight.handoff_path} (OK)")

    # Re-fetch and verify persistence
    refetched = get_context(ctx.id, test_dir)
    if refetched.in_flight.mode != "handoff_pending":
        print("  FAIL: Status not persisted")
        return False
    print("  Status persisted (OK)")

    # Clear handoff status
    cleared = clear_handoff_status(ctx.id, test_dir)
    if cleared.in_flight.mode != "none":
        print(f"  FAIL: Mode should be 'none' after clear, got '{cleared.in_flight.mode}'")
        return False

    if cleared.in_flight.handoff_path is not None:
        print("  FAIL: Handoff path should be None after clear")
        return False

    print("  Mode after clear: none (OK)")

    print("  PASS: Handoff status management")
    return True


def test_get_context_with_handoff_pending(test_dir: Path) -> bool:
    """Test finding context with handoff pending."""
    print("\n--- Test: Get Context With Handoff Pending ---")

    # First clear any existing handoff states from previous tests
    existing = get_context_with_handoff_pending(test_dir)
    while existing:
        clear_handoff_status(existing.id, test_dir)
        existing = get_context_with_handoff_pending(test_dir)

    # Create multiple contexts
    ctx1 = create_context("ctx-normal", "Normal context", project_root=test_dir)
    ctx2 = create_context("ctx-handoff", "Handoff context", project_root=test_dir)

    # Initially no handoff pending
    pending = get_context_with_handoff_pending(test_dir)
    if pending:
        print(f"  FAIL: Expected None, got {pending.id}")
        return False
    print("  No pending handoff initially (OK)")

    # Set handoff pending on ctx2
    update_handoff_status(ctx2.id, "/path/to/handoff.md", test_dir)

    # Now should find ctx2
    pending = get_context_with_handoff_pending(test_dir)
    if not pending:
        print("  FAIL: Expected to find pending context")
        return False

    if pending.id != ctx2.id:
        print(f"  FAIL: Expected {ctx2.id}, got {pending.id}")
        return False

    print(f"  Found pending context: {pending.id} (OK)")

    print("  PASS: Get context with handoff pending")
    return True


def test_handoff_continuation_format(test_dir: Path) -> bool:
    """Test formatting handoff continuation message."""
    print("\n--- Test: Handoff Continuation Format ---")

    # Create context and set handoff
    ctx = create_context(
        "format-test",
        "Testing format",
        project_root=test_dir
    )
    handoff_path = "_output/contexts/format-test/handoffs/2026-01-25-session-abc.md"
    update_handoff_status(ctx.id, handoff_path, test_dir)

    # Refetch to get updated in_flight
    ctx = get_context(ctx.id, test_dir)

    # Format continuation
    continuation = format_handoff_continuation(ctx)

    checks = [
        ("has title", "RESUMING FROM HANDOFF" in continuation),
        ("has context ID", ctx.id in continuation),
        ("has handoff path", handoff_path in continuation),
        ("has instructions", "Instructions" in continuation),
    ]

    for name, passed in checks:
        print(f"  - {name}: {'OK' if passed else 'FAIL'}")
        if not passed:
            print(f"    Content: {continuation[:200]}...")
            return False

    print("  PASS: Handoff continuation format")
    return True


def test_low_context_warning(test_dir: Path) -> bool:
    """Test low context warning generation."""
    print("\n--- Test: Low Context Warning ---")

    # Create context
    ctx = create_context(
        "warning-test",
        "Testing warning",
        project_root=test_dir
    )

    # Generate warning
    warning = get_low_context_warning(15, ctx.id)

    checks = [
        ("has system-reminder tag", "<system-reminder>" in warning),
        ("has percentage", "15%" in warning),
        ("has context ID", ctx.id in warning),
        ("has instructions", "Create handoff document" in warning),
    ]

    for name, passed in checks:
        print(f"  - {name}: {'OK' if passed else 'FAIL'}")
        if not passed:
            return False

    print("  PASS: Low context warning")
    return True


def test_in_flight_priority(test_dir: Path) -> bool:
    """Test that handoff_pending has highest priority in discovery."""
    print("\n--- Test: In-Flight Priority ---")

    # Create contexts with different in_flight states
    ctx1 = create_context("priority-implementing", "Implementing", project_root=test_dir)
    ctx2 = create_context("priority-handoff", "Handoff", project_root=test_dir)

    # Set ctx1 to implementing
    from lib.context.context_manager import update_plan_status
    update_plan_status(ctx1.id, "implementing", project_root=test_dir)

    # Set ctx2 to handoff_pending
    update_handoff_status(ctx2.id, "/path/to/handoff.md", test_dir)

    # Discovery should return handoff_pending first
    in_flight = get_in_flight_context(test_dir)

    if not in_flight:
        print("  FAIL: Expected to find in-flight context")
        return False

    if in_flight.id != ctx2.id:
        print(f"  FAIL: Expected handoff context '{ctx2.id}', got '{in_flight.id}'")
        return False

    print(f"  Highest priority: {in_flight.id} (mode: {in_flight.in_flight.mode}) (OK)")

    print("  PASS: In-flight priority")
    return True


def test_handoff_continuation_prompt(test_dir: Path) -> bool:
    """Test generating continuation prompt."""
    print("\n--- Test: Handoff Continuation Prompt ---")

    doc = HandoffDocument(
        context_id="prompt-test",
        context_summary="Test summary",
        session_id="abc123",
        reason="low_context",
        created_at="2026-01-25T14:00:00Z",
        file_path="_output/contexts/prompt-test/handoffs/2026-01-25-session-abc123.md"
    )

    prompt = get_handoff_continuation_prompt(doc)

    checks = [
        ("has context ID", doc.context_id in prompt),
        ("has file path", doc.file_path in prompt),
        ("has instructions", "TaskCreate" in prompt),
    ]

    for name, passed in checks:
        print(f"  - {name}: {'OK' if passed else 'FAIL'}")
        if not passed:
            return False

    print("  PASS: Handoff continuation prompt")
    return True


def run_tests():
    """Run all Phase 3 tests."""
    print("=" * 60)
    print("PHASE 3: Context-Aware Handoff Tests")
    print("=" * 60)

    # Create temp directory
    test_dir = Path(tempfile.mkdtemp(prefix="phase3_test_"))
    print(f"\nTest directory: {test_dir}")

    # Set as project root
    os.environ["CLAUDE_PROJECT_DIR"] = str(test_dir)

    results = []
    try:
        results.append(("Handoff Document Generation", test_handoff_document_generation(test_dir)))
        results.append(("Handoff Status Management", test_handoff_status_management(test_dir)))
        results.append(("Get Context With Handoff Pending", test_get_context_with_handoff_pending(test_dir)))
        results.append(("Handoff Continuation Format", test_handoff_continuation_format(test_dir)))
        results.append(("Low Context Warning", test_low_context_warning(test_dir)))
        results.append(("In-Flight Priority", test_in_flight_priority(test_dir)))
        results.append(("Handoff Continuation Prompt", test_handoff_continuation_prompt(test_dir)))

    finally:
        # Cleanup
        shutil.rmtree(test_dir, ignore_errors=True)
        if "CLAUDE_PROJECT_DIR" in os.environ:
            del os.environ["CLAUDE_PROJECT_DIR"]

    # Summary
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)

    passed = 0
    failed = 0
    for name, result in results:
        status = "PASS" if result else "FAIL"
        print(f"  {status}: {name}")
        if result:
            passed += 1
        else:
            failed += 1

    print(f"\nTotal: {passed}/{len(results)} passed")

    if failed > 0:
        print("\nSome tests failed!")
        sys.exit(1)
    else:
        print("\nAll tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    run_tests()
