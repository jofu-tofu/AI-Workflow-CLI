import { expect } from "chai";
import * as path from "node:path";
import * as os from "node:os";
import { validatePlanPath, PLANS_DIR, MAX_PLAN_PATH_LENGTH } from "../constants.js";

describe("constants", () => {
  describe("validatePlanPath", () => {
    it("accepts valid plan path within PLANS_DIR", () => {
      const validPath = path.join(PLANS_DIR, "my-plan.md");
      const result = validatePlanPath(validPath);
      expect(result).to.equal(path.resolve(validPath));
    });

    it("throws on empty path", () => {
      expect(() => validatePlanPath("")).to.throw(/Invalid plan path length/);
    });

    it("throws on path exceeding max length", () => {
      const longPath = path.join(PLANS_DIR, "a".repeat(MAX_PLAN_PATH_LENGTH));
      expect(() => validatePlanPath(longPath)).to.throw(/Invalid plan path length/);
    });

    it("throws on null byte injection", () => {
      expect(() => validatePlanPath(PLANS_DIR + "/test\x00.md")).to.throw(/Null bytes/);
    });

    it("throws on path outside PLANS_DIR", () => {
      const outsidePath = path.join(os.tmpdir(), "evil-plan.md");
      expect(() => validatePlanPath(outsidePath)).to.throw(/Path outside allowed directory/);
    });

    it("resolves to absolute path", () => {
      // This test depends on CWD being inside PLANS_DIR, which typically won't be
      // So we test with an absolute path
      const absPath = path.join(PLANS_DIR, "test-plan.md");
      const result = validatePlanPath(absPath);
      expect(path.isAbsolute(result)).to.be.true;
    });
  });
});
