/**
 * Inference utility for AI-powered text processing.
 * Unified interface for Claude API calls using the claude CLI.
 * See SPEC.md §6
 */

import { execFileSync } from "node:child_process";

import { logDebug, logWarn } from "./logger.js";
import { STOP_WORDS } from "./stop-words.js";
import { cleanTextForSlug } from "./utils.js";
import type { InferenceResult } from "../types.js";

// Model configurations §6.1
const MODELS: Record<string, string> = {
  fast: "claude-3-haiku-20240307",
  standard: "claude-sonnet-4-20250514",
  smart: "claude-opus-4-20250514",
};

const TIMEOUTS: Record<string, number> = {
  fast: 15,
  standard: 30,
  smart: 90,
};

/**
 * Run inference using the claude CLI.
 * See SPEC.md §6.1
 */
export function inference(
  systemPrompt: string,
  userPrompt: string,
  level = "fast",
  timeout?: number,
): InferenceResult {
  const startTime = Date.now();
  const model = MODELS[level] ?? MODELS["fast"] ?? "claude-3-haiku-20240307";
  const timeoutSec = timeout ?? TIMEOUTS[level] ?? 15;
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  // Remove ANTHROPIC_API_KEY to force subscription auth
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  try {
    const isWin = process.platform === "win32";
    // On Windows with shell:true, Node.js sets windowsVerbatimArguments —
    // args are joined with spaces, NOT individually quoted. We must manually
    // wrap multi-word/special-char args in "..." for cmd.exe parsing.
    // Inside double quotes: "" = literal ", and |&<> are safe.
    const empty = isWin ? '""' : "";
    let promptArg = fullPrompt;
    if (isWin) {
      promptArg = '"' + fullPrompt.replaceAll(/\r?\n/g, " ").replaceAll('"', '""') + '"';
    }

    const stdout = execFileSync(
      "claude",
      ["--model", model, "--print", "--setting-sources", empty, "-p", promptArg],
      {
        timeout: timeoutSec * 1000,
        env,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        shell: isWin, // Windows needs shell for .cmd resolution
      },
    );

    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      output: stdout.trim(),
      latency_ms: latencyMs,
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    if (error.code === "ETIMEDOUT" || error.killed) {
      return {
        success: false,
        output: "",
        error: `Timeout after ${timeoutSec}s`,
        latency_ms: latencyMs,
      };
    }

    if (error.code === "ENOENT") {
      return {
        success: false,
        output: "",
        error: "claude CLI not found",
        latency_ms: latencyMs,
      };
    }

    // Non-zero exit code
    if (error.status !== undefined && error.status !== 0) {
      return {
        success: false,
        output: (error.stdout ?? "").toString().trim(),
        error: (error.stderr ?? "").toString().trim() || `Exit code: ${error.status}`,
        latency_ms: latencyMs,
      };
    }

    return {
      success: false,
      output: "",
      error: String(error),
      latency_ms: latencyMs,
    };
  }
}

// §6.2 — System prompt for keyword extraction
const CONTEXT_ID_SYSTEM_PROMPT = `Extract 6-12 keywords from what the user wants to do.

Rules:
- Output 6-12 keywords only
- Keywords: nouns, verbs, adjectives, technical terms, proper names
- NO function words: the, to, with, for, in, a, an, of, on, is, it, and, or, that, this, be, as, at, by, from
- Most important/specific words preferred
- No punctuation, no quotes

Output ONLY the keywords separated by spaces, nothing else.`;

/**
 * Generate a keyword summary of a user prompt.
 * Uses Sonnet (standard tier). Returns null if inference fails.
 * See SPEC.md §6.2
 */
