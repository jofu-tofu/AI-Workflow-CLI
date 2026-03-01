/**
 * Centralized CLI argument construction for agent subprocesses.
 * Single source of truth for Claude CLI and Codex CLI flag patterns,
 * platform quoting, model tier resolution, and env setup.
 */

import type { PreflightCommandConfig } from "./preflight.js";
import { getInternalSubprocessEnv, shellQuoteWin } from "./subprocess-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvocationMode = "structured" | "print" | "preflight";
export type CliProvider = "claude" | "codex";
export type ModelTier = "fast" | "standard" | "smart";

const VALID_SANDBOXES = ["read-only", "workspace-write", "danger-full-access"] as const;
export type CodexSandbox = (typeof VALID_SANDBOXES)[number];

export function isCodexSandbox(value: string): value is CodexSandbox {
  return (VALID_SANDBOXES as readonly string[]).includes(value);
}

export interface CliArgSpec {
  provider: CliProvider;
  model: string | ModelTier;
  mode: InvocationMode;
  jsonSchema?: Record<string, unknown>;
  maxTurns?: number;
  systemPrompt?: string;
  sandbox?: CodexSandbox;
  outputSchemaPath?: string;
  outputFilePath?: string;
  extraArgs?: string[];
}

/** Codex REPL spec — model optional (Codex uses its default when omitted). */
export interface CodexReplSpec {
  provider: "codex";
  mode: "repl";
  model?: string | ModelTier;
  sandbox?: CodexSandbox;
  extraArgs?: string[];
}

export interface CliInvocation {
  cliName: string;
  args: string[];
  needsShell: boolean;
  env: Record<string, string | undefined>;
}

// ---------------------------------------------------------------------------
// Model Tier Resolution
// ---------------------------------------------------------------------------

export const MODEL_TIERS: Record<ModelTier, string> = {
  fast: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-6",
  smart: "claude-opus-4-6",
};

export const CODEX_MODEL_TIERS: Record<ModelTier, string> = {
  fast: "gpt-5.3-codex-spark",
  standard: "gpt-5.3-codex",
  smart: "gpt-5.3-codex",
};

export const TIER_TIMEOUTS: Record<ModelTier, number> = {
  fast: 15,
  standard: 30,
  smart: 90,
};

export function isModelTier(value: string): value is ModelTier {
  return value in MODEL_TIERS;
}

export function resolveModel(model: string | ModelTier): string {
  if (isModelTier(model)) return MODEL_TIERS[model];
  return model;
}

export function resolveModelForProvider(
  model: string | ModelTier,
  provider: CliProvider,
): string {
  if (!isModelTier(model)) return model;
  return provider === "codex" ? CODEX_MODEL_TIERS[model] : MODEL_TIERS[model];
}

export function getTierTimeout(tier: ModelTier): number {
  return TIER_TIMEOUTS[tier];
}

/** Resolve a Codex model: tier resolution + pass-through. No aliases (those are skill-specific). */
export function resolveCodexModel(input: string): string {
  if (isModelTier(input)) return CODEX_MODEL_TIERS[input as ModelTier];
  return input;
}

// ---------------------------------------------------------------------------
// Core Builder
// ---------------------------------------------------------------------------

export function buildCliInvocation(spec: CliArgSpec | CodexReplSpec): CliInvocation {
  const env = getInternalSubprocessEnv();
  delete env.ANTHROPIC_API_KEY;

  if (spec.mode === "repl") {
    const resolvedModel = spec.model ? resolveModelForProvider(spec.model, spec.provider) : undefined;
    return buildCodexReplInvocation(spec, resolvedModel, env);
  }

  const resolvedModel = resolveModelForProvider((spec as CliArgSpec).model, spec.provider);
  const isWin = process.platform === "win32";
  const empty = isWin ? '""' : "";

  if (spec.provider === "claude") {
    return buildClaudeInvocation(spec as CliArgSpec, resolvedModel, isWin, empty, env);
  }

  return buildCodexInvocation(spec as CliArgSpec, resolvedModel, env);
}

function buildClaudeInvocation(
  spec: CliArgSpec,
  model: string,
  isWin: boolean,
  empty: string,
  env: Record<string, string | undefined>,
): CliInvocation {
  const args: string[] = [];

  args.push("--model", model);

  if (spec.mode === "print") {
    args.push("--print");
  } else {
    // structured and preflight both use json output
    args.push("--output-format", "json");

    if (spec.jsonSchema) {
      args.push("--json-schema", shellQuoteWin(JSON.stringify(spec.jsonSchema)));
    }

    const maxTurns = spec.mode === "preflight" ? 1 : (spec.maxTurns ?? 3);
    args.push("--max-turns", String(maxTurns));
  }

  args.push("--setting-sources", empty);
  args.push("-p");
  args.push("--no-session-persistence");

  if (spec.systemPrompt) {
    args.push("--system-prompt", shellQuoteWin(spec.systemPrompt));
  }

  if (spec.extraArgs) {
    args.push(...spec.extraArgs);
  }

  return { cliName: "claude", args, needsShell: isWin, env };
}

function buildCodexInvocation(
  spec: CliArgSpec,
  model: string,
  env: Record<string, string | undefined>,
): CliInvocation {
  const args: string[] = ["exec"];

  if (spec.sandbox) {
    args.push("--sandbox", spec.sandbox);
  }

  args.push("--model", model);

  if (spec.outputSchemaPath) {
    args.push("--output-schema", spec.outputSchemaPath);
  }

  if (spec.outputFilePath) {
    args.push("-o", spec.outputFilePath);
  }

  args.push("-");

  if (spec.extraArgs) {
    args.push(...spec.extraArgs);
  }

  return { cliName: "codex", args, needsShell: false, env };
}

function buildCodexReplInvocation(
  spec: CodexReplSpec,
  model: string | undefined,
  env: Record<string, string | undefined>,
): CliInvocation {
  const args: string[] = [];
  if (spec.sandbox) args.push("--sandbox", spec.sandbox);
  if (model) args.push("--model", model);
  if (spec.extraArgs) args.push(...spec.extraArgs);
  return { cliName: "codex", args, needsShell: false, env };
}

// ---------------------------------------------------------------------------
// Convenience Presets
// ---------------------------------------------------------------------------

export function preflightSpec(provider: CliProvider, model: string): CliArgSpec {
  if (provider === "codex") {
    return {
      provider: "codex",
      model,
      mode: "preflight",
      sandbox: "read-only",
    };
  }
  return {
    provider: "claude",
    model,
    mode: "preflight",
  };
}

export function inferenceSpec(model: string | ModelTier): CliArgSpec {
  return {
    provider: "claude",
    model,
    mode: "print",
  };
}

export function reviewSpec(
  provider: CliProvider,
  model: string,
  schema: Record<string, unknown>,
  systemPrompt?: string,
): CliArgSpec {
  if (provider === "codex") {
    return {
      provider: "codex",
      model,
      mode: "structured",
      sandbox: "read-only",
    };
  }
  return {
    provider: "claude",
    model,
    mode: "structured",
    jsonSchema: schema,
    systemPrompt,
  };
}

export function codexReplSpec(
  model?: string,
  sandbox?: CodexSandbox,
): CodexReplSpec {
  return {
    provider: "codex",
    mode: "repl",
    model,
    sandbox,
  };
}

export function preflightCommandConfig(provider: CliProvider): PreflightCommandConfig {
  const input = "Respond with exactly: ok";

  return {
    cliName: provider === "claude" ? "claude" : "codex",
    buildArgs: (model: string) => buildCliInvocation(preflightSpec(provider, model)).args,
    input,
  };
}
