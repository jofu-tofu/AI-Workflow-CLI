import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createTempDir, cleanupTempDir, createSampleState, createSampleIndex,
  writeStateJson, writeIndexJson, createSampleHookInput, runHookSubprocess,
} from "../../../../_shared/lib-ts/__tests__/helpers.js";

const HOOK_PATH = path.resolve(".aiwcli/_cc-native/hooks/add_plan_context.ts");

describe("add_plan_context hook", () => {
  let tmpDir: string;
  const sessionId = "sess-plan-ctx";
  const contextId = "ctx-plan-ctx";

  beforeEach(() => {
    tmpDir = createTempDir("hook-add-plan-ctx-");
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
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      session_id: sessionId,
      cwd: tmpDir,
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
      _CC_INTERNAL: "1",
    });
    expect(result.exitCode).to.equal(0);
  });

  it("marks questions asked on AskUserQuestion event", async () => {
    const input = createSampleHookInput({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      session_id: sessionId,
      cwd: tmpDir,
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    expect(result.exitCode).to.equal(0);

    // Verify cc_native.questions_asked was set
    const state = JSON.parse(fs.readFileSync(
      path.join(tmpDir, "_output", "contexts", contextId, "state.json"), "utf-8",
    ));
    expect(state.cc_native?.questions_asked?.asked).to.equal(true);
  });

  it("emits context for Plan Task when questions not asked", async () => {
    const input = createSampleHookInput({
      hook_event_name: "PreToolUse",
      tool_name: "Task",
      tool_input: { subagent_type: "Plan", prompt: "Make a plan" },
      session_id: sessionId,
      cwd: tmpDir,
      permission_mode: "plan",
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    expect(result.exitCode).to.equal(0);
    // Should emit advisory context
    if (result.json?.hookSpecificOutput?.additionalContext) {
      expect(result.json.hookSpecificOutput.additionalContext).to.include("AskUserQuestion");
    }
  });

  it("skips for non-Plan Task tool", async () => {
    const input = createSampleHookInput({
      hook_event_name: "PreToolUse",
      tool_name: "Task",
      tool_input: { subagent_type: "Explore", prompt: "Search code" },
      session_id: sessionId,
      cwd: tmpDir,
      permission_mode: "plan",
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    expect(result.exitCode).to.equal(0);
    // Should not emit any context for non-Plan tasks
  });
});
