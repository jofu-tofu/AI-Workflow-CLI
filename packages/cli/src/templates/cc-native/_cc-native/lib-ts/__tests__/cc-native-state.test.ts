import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getCcNativeState,
  saveCcNativeState,
  isPlanAlreadyReviewed,
  wasPlanPreviouslyDenied,
  markPlanReviewed,
  wasQuestionsAsked,
  markQuestionsAsked,
  getStuckDetectionState,
  updateStuckDetectionState,
} from "../cc-native-state.js";
import {
  createTempDir,
  cleanupTempDir,
  setProjectRoot,
  createSampleState,
  createSampleIndex,
  writeStateJson,
  writeIndexJson,
} from "./helpers.js";

describe("cc-native-state", () => {
  let tmpDir: string;
  let restoreRoot: () => void;
  const sessionId = "test-session-123";
  const contextId = "test-context";

  beforeEach(() => {
    tmpDir = createTempDir("ccnstate-test-");
    restoreRoot = setProjectRoot(tmpDir);

    // Set up context with session binding
    const state = createSampleState({
      id: contextId,
      session_ids: [sessionId],
      last_session: { session_id: sessionId, saved_at: "2026-02-08T10:30:00.000", save_reason: "test" },
    });
    writeStateJson(tmpDir, contextId, state);
    writeIndexJson(tmpDir, createSampleIndex(
      { [contextId]: { summary: "Test", mode: "active", last_active: "2026-02-08T10:30:00.000" } },
      { [sessionId]: contextId },
    ));
  });

  afterEach(() => {
    restoreRoot();
    cleanupTempDir(tmpDir);
  });

  describe("getCcNativeState", () => {
    it("returns null when no cc_native key", () => {
      const result = getCcNativeState(sessionId, tmpDir);
      expect(result).to.be.null;
    });

    it("returns cc_native object when present", () => {
      // Manually add cc_native to state
      const statePath = path.join(tmpDir, "_output", "contexts", contextId, "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.cc_native = { plan_review: { plan_hash: "abc", reviewed_at: "now", decision: "allow" } };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      const result = getCcNativeState(sessionId, tmpDir);
      expect(result).to.not.be.null;
      expect(result!.plan_review?.plan_hash).to.equal("abc");
    });

    it("returns null for unknown session", () => {
      expect(getCcNativeState("nonexistent", tmpDir)).to.be.null;
    });
  });

  describe("isPlanAlreadyReviewed", () => {
    it("returns false when no cc_native state", () => {
      expect(isPlanAlreadyReviewed(sessionId, "hash123", tmpDir)).to.be.false;
    });

    it("returns true when plan hash matches", () => {
      const statePath = path.join(tmpDir, "_output", "contexts", contextId, "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.cc_native = { plan_review: { plan_hash: "hash123", reviewed_at: "now", decision: "allow" } };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      expect(isPlanAlreadyReviewed(sessionId, "hash123", tmpDir)).to.be.true;
    });

    it("returns false when plan hash does not match", () => {
      const statePath = path.join(tmpDir, "_output", "contexts", contextId, "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.cc_native = { plan_review: { plan_hash: "other", reviewed_at: "now", decision: "allow" } };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      expect(isPlanAlreadyReviewed(sessionId, "hash123", tmpDir)).to.be.false;
    });
  });

  describe("wasPlanPreviouslyDenied", () => {
    it("returns false when no review state", () => {
      expect(wasPlanPreviouslyDenied(sessionId, "hash123", tmpDir)).to.be.false;
    });

    it("returns true for deny decision", () => {
      const statePath = path.join(tmpDir, "_output", "contexts", contextId, "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.cc_native = { plan_review: { plan_hash: "hash123", reviewed_at: "now", decision: "deny" } };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      expect(wasPlanPreviouslyDenied(sessionId, "hash123", tmpDir)).to.be.true;
    });

    it("returns true for hook_deny_iteration decision", () => {
      const statePath = path.join(tmpDir, "_output", "contexts", contextId, "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.cc_native = { plan_review: { plan_hash: "hash123", reviewed_at: "now", decision: "hook_deny_iteration" } };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      expect(wasPlanPreviouslyDenied(sessionId, "hash123", tmpDir)).to.be.true;
    });

    it("returns false for allow decision", () => {
      const statePath = path.join(tmpDir, "_output", "contexts", contextId, "state.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.cc_native = { plan_review: { plan_hash: "abc123", reviewed_at: "now", decision: "allow" } };
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      expect(wasPlanPreviouslyDenied(sessionId, "hash123", tmpDir)).to.be.false;
    });
  });

  describe("wasQuestionsAsked", () => {
    it("returns false when no questions state", () => {
      expect(wasQuestionsAsked(sessionId, tmpDir)).to.be.false;
    });
  });

  describe("markQuestionsAsked", () => {
    it("marks questions as asked", () => {
      const result = markQuestionsAsked(sessionId, tmpDir);
      expect(result).to.be.true;
      expect(wasQuestionsAsked(sessionId, tmpDir)).to.be.true;
    });
  });

  describe("getStuckDetectionState", () => {
    it("returns null when no stuck detection state", () => {
      expect(getStuckDetectionState(sessionId, tmpDir)).to.be.null;
    });
  });

  describe("updateStuckDetectionState", () => {
    it("saves and retrieves stuck detection state", () => {
      const stuckState = {
        error_hashes: ["hash1"],
        file_edits: { "file.ts": 3 },
        test_failures: 2,
        tool_calls_since_suggestion: 5,
        suggestion_count: 1,
      };
      const ok = updateStuckDetectionState(sessionId, tmpDir, stuckState as any);
      expect(ok).to.be.true;

      const retrieved = getStuckDetectionState(sessionId, tmpDir);
      expect(retrieved).to.not.be.null;
      expect(retrieved!.error_hashes).to.deep.equal(["hash1"]);
    });
  });
});
