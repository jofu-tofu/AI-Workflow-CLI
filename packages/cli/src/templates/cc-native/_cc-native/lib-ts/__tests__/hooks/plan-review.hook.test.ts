import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createTempDir, cleanupTempDir, createSampleState, createSampleIndex,
  writeStateJson, writeIndexJson, createSampleHookInput, runHookSubprocess,
} from "../../../../_core/lib-ts/__tests__/helpers.js";

const HOOK_PATH = path.resolve(".aiwcli/_cc-native/hooks/cc-native-plan-review.ts");

describe("cc-native-plan-review hook (wiring)", () => {
  let tmpDir: string;
  const sessionId = "sess-plan-review";
  const contextId = "ctx-plan-review";

  beforeEach(() => {
    tmpDir = createTempDir("hook-plan-review-");
    writeStateJson(tmpDir, contextId, createSampleState({
      id: contextId,
      session_ids: [sessionId],
    }));
    writeIndexJson(tmpDir, createSampleIndex(
      { [contextId]: { summary: "Test", mode: "active", last_active: "2026-02-08T10:00:00" } },
      { [sessionId]: contextId },
    ));
  });

  afterEach(() => cleanupTempDir(tmpDir));

  it("skips for internal subprocess calls", async () => {
    const input = createSampleHookInput({
      hook_event_name: "PreToolUse",
      tool_name: "ExitPlanMode",
      session_id: sessionId,
      cwd: tmpDir,
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
      _CC_INTERNAL: "1",
    });
    expect(result.exitCode).to.equal(0);
  });

  it("exits cleanly when no plan file exists", async () => {
    const input = createSampleHookInput({
      hook_event_name: "PreToolUse",
      tool_name: "ExitPlanMode",
      session_id: sessionId,
      cwd: tmpDir,
      permission_mode: "plan",
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    // Should exit 0 - no plan found, skips gracefully
    expect(result.exitCode).to.equal(0);
  });

  it("exits cleanly with no session_id", async () => {
    const input = createSampleHookInput({
      hook_event_name: "PreToolUse",
      tool_name: "ExitPlanMode",
      session_id: undefined,
      cwd: tmpDir,
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    expect(result.exitCode).to.equal(0);
  });
});
