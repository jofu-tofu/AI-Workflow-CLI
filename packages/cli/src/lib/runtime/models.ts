/**
 * Canonical model ID constants — single source of truth.
 * All model IDs used across the system should reference these constants.
 */

export const CLAUDE_MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
} as const;

export const CODEX_MODELS = {
  spark: "gpt-5.3-codex-spark",
  codex: "gpt-5.4",
  gpt: "gpt-5.4",
} as const;

export const DEVIN_MODELS = {
  swe: "swe",
  gpt: "gpt",
  opus: "opus",
  sonnet: "sonnet",
} as const;
