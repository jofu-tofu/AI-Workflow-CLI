import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  formatReviewMarkdown,
  formatCombinedMarkdown,
  buildInlineReviewSummary,
  extractTopIssuesText,
  buildHighIssuesDocument,
  buildCombinedJson,
  generateReviewIndex,
} from "../artifacts.js";
import {
  createSampleReviewerResult,
  createSampleCombinedResult,
  createTempDir,
  cleanupTempDir,
} from "./helpers.js";

describe("artifacts", () => {
  describe("formatReviewMarkdown", () => {
    it("includes overall verdict in output", () => {
      const results = [createSampleReviewerResult({ name: "claude", verdict: "pass" })];
      const md = formatReviewMarkdown(results, "pass");
      expect(md).to.include("PASS");
      expect(md).to.include("Claude");
    });

    it("handles empty results", () => {
      const md = formatReviewMarkdown([], "pass");
      expect(md).to.include("PASS");
    });

    it("includes custom title", () => {
      const md = formatReviewMarkdown([], "pass", "Custom Review Title");
      expect(md).to.include("Custom Review Title");
    });

    it("marks default summaries with warning", () => {
      const result = createSampleReviewerResult({
        data: {
          verdict: "pass",
          summary: "No summary provided.",
          summary_source: "default",
          issues: [],
          missing_sections: [],
          questions: [],
        },
      });
      const md = formatReviewMarkdown([result], "pass");
      expect(md).to.include("⚠️");
    });
  });

  describe("formatCombinedMarkdown", () => {
    it("includes plan hash and overall verdict", () => {
      const combined = createSampleCombinedResult();
      const md = formatCombinedMarkdown(combined);
      expect(md).to.include("abc123def456");
      expect(md).to.include("PASS");
    });

    it("includes orchestration section when present", () => {
      const combined = createSampleCombinedResult();
      const md = formatCombinedMarkdown(combined);
      expect(md).to.include("Orchestration");
      expect(md).to.include("medium");
    });

    it("includes agent reviewer sections", () => {
      const combined = createSampleCombinedResult({
        agents: {
          "test-agent": createSampleReviewerResult({ name: "test-agent", verdict: "warn" }),
        },
      });
      const md = formatCombinedMarkdown(combined);
      expect(md).to.include("test-agent");
      expect(md).to.include("warn");
    });
  });

  describe("buildInlineReviewSummary", () => {
    it("includes overall verdict", () => {
      const combined = createSampleCombinedResult();
      const summary = buildInlineReviewSummary(combined);
      expect(summary).to.include("PASS");
    });

    it("lists high-severity issues", () => {
      const combined = createSampleCombinedResult({
        agents: {
          test: createSampleReviewerResult({
            name: "test",
            data: {
              verdict: "warn",
              summary: "Issues found",
              summary_source: "reviewer",
              issues: [
                { severity: "high", category: "security", issue: "SQL injection", suggested_fix: "Use parameterized queries" },
              ],
              missing_sections: [],
              questions: [],
            },
          }),
        },
      });
      const summary = buildInlineReviewSummary(combined);
      expect(summary).to.include("SQL injection");
      expect(summary).to.include("security");
    });

    it("truncates to maxChars", () => {
      const combined = createSampleCombinedResult();
      const summary = buildInlineReviewSummary(combined, 5, 20);
      expect(summary.length).to.be.at.most(20);
    });
  });

  describe("extractTopIssuesText", () => {
    it("returns default message for no issues", () => {
      const combined = createSampleCombinedResult();
      const text = extractTopIssuesText(combined);
      expect(text).to.equal("Review found critical issues");
    });

    it("extracts high-severity issues from reviewers", () => {
      const combined = createSampleCombinedResult({
        agents: {
          r1: createSampleReviewerResult({
            name: "r1",
            data: {
              verdict: "fail",
              summary: "Problems",
              summary_source: "reviewer",
              issues: [{ severity: "high", category: "security", issue: "XSS vulnerability", suggested_fix: "sanitize" }],
              missing_sections: [],
              questions: [],
            },
          }),
        },
      });
      const text = extractTopIssuesText(combined);
      expect(text).to.include("XSS vulnerability");
      expect(text).to.include("r1");
    });
  });

  describe("buildHighIssuesDocument", () => {
    it("reports no high-severity issues when none exist", () => {
      const combined = createSampleCombinedResult();
      const doc = buildHighIssuesDocument(combined);
      expect(doc).to.include("No high-severity issues found");
    });

    it("lists high-severity issues by reviewer", () => {
      const combined = createSampleCombinedResult({
        agents: {
          "security-agent": createSampleReviewerResult({
            name: "security-agent",
            verdict: "fail",
            data: {
              verdict: "fail",
              summary: "Critical",
              summary_source: "reviewer",
              issues: [
                { severity: "high", category: "auth", issue: "Missing auth check", suggested_fix: "Add middleware" },
                { severity: "low", category: "style", issue: "Formatting", suggested_fix: "Run prettier" },
              ],
              missing_sections: [],
              questions: [],
            },
          }),
        },
      });
      const doc = buildHighIssuesDocument(combined);
      expect(doc).to.include("Missing auth check");
      expect(doc).to.not.include("Formatting"); // low severity excluded
    });
  });

  describe("buildCombinedJson", () => {
    it("includes metadata with plan hash", () => {
      const combined = createSampleCombinedResult();
      const json = buildCombinedJson(combined);
      expect((json.metadata as any).plan_hash).to.equal("abc123def456");
    });

    it("includes overall verdict", () => {
      const combined = createSampleCombinedResult();
      const json = buildCombinedJson(combined);
      expect((json.overall as any).verdict).to.equal("pass");
    });

    it("excludes low-severity issues from JSON", () => {
      const combined = createSampleCombinedResult({
        agents: {
          test: createSampleReviewerResult({
            name: "test",
            data: {
              verdict: "warn",
              summary: "ok",
              summary_source: "reviewer",
              issues: [
                { severity: "high", category: "sec", issue: "important", suggested_fix: "fix" },
                { severity: "low", category: "style", issue: "trivial", suggested_fix: "ignore" },
              ],
              missing_sections: [],
              questions: [],
            },
          }),
        },
      });
      const json = buildCombinedJson(combined);
      const reviewers = json.agents as Record<string, any>;
      expect(reviewers.test.issues).to.have.length(1);
      expect(reviewers.test.issues[0].issue).to.equal("important");
    });
  });

  describe("generateReviewIndex", () => {
    it("includes plan hash and verdict in frontmatter", () => {
      const combined = createSampleCombinedResult();
      const index = generateReviewIndex(combined);
      expect(index).to.include("plan_hash: abc123def456");
      expect(index).to.include("overall_verdict: pass");
    });

    it("includes iteration number when provided", () => {
      const combined = createSampleCombinedResult();
      const index = generateReviewIndex(combined, 2);
      expect(index).to.include("iteration: 2");
    });
  });
});
