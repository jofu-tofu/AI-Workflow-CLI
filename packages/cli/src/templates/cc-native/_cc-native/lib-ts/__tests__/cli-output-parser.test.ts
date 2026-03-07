import { expect } from "chai";
import { parseCliOutput } from "../cli-output-parser.js";

describe("cli-output-parser", () => {
  describe("parseCliOutput", () => {
    it("extracts structured_output from root dict", () => {
      const input = JSON.stringify({
        structured_output: { verdict: "pass", summary: "ok" },
      });
      const result = parseCliOutput(input);
      expect(result).to.deep.equal({ verdict: "pass", summary: "ok" });
    });

    it("extracts StructuredOutput from assistant message", () => {
      const input = JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { name: "StructuredOutput", input: { verdict: "warn", summary: "issues found" } },
          ],
        },
      });
      const result = parseCliOutput(input);
      expect(result).to.deep.equal({ verdict: "warn", summary: "issues found" });
    });

    it("extracts StructuredOutput from event list", () => {
      const input = JSON.stringify([
        { type: "system" },
        {
          type: "assistant",
          message: {
            content: [
              { name: "StructuredOutput", input: { verdict: "fail" } },
            ],
          },
        },
      ]);
      const result = parseCliOutput(input);
      expect(result).to.deep.equal({ verdict: "fail" });
    });

    it("falls back to heuristic for non-JSON input", () => {
      const result = parseCliOutput('Some text {"verdict": "pass"} more text');
      expect(result).to.deep.equal({ verdict: "pass" });
    });

    it("returns null for empty string", () => {
      expect(parseCliOutput("")).to.be.null;
    });

    it("returns null for plain text without JSON", () => {
      expect(parseCliOutput("just plain text")).to.be.null;
    });

    it("handles assistant message without StructuredOutput tool", () => {
      const input = JSON.stringify({
        type: "assistant",
        message: {
          content: [{ name: "SomeOtherTool", input: {} }],
        },
      });
      // Falls through to heuristic, which will find the JSON object
      const result = parseCliOutput(input);
      expect(result).to.not.be.null;
    });

    it("handles empty event list", () => {
      const result = parseCliOutput("[]");
      expect(result).to.be.null;
    });
  });
});
