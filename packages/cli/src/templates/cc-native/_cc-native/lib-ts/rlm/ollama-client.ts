/* eslint-disable n/no-unsupported-features/node-builtins -- Bun runtime provides fetch */
/**
 * Ollama HTTP client for local embeddings.
 *
 * Uses nomic-embed-text via Ollama's /api/embed endpoint.
 * Zero API cost, fast, private.
 */

import { z } from "zod";

import { logDebug } from "./logger.js";
import {
  OLLAMA_BASE_URL,
  OLLAMA_EMBED_MODEL,
  EMBED_DIMENSIONS,
  HYDE_OLLAMA_MODEL,
} from "./types.js";

const HOOK_NAME = "rlm_ollama";
const BATCH_SIZE = 32;

// Zod schemas for runtime validation
const OllamaTagsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string() })).optional(),
});

const OllamaEmbedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
});

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  dimensions: number;
}

const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_EMBED_MODEL,
  dimensions: EMBED_DIMENSIONS,
};

export interface HealthResult {
  ok: boolean;
  error?: string;
}

/**
 * Check if Ollama is running and the embedding model is available.
 */
export async function checkOllamaHealth(
  config: Partial<OllamaConfig> = {},
): Promise<HealthResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  try {
    const resp = await fetch(`${cfg.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      return { ok: false, error: `Ollama responded with ${resp.status}` };
    }
    const json = await resp.json();
    const parseResult = OllamaTagsResponseSchema.safeParse(json);
    if (!parseResult.success) {
      return { ok: false, error: `Invalid Ollama API response: ${parseResult.error.message}` };
    }
    const models = parseResult.data.models ?? [];
    const found = models.some(
      (m) => m.name === cfg.model || m.name.startsWith(`${cfg.model}:`),
    );
    if (!found) {
      const available = models.map((m) => m.name).join(", ") || "none";
      return {
        ok: false,
        error: `Model "${cfg.model}" not found. Available: ${available}. Run: ollama pull ${cfg.model}`,
      };
    }
    return { ok: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Cannot reach Ollama at ${cfg.baseUrl}: ${msg}. Is Ollama running?`,
    };
  }
}

/**
 * Embed multiple texts via Ollama /api/embed.
 * Batches at BATCH_SIZE (Ollama processes sequentially internally).
 * Returns one Float32Array per input text.
 */
export async function embed(
  texts: string[],
  config: Partial<OllamaConfig> = {},
): Promise<Float32Array[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logDebug(HOOK_NAME, `Embedding batch ${i / BATCH_SIZE + 1} (${batch.length} texts)`);

    const resp = await fetch(`${cfg.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, input: batch }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Ollama embed failed (${resp.status}): ${body}`);
    }

    const json = await resp.json();
    const parseResult = OllamaEmbedResponseSchema.safeParse(json);
    if (!parseResult.success) {
      throw new Error(`Invalid Ollama embed response: ${parseResult.error.message}`);
    }

    const {data} = parseResult;
    if (data.embeddings.length !== batch.length) {
      throw new Error(
        `Expected ${batch.length} embeddings, got ${data.embeddings.length}`,
      );
    }

    for (const vec of data.embeddings) {
      results.push(new Float32Array(vec));
    }
  }

  return results;
}

/**
 * Embed a single text. Convenience wrapper around embed().
 */
export async function embedOne(
  text: string,
  config: Partial<OllamaConfig> = {},
): Promise<Float32Array> {
  const results = await embed([text], config);
  if (results.length === 0) {
    throw new Error("Embedding failed: received empty result array");
  }
  return results[0];
}

/**
 * Generate text using Ollama's /api/generate endpoint.
 * Follows same pattern as embed()/embedOne() for consistency.
 */
export async function generateText(
  prompt: string,
  options?: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    model?: string;
  },
): Promise<{ success: boolean; text: string; error?: string; latency_ms: number }> {
  const startTime = Date.now();
  const model = options?.model ?? HYDE_OLLAMA_MODEL;
  const baseUrl = process.env.OLLAMA_BASE_URL ?? OLLAMA_BASE_URL;

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: options?.systemPrompt
          ? `${options.systemPrompt}\n\n${prompt}`
          : prompt,
        stream: false, // Non-streaming for simplicity
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 200,
        },
      }),
      signal: AbortSignal.timeout(options?.timeout ?? 10_000),
    });

    if (!response.ok) {
      return {
        success: false,
        text: "",
        error: `HTTP ${response.status}: ${response.statusText}`,
        latency_ms: Date.now() - startTime,
      };
    }

    const data = await response.json();
    return {
      success: true,
      text: data.response || "",
      latency_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      text: "",
      error: String(error),
      latency_ms: Date.now() - startTime,
    };
  }
}
