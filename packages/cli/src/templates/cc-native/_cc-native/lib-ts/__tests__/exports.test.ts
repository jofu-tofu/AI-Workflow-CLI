import { expect } from "chai";

describe("exports", () => {
  it("all public functions are importable from index", async () => {
    const mod = await import("../index.js");

    // Verdict
    expect(mod.worstVerdict).to.be.a("function");
    expect(mod.computeReviewDecision).to.be.a("function");

    // JSON parsing
    expect(mod.parseJsonMaybe).to.be.a("function");
    expect(mod.coerceToReview).to.be.a("function");

    // CLI parsing
    expect(mod.parseCliOutput).to.be.a("function");

    // Config
    expect(mod.loadConfig).to.be.a("function");
    expect(mod.getDisplaySettings).to.be.a("function");

    // Constants
    expect(mod.validatePlanPath).to.be.a("function");
    expect(mod.PLANS_DIR).to.be.a("string");

    // State
    expect(mod.getStateFilePath).to.be.a("function");
    expect(mod.loadState).to.be.a("function");
    expect(mod.getIterationState).to.be.a("function");
    expect(mod.shouldContinueIterating).to.be.a("function");

    // CC-native state
    expect(mod.getCcNativeState).to.be.a("function");
    expect(mod.isPlanAlreadyReviewed).to.be.a("function");
    expect(mod.markPlanReviewed).to.be.a("function");

    // Orchestrator
    expect(mod.buildOrchestratorSchema).to.be.a("function");
    expect(mod.runOrchestrator).to.be.a("function");

    // Aggregate agents
    expect(mod.aggregateAgents).to.be.a("function");
    expect(mod.extractFrontmatter).to.be.a("function");

    // Artifacts
    expect(mod.formatReviewMarkdown).to.be.a("function");
    expect(mod.buildCombinedJson).to.be.a("function");
    expect(mod.buildInlineReviewSummary).to.be.a("function");

    // Reviewers
    expect(mod.AgentReviewer).to.be.a("function");

    // Schemas
    expect(mod.REVIEW_SCHEMA).to.be.an("object");
    expect(mod.ORCHESTRATOR_SCHEMA).to.be.an("object");
    expect(mod.DEFAULT_DISPLAY).to.be.an("object");
  });
});
