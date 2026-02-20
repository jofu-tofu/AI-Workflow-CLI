#!/usr/bin/env bun
/**
 * PostToolUse:Write|Edit hook: Run linter on edited files, feed errors to Claude.
 * Uses emitContext() for non-blocking context injection — Claude sees errors and self-corrects.
 */
import { getProjectRoot } from "../lib-ts/base/constants.js";
import {
  emitContext, getToolInput, loadHookInput, logDebug, runHook,
} from "../lib-ts/base/hook-utils.js";
import { formatLintErrors, getLinterForFile, runLinter } from "../lib-ts/base/lint-dispatch.js";

// Extensions with no lint value
const SKIP_EXTENSIONS = new Set([
  ".env", ".eot", ".gif", ".ico", ".jpeg", ".jpg", ".lock",
  ".map", ".md", ".min.css", ".min.js", ".otf", ".png", ".svg",
  ".toml", ".ttf", ".txt", ".webp", ".woff",
  ".woff2", ".yaml", ".yml",
]);

// Path segments that should never be linted
const SKIP_SEGMENTS = [
  "node_modules/", ".git/", "dist/", "_output/",
  "package-lock.json", "bun.lockb",
];

function shouldSkip(filePath: string): boolean {
  const ext = filePath.lastIndexOf(".");
  if (ext !== -1 && SKIP_EXTENSIONS.has(filePath.slice(ext).toLowerCase())) return true;
  const normalized = filePath.replaceAll("\\", "/");
  return SKIP_SEGMENTS.some((seg) => normalized.includes(seg));
}

function main(): void {
  const payload = loadHookInput();
  if (!payload) return;

  const toolInput = getToolInput(payload);
  if (!toolInput) return;

  const filePath = toolInput.file_path as string | undefined;
  if (!filePath) return;

  if (shouldSkip(filePath)) {
    logDebug("lint_after_edit", `Skipping ${filePath} (skip list)`);
    return;
  }

  const projectRoot = getProjectRoot(payload.cwd);
  const config = getLinterForFile(filePath);
  if (!config) return;

  const result = runLinter(config, filePath, projectRoot);
  if (!result) return;          // Binary not found
  if (result.errors.length === 0) return; // Clean

  emitContext(formatLintErrors(filePath, config.name, result.errors));
}

runHook(main, "lint_after_edit");
