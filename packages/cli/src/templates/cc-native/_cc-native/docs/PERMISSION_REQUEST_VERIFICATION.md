# PermissionRequest Hook Verification Plan

## Objective

Verify that `PermissionRequest` event can be used for plan archiving instead of the current `PreToolUse` + state file approach.

## Current Implementation

```
PreToolUse: ExitPlanMode
├── set_plan_state.py     (creates state file with task_folder)
└── cc-native-plan-review.py (runs agent reviews, saves to task_folder)

PreToolUse: Edit|Write|Bash
└── archive_plan.py       (archives plan on first implementation tool)

Stop:
└── archive_plan.py       (backup archive if session ends)
```

## Proposed Simplification

```
PreToolUse: ExitPlanMode
├── set_plan_state.py     (creates state file with task_folder)
└── cc-native-plan-review.py (runs reviews, saves to task_folder)

PermissionRequest: ExitPlanMode   ← NEW
└── archive_plan.py       (archives immediately after reviews complete)

(REMOVE Edit|Write|Bash and Stop triggers for archive_plan.py)
```

## Verification Steps

### Step 1: Deploy Test Hook

The test hook has been added:
- **Hook:** `_cc-native/hooks/test_permission_request.py`
- **Config:** `PermissionRequest` entry in `.claude/settings.json`
- **Output:** `~/.claude/permission_request_payload.json`

### Step 2: Trigger Plan Mode

1. Start Claude Code with cc-native template:
   ```bash
   cd /path/to/project-with-cc-native
   claude --plan
   ```

2. Create a simple plan (any task works)

3. When plan is ready, Claude calls `ExitPlanMode`

### Step 3: Check Results

After Claude calls `ExitPlanMode`, check:

```bash
# Check if payload was logged
cat ~/.claude/permission_request_payload.json
```

Expected output:
```json
{
  "received_at": "2026-01-20T...",
  "payload": {
    "tool_name": "ExitPlanMode",
    "session_id": "...",
    "cwd": "...",
    "tool_input": {...}
  },
  "analysis": {
    "has_tool_name": true,
    "has_session_id": true,
    "has_cwd": true,
    "has_tool_input": true,
    "tool_name": "ExitPlanMode",
    "payload_keys": ["tool_name", "session_id", "cwd", "tool_input", ...]
  }
}
```

### Step 4: Verify Timing

Check stderr logs during plan mode exit:

```
[set_plan_state] Hook started (PreToolUse)
[set_plan_state] Created state file: ...
[cc-native-plan-review] Hook started...
[cc-native-plan-review] Review complete...
[test_permission_request] Hook started (PermissionRequest)  ← Should appear AFTER reviews
[test_permission_request] SUCCESS: All required fields present
```

**Critical timing requirement:** PermissionRequest must fire:
1. AFTER PreToolUse hooks complete (reviews done)
2. BEFORE user sees the approval prompt

## Decision Checklist

After verification, update this checklist:

- [ ] PermissionRequest fires for ExitPlanMode
- [ ] Payload contains `tool_name`
- [ ] Payload contains `session_id`
- [ ] Payload contains `cwd`
- [ ] Timing: fires AFTER PreToolUse
- [ ] Timing: fires BEFORE user prompt shown
- [ ] `archive_plan.py` works with PermissionRequest payload (or minimal changes needed)

## Phase 2: Migration (if verified)

If all checks pass:

1. Modify `archive_plan.py` if needed for PermissionRequest payload
2. Add production PermissionRequest entry for archive_plan.py
3. Remove `Edit|Write|Bash` PreToolUse entry for archive_plan.py
4. Remove `Stop` entry for archive_plan.py
5. Remove test_permission_request.py hook
6. Test full flow end-to-end

## Potential Issues

### Issue 1: PermissionRequest may not fire for ExitPlanMode

ExitPlanMode is a special tool that shows the plan approval prompt. It's possible that:
- PermissionRequest only fires for dangerous tools (Bash, Write, etc.)
- ExitPlanMode uses a different permission flow

**Mitigation:** The test hook will confirm whether it fires or not.

### Issue 2: Different payload structure

PermissionRequest may have different fields than PreToolUse.

**Mitigation:** The test hook logs all payload keys for analysis.

### Issue 3: Timing may be wrong

PermissionRequest might fire BEFORE PreToolUse hooks complete (before reviews).

**Mitigation:** Check stderr log ordering during test.

## Cleanup

After verification:
1. Remove `test_permission_request.py` hook
2. Remove PermissionRequest test entry from settings.json
3. Delete `~/.claude/permission_request_payload.json`
4. Document findings in this file
