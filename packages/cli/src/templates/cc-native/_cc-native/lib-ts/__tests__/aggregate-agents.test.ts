import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import { extractFrontmatter, extractBody, aggregateAgents } from "../aggregate-agents.js";
import { createTempDir, cleanupTempDir } from "./helpers.js";

describe("aggregate-agents", () => {
  describe("extractFrontmatter", () => {
    it("extracts key-value pairs from frontmatter", () => {
      const content = "---\nname: test-agent\nmodel: sonnet\nenabled: true\n---\nBody";
      const result = extractFrontmatter(content);
      expect(result).to.not.be.null;
      expect(result!.name).to.equal("test-agent");
      expect(result!.model).to.equal("sonnet");
      expect(result!.enabled).to.equal(true);
    });

    it("returns null when no frontmatter", () => {
      expect(extractFrontmatter("No frontmatter here")).to.be.null;
    });

    it("returns null when frontmatter not closed", () => {
      expect(extractFrontmatter("---\nname: test\nno closing")).to.be.null;
    });

    it("handles arrays in frontmatter", () => {
      const content = "---\ncategories: [code, security]\n---\nBody";
      const result = extractFrontmatter(content);
      expect(result!.categories).to.deep.equal(["code", "security"]);
    });

    it("handles boolean false", () => {
      const content = "---\nenabled: false\n---\nBody";
      const result = extractFrontmatter(content);
      expect(result!.enabled).to.equal(false);
    });

    it("handles quoted strings", () => {
      const content = '---\nname: "quoted agent"\n---\nBody';
      const result = extractFrontmatter(content);
      expect(result!.name).to.equal("quoted agent");
    });
  });

  describe("extractBody", () => {
    it("extracts content after frontmatter", () => {
      const content = "---\nname: test\n---\n\nBody content here.";
      const result = extractBody(content);
      expect(result).to.equal("Body content here.");
    });

    it("returns full content when no frontmatter", () => {
      const content = "Just body content.";
      expect(extractBody(content)).to.equal("Just body content.");
    });

    it("returns full content when frontmatter not closed", () => {
      const content = "---\nname: test\nno closing";
      expect(extractBody(content)).to.equal(content);
    });
  });

  describe("aggregateAgents", () => {
    let tmpDir: string;

    beforeEach(() => { tmpDir = createTempDir("agents-test-"); });
    afterEach(() => cleanupTempDir(tmpDir));

    it("returns empty array when directory does not exist", () => {
      const result = aggregateAgents(path.join(tmpDir, "nonexistent"));
      expect(result).to.deep.equal([]);
    });

    it("loads agents from markdown files", () => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "test-agent.md"),
        "---\nname: test-agent\nmodel: sonnet\nfocus: testing\ncategories: [code]\n---\nYou are a test agent.",
      );
      const result = aggregateAgents(tmpDir);
      expect(result).to.have.length(1);
      expect(result[0]!.name).to.equal("test-agent");
      expect(result[0]!.system_prompt).to.equal("You are a test agent.");
    });

    it("skips plan-orchestrator agent", () => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "plan-orchestrator.md"),
        "---\nname: plan-orchestrator\n---\nOrchestrator prompt.",
      );
      fs.writeFileSync(
        path.join(tmpDir, "real-agent.md"),
        "---\nname: real-agent\n---\nReal agent prompt.",
      );
      const result = aggregateAgents(tmpDir);
      expect(result).to.have.length(1);
      expect(result[0]!.name).to.equal("real-agent");
    });

    it("skips files without frontmatter", () => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "no-fm.md"), "Just a readme.");
      const result = aggregateAgents(tmpDir);
      expect(result).to.have.length(0);
    });

    it("defaults categories to [code]", () => {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "simple.md"),
        "---\nname: simple\n---\nPrompt.",
      );
      const result = aggregateAgents(tmpDir);
      expect(result[0]!.categories).to.deep.equal(["code"]);
    });
  });
});
