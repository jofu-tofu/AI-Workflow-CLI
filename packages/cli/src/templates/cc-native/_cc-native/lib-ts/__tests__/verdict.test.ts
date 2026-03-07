import { expect } from "chai";
import { worstVerdict, computeReviewDecision } from "../verdict.js";
import type { Verdict } from "../types.js";

describe("verdict", () => {
  describe("worstVerdict", () => {
    it("returns pass for empty list", () => {
      expect(worstVerdict([])).to.equal("pass");
    });

    it("returns pass for all pass", () => {
      expect(worstVerdict(["pass", "pass", "pass"])).to.equal("pass");
    });

    it("returns warn when warn present", () => {
      expect(worstVerdict(["pass", "warn", "pass"])).to.equal("warn");
    });

    it("returns fail when fail present", () => {
      expect(worstVerdict(["pass", "warn", "fail"])).to.equal("fail");
    });

    it("maps skip to pass level (worst stays pass)", () => {
      // skip has same priority as pass (0), so worst remains "pass"
      expect(worstVerdict(["skip", "skip"])).to.equal("pass");
    });

    it("maps error to warn level", () => {
      expect(worstVerdict(["pass", "error"])).to.equal("warn");
    });

    it("fail beats error", () => {
      expect(worstVerdict(["error", "fail"])).to.equal("fail");
    });

    it("returns pass for single pass", () => {
      expect(worstVerdict(["pass"])).to.equal("pass");
    });
  });

  describe("computeReviewDecision", () => {
    it("returns no_signal for empty verdicts", () => {
      const result = computeReviewDecision([]);
      expect(result.should_deny).to.be.false;
      expect(result.reason).to.equal("no_signal");
      expect(result.score).to.equal(0.0);
    });

    it("returns no_signal when all skip/error", () => {
      const result = computeReviewDecision(["skip", "error", "skip"]);
      expect(result.should_deny).to.be.false;
      expect(result.reason).to.equal("no_signal");
    });

    it("denies when any fail present (fail veto)", () => {
      const result = computeReviewDecision(["pass", "fail", "pass"]);
      expect(result.should_deny).to.be.true;
      expect(result.reason).to.equal("fail_veto");
      expect(result.score).to.equal(1.0);
    });

    it("accepts all pass", () => {
      const result = computeReviewDecision(["pass", "pass", "pass"]);
      expect(result.should_deny).to.be.false;
      expect(result.reason).to.equal("acceptable");
      expect(result.score).to.equal(0.0);
    });

    it("accepts warns (warn does not block)", () => {
      const result = computeReviewDecision(["warn", "warn", "pass"]);
      expect(result.should_deny).to.be.false;
      expect(result.reason).to.equal("acceptable");
    });

    it("computes correct warn ratio", () => {
      const result = computeReviewDecision(["warn", "pass"]);
      expect(result.score).to.equal(0.5);
    });

    it("excludes skip and error from signal", () => {
      const result = computeReviewDecision(["pass", "skip", "error"]);
      expect(result.should_deny).to.be.false;
      expect(result.reason).to.equal("acceptable");
      expect(result.score).to.equal(0.0);
    });

    it("single fail denies", () => {
      const result = computeReviewDecision(["fail"]);
      expect(result.should_deny).to.be.true;
      expect(result.reason).to.equal("fail_veto");
    });
  });
});
