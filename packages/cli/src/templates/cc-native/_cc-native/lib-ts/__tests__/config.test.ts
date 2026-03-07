import { expect } from "chai";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadConfig, getDisplaySettings } from "../config.js";
import { DEFAULT_DISPLAY } from "../types.js";
import { createTempDir, cleanupTempDir } from "./helpers.js";

describe("config", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempDir("config-test-"); });
  afterEach(() => cleanupTempDir(tmpDir));

  describe("loadConfig", () => {
    it("returns empty object when config file missing", () => {
      const result = loadConfig(tmpDir);
      expect(result).to.deep.equal({});
    });

    it("loads valid config file", () => {
      const configDir = path.join(tmpDir, "_cc-native");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, "cc-native.config.json"),
        JSON.stringify({ orchestrator: { enabled: true, model: "haiku" } }),
      );
      const result = loadConfig(tmpDir);
      expect(result).to.have.property("orchestrator");
    });

    it("returns empty object for malformed JSON", () => {
      const configDir = path.join(tmpDir, "_cc-native");
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        path.join(configDir, "cc-native.config.json"),
        "not json{{{",
      );
      const result = loadConfig(tmpDir);
      expect(result).to.deep.equal({});
    });
  });

  describe("getDisplaySettings", () => {
    it("returns defaults when no config", () => {
      const result = getDisplaySettings({}, "agents");
      expect(result).to.deep.equal(DEFAULT_DISPLAY);
    });

    it("merges root display overrides", () => {
      const result = getDisplaySettings({ display: { maxIssues: 5 } }, "agents");
      expect(result.maxIssues).to.equal(5);
      expect(result.maxQuestions).to.equal(DEFAULT_DISPLAY.maxQuestions);
    });

    it("section-specific overrides take priority over root", () => {
      const config = {
        display: { maxIssues: 10 },
        agents: { display: { maxIssues: 3 } },
      };
      const result = getDisplaySettings(config as any, "agents");
      expect(result.maxIssues).to.equal(3);
    });
  });
});
