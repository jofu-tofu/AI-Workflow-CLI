/**
 * Configuration loading for cc-native plan review.
 * See cc-native-plan-review-spec.md §4.4
 */

import * as fs from "node:fs";
import path from "node:path";

import type { DisplaySettings, PlanReviewConfig } from "./types.js";
import { DEFAULT_DISPLAY } from "./types.js";
import { logWarn } from "../../_shared/lib-ts/runtime/logger.js";

/**
 * Load full CC-Native config from _cc-native/cc-native.config.json.
 */
export function loadConfig(projectDir: string): PlanReviewConfig {
  const settingsPath = path.join(
    projectDir,
    "_cc-native",
    "cc-native.config.json",
  );

  if (!fs.existsSync(settingsPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    return JSON.parse(raw) as PlanReviewConfig;
  } catch (error: unknown) {
    logWarn("cc-native", `Failed to load config: ${error}`);
    return {};
  }
}

/**
 * Get display settings, checking section-specific first, then root.
 */
export function getDisplaySettings(
  config: PlanReviewConfig,
  section: string,
): DisplaySettings {
  const sectionConfig = config[section];
  const sectionDisplay =
    sectionConfig && typeof sectionConfig === "object"
      ? ((sectionConfig as Record<string, unknown>).display as
          | Partial<DisplaySettings>
          | undefined) ?? {}
      : {};
  const rootDisplay = config.display ?? {};

  return {
    ...DEFAULT_DISPLAY,
    ...rootDisplay,
    ...sectionDisplay,
  };
}

