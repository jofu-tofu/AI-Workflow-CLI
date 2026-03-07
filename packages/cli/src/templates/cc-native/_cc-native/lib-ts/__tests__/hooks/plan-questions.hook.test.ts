import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createTempDir, cleanupTempDir, createSampleState, createSampleIndex,
  writeStateJson, writeIndexJson, createSampleHookInput, runHookSubprocess,
} from "../../../../_core/lib-ts/__tests__/helpers.js";

const HOOK_PATH = path.resolve(".aiwcli/_cc-native/hooks/plan_questions_early.ts");

describe("plan_questions_early hook", () => {
  let tmpDir: string;
  const sessionId = "sess-plan-q";
  const contextId = "ctx-plan-q";

  beforeEach(() => {
    tmpDir = createTempDir("hook-plan-questions-");
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

  it("injects Phase A prompt in plan mode", async () => {
    const input = createSampleHookInput({
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      cwd: tmpDir,
      permission_mode: "plan",
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    expect(result.exitCode).to.equal(0);
    // Should emit Phase A context
    if (result.json?.hookSpecificOutput?.additionalContext) {
      expect(result.json.hookSpecificOutput.additionalContext).to.include("Clarify Before Exploring");
    }
  });

  it("skips when not in plan mode", async () => {
    const input = createSampleHookInput({
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      cwd: tmpDir,
      permission_mode: "default",
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    expect(result.exitCode).to.equal(0);
    // Should not emit anything
    expect(result.stdout.trim()).to.equal("");
  });

  it("skips when questions already asked", async () => {
    // Set questions_asked in state
    const statePath = path.join(tmpDir, "_output", "contexts", contextId, "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    state.cc_native = { questions_asked: { asked: true, asked_at: "2026-02-08T10:00:00" } };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const input = createSampleHookInput({
      hook_event_name: "UserPromptSubmit",
      session_id: sessionId,
      cwd: tmpDir,
      permission_mode: "plan",
    });
    const result = await runHookSubprocess(HOOK_PATH, input, {
      CLAUDE_PROJECT_DIR: tmpDir,
    });
    expect(result.exitCode).to.equal(0);
    expect(result.stdout.trim()).to.equal("");
  });
});
