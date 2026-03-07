import { expect } from "chai";
import { buildOrchestratorSchema } from "../orchestrator.js";

describe("orchestrator", () => {
  describe("buildOrchestratorSchema", () => {
    it("returns valid JSON schema object", () => {
      const schema = buildOrchestratorSchema(
        ["agent-a", "agent-b"],
        ["code", "documentation"],
      );
      expect(schema.type).to.equal("object");
      expect(schema.required).to.include("complexity");
      expect(schema.required).to.include("selectedAgents");
    });

    it("constrains agent names with enum", () => {
      const schema = buildOrchestratorSchema(
        ["alpha", "beta"],
        ["code"],
      );
      const props = schema.properties as any;
      expect(props.selectedAgents.items.enum).to.deep.equal(["alpha", "beta"]);
    });

    it("omits enum when agent list is empty", () => {
      const schema = buildOrchestratorSchema([], ["code"]);
      const props = schema.properties as any;
      expect(props.selectedAgents.items).to.not.have.property("enum");
    });

    it("constrains complexity to simple/medium/high", () => {
      const schema = buildOrchestratorSchema(["a"], ["code"]);
      const props = schema.properties as any;
      expect(props.complexity.enum).to.deep.equal(["simple", "medium", "high"]);
    });

    it("includes categories in category enum", () => {
      const schema = buildOrchestratorSchema(["a"], ["code", "life", "business"]);
      const props = schema.properties as any;
      expect(props.category.enum).to.deep.equal(["code", "life", "business"]);
    });

    it("disallows additional properties", () => {
      const schema = buildOrchestratorSchema(["a"], ["code"]);
      expect(schema.additionalProperties).to.equal(false);
    });
  });
});