export function generateSemanticSummary(
  prompt: string,
  timeout = 15,
): null | string {
  const result = inference(CONTEXT_ID_SYSTEM_PROMPT, prompt, "standard", timeout);

  if (!result.success || !result.output) return null;

  let summary = result.output.trim();
  summary = summary.replaceAll(/^["']+|["']+$/g, "");
  summary = summary.replace(/[.!?]+$/, "");

  // Filter stop words
  summary = filterStopWords(summary);

  const words = summary.split(/\s+/);
  if (words.length < 6 || words.length > 12) return null;

  return summary;
}

// §6.3 — System prompt for context ID slug generation
const CONTEXT_ID_SLUG_PROMPT = `You generate short title phrases for work sessions. These become folder names like \`260206-1959-fix-auth-middleware-redirect-loop-session-timeout\`.

Users scan 100+ such names to find past sessions. Your title must make THIS session instantly recognizable.

Rules:
- Exactly 8-12 lowercase words
- First word is an action verb (fix, add, implement, refactor, update, create, remove, optimize, debug, migrate, integrate, configure, deploy, scaffold, restructure)
- Coherent phrase, not disjointed keywords — reads like a short task description
- Prefer specific technical terms over generic words
- No articles (the, a, an), no pronouns, no filler words, no punctuation, no quotes
- Input may come from speech-to-text with filler words (uh, um, like, you know, basically, so) — ignore them entirely

Examples:

Input: "um so basically I need to like fix the auth bug in the login page"
{"slug": "fix authentication bug login page redirect session handling flow"}

Input: "hey uh can we add dark mode to the settings page"
{"slug": "add dark mode toggle settings page user preference storage"}

Input: "the context ids are bad can we change how we generate them towards a summary"
{"slug": "improve context id generation use prompt summary slugs"}

Input: "I want to refactor the database connection pooling for PostgreSQL"
{"slug": "refactor postgresql database connection pooling optimize query performance"}

Input: "so like you know the webhook retry logic is broken and stuff"
{"slug": "fix webhook retry logic broken error handling recovery mechanism"}

Input: "update the CI pipeline to cache node modules between runs"
{"slug": "update ci pipeline cache node modules between workflow runs"}

Respond with ONLY a JSON object: {"slug": "your 8-12 word phrase here"}`;

/**
 * Generate a 5-12 word context ID slug from a user prompt.
 * Uses Haiku (fast tier) for low latency.
 * See SPEC.md §6.3
 */
export function generateContextIdSlug(
  prompt: string,
  timeout = 3,
): null | string {
  const truncated = prompt.slice(0, 500);

  const result = inference(CONTEXT_ID_SLUG_PROMPT, truncated, "fast", timeout);

  if (!result.success || !result.output) {
    logWarn("inference", `Context ID slug inference failed: ${result.error}`);
    return null;
  }

  const raw = result.output.trim();

  // Parse JSON response, fall back to raw text
  let slug: null | string = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "slug" in parsed) {
      slug = parsed.slug;
    }
  } catch {
    // Fall through to raw text
  }

  if (!slug) slug = raw;

  // Clean up
  slug = slug.replaceAll(/^["'`]+|["'`]+$/g, "");
  slug = slug.replace(/[.!?]+$/, "");
  slug = slug.replaceAll('-', " ");
  slug = slug.replaceAll(/[^a-zA-Z0-9 ]/g, "");
  slug = slug.replaceAll(/\s+/g, " ").trim();

  const words = slug.split(" ");

  if (words.length > 12) words.length = 12;
  if (words.length < 5) {
    logDebug("inference", `Context ID slug too short (${words.length} words): '${slug}'`);
    return null;
  }

  const resultSlug = words.join(" ");
  logDebug("inference", `Generated context ID slug: '${resultSlug}' (${result.latency_ms}ms)`);
  return resultSlug;
}

/**
 * Filter stop words from text.
 * See SPEC.md §6.4
 */
function filterStopWords(text: string): string {
  const cleaned = cleanTextForSlug(text);
  return cleaned
    .split(/\s+/)
    .filter((w) => !STOP_WORDS.has(w) && w.length > 1)
    .join(" ");
}
