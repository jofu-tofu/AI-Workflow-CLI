import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  getStateFilePath,
  getIterationState,
  updateIterationState,
  shouldContinueIterating,
} from "../state.js";
import { PLANS_DIR } from "../constants.js";
import type { IterationState } from "../types.js";

describe("state", () => {
  describe("getStateFilePath", () => {
    it("derives .state.json from .md path", () => {
      const planPath = path.join(PLANS_DIR, "my-plan.md");
      const result = getStateFilePath(planPath);
      expect(result).to.match(/my-plan\.state\.json$/);
    });

    it("throws for path outside PLANS_DIR", () => {
      expect(() => getStateFilePath(path.join(os.tmpdir(), "evil.md"))).to.throw();
    });
  });

  describe("getIterationState", () => {
    it("returns existing iteration state from state object", () => {
      const existing: IterationState = {
        current: 2,
        max: 3,
        complexity: "high",
        history: [],
      };
      const state = { iteration: existing };
      const result = getIterationState(state, "medium");
      expect(result.current).to.equal(2);
      expect(result.complexity).to.equal("high");
    });

    it("initializes new iteration state with default max", () => {
      const result = getIterationState({}, "simple");
      expect(result.current).to.equal(1);
      expect(result.max).to.equal(1);
      expect(result.complexity).to.equal("simple");
      expect(result.history).to.deep.equal([]);
    });

    it("uses config overrides for max iterations", () => {
      const config = { reviewIterations: { simple: 5 } };
      const result = getIterationState({}, "simple", config);
      expect(result.max).to.equal(5);
    });

    it("defaults to 1 for unknown complexity", () => {
      const result = getIterationState({}, "unknown");
      expect(result.max).to.equal(1);
    });

    it("uses high complexity default (2 iterations)", () => {
      const result = getIterationState({}, "high");
      expect(result.max).to.equal(2);
    });
  });

  describe("updateIterationState", () => {
    it("adds entry to history", () => {
      const iteration: IterationState = {
        current: 1,
        max: 2,
        complexity: "medium",
        history: [],
      };
      const state: Record<string, unknown> = {};
      const result = updateIterationState(state, iteration, "hash123", "pass");
      expect(iteration.history).to.have.length(1);
      expect(iteration.history[0]?.hash).to.equal("hash123");
      expect(iteration.history[0]?.verdict).to.equal("pass");
      expect(result.iteration).to.equal(iteration);
    });
  });

  describe("shouldContinueIterating", () => {
    it("returns false when at max iterations", () => {
      const iteration: IterationState = {
        current: 2,
        max: 2,
        complexity: "high",
        history: [],
      };
      expect(shouldContinueIterating(iteration, "warn")).to.be.false;
    });

    it("returns false on pass with earlyExitOnAllPass (default)", () => {
      const iteration: IterationState = {
        current: 1,
        max: 3,
        complexity: "high",
        history: [],
      };
      expect(shouldContinueIterating(iteration, "pass")).to.be.false;
    });

    it("returns true when below max and verdict is not pass", () => {
      const iteration: IterationState = {
        current: 1,
        max: 3,
        complexity: "high",
        history: [],
      };
      expect(shouldContinueIterating(iteration, "warn")).to.be.true;
    });

    it("continues on pass when earlyExitOnAllPass is false", () => {
      const iteration: IterationState = {
        current: 1,
        max: 3,
        complexity: "high",
        history: [],
      };
      expect(shouldContinueIterating(iteration, "pass", { earlyExitOnAllPass: false })).to.be.true;
    });
  });
});
