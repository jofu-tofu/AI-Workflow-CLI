import { expect } from "chai";
import { parseJsonMaybe, coerceToReview } from "../json-parser.js";

describe("json-parser", () => {
  describe("parseJsonMaybe", () => {
    it("parses valid JSON object", () => {
      const result = parseJsonMaybe('{"verdict": "pass"}');
      expect(result).to.deep.equal({ verdict: "pass" });
    });

    it("returns null for empty string", () => {
      expect(parseJsonMaybe("")).to.be.null;
    });

    it("returns null for whitespace only", () => {
      expect(parseJsonMaybe("   ")).to.be.null;
    });

    it("extracts JSON from surrounding text (heuristic)", () => {
      const result = parseJsonMaybe('Some text {"key": "value"} more text');
      expect(result).to.deep.equal({ key: "value" });
    });

    it("returns null for arrays", () => {
      expect(parseJsonMaybe("[1, 2, 3]")).to.be.null;
    });

    it("returns null for plain text without JSON", () => {
      expect(parseJsonMaybe("just some text")).to.be.null;
    });

    it("logs warning for missing required fields but still returns parsed object", () => {
      const result = parseJsonMaybe('{"other": "field"}', ["verdict"]);
      expect(result).to.not.be.null;
      expect(result!.other).to.equal("field");
    });

    it("handles malformed JSON with heuristic", () => {
      const result = parseJsonMaybe('prefix {"a": 1} suffix');
      expect(result).to.deep.equal({ a: 1 });
    });

    it("returns null for malformed JSON that cannot be extracted", () => {
      expect(parseJsonMaybe("{invalid json}")).to.be.null;
    });
  });

  describe("coerceToReview", () => {
    it("returns error tuple for null input", () => {
      const [ok, verdict, data] = coerceToReview(null);
      expect(ok).to.be.false;
      expect(verdict).to.equal("error");
      expect(data.verdict).to.equal("fail");
      expect(data.issues).to.have.length.greaterThan(0);
    });

    it("normalizes valid review data", () => {
      const [ok, verdict, data] = coerceToReview({
        verdict: "pass",
        summary: "All good",
        issues: [],
      });
      expect(ok).to.be.true;
      expect(verdict).to.equal("pass");
      expect(data.summary).to.equal("All good");
      expect(data.summary_source).to.equal("reviewer");
    });

    it("defaults missing verdict to warn", () => {
      const [ok, verdict, data] = coerceToReview({ summary: "test" });
      expect(ok).to.be.true;
      expect(verdict).to.equal("warn");
    });

    it("defaults invalid verdict to warn", () => {
      const [, verdict] = coerceToReview({ verdict: "banana" });
      expect(verdict).to.equal("warn");
    });

    it("defaults empty summary", () => {
      const [, , data] = coerceToReview({ verdict: "pass" });
      expect(data.summary).to.equal("No summary provided.");
      expect(data.summary_source).to.equal("default");
    });

    it("handles missing issues/questions/missing_sections gracefully", () => {
      const [ok, , data] = coerceToReview({ verdict: "pass", summary: "ok" });
      expect(ok).to.be.true;
      expect(data.issues).to.deep.equal([]);
      expect(data.questions).to.deep.equal([]);
      expect(data.missing_sections).to.deep.equal([]);
    });

    it("uses custom default fix message", () => {
      const [, , data] = coerceToReview(null, "Custom fix");
      expect(data.issues[0]?.suggested_fix).to.equal("Custom fix");
    });
  });
});
