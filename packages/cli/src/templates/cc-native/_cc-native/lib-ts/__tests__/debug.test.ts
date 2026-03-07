import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDebugDir, cleanupDebugFolder } from "../debug.js";
import { createTempDir, cleanupTempDir } from "./helpers.js";

describe("debug", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempDir("debug-test-"); });
  afterEach(() => cleanupTempDir(tmpDir));

  describe("getDebugDir", () => {
    it("creates debug directory under context path", () => {
      const result = getDebugDir(tmpDir);
      expect(result).to.equal(path.join(tmpDir, "debug"));
      expect(fs.existsSync(result)).to.be.true;
    });

    it("returns same path on subsequent calls", () => {
      const first = getDebugDir(tmpDir);
      const second = getDebugDir(tmpDir);
      expect(first).to.equal(second);
    });
  });

  describe("cleanupDebugFolder", () => {
    it("removes existing debug directory", () => {
      const debugDir = path.join(tmpDir, "debug");
      fs.mkdirSync(debugDir, { recursive: true });
      fs.writeFileSync(path.join(debugDir, "test.log"), "data");

      cleanupDebugFolder(tmpDir);
      expect(fs.existsSync(debugDir)).to.be.false;
    });

    it("does nothing when debug directory does not exist", () => {
      // Should not throw
      cleanupDebugFolder(tmpDir);
    });
  });
});
