import { expect } from "chai";
import { makeResult } from "../reviewers/types.js";
import type { ReviewData, Verdict } from "../types.js";

describe("reviewers", () => {
  describe("makeResult", () => {
    it("creates a ReviewerResult with all fields", () => {
      const data: ReviewData = {
        verdict: "pass",
        summary: "All good",
        summary_source: "reviewer",
        issues: [],
        missing_sections: [],
        questions: [],
      };
      const result = makeResult("test-reviewer", true, "pass", data, '{"verdict":"pass"}', "");
      expect(result.name).to.equal("test-reviewer");
      expect(result.ok).to.be.true;
      expect(result.verdict).to.equal("pass");
      expect(result.data).to.deep.equal(data);
      expect(result.raw).to.equal('{"verdict":"pass"}');
      expect(result.err).to.equal("");
    });

    it("handles error case", () => {
      const result = makeResult("failing-reviewer", false, "error", {}, "", "Connection timeout");
      expect(result.ok).to.be.false;
      expect(result.verdict).to.equal("error");
      expect(result.err).to.equal("Connection timeout");
    });
  });
});
