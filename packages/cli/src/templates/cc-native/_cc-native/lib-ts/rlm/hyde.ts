/**
 * HyDE (Hypothetical Document Embeddings) for improved RLM retrieval.
 *
 * Instead of embedding the user query directly, we:
 * 1. Generate N hypothetical answers to the query
 * 2. Embed each hypothetical answer
 * 3. Average the embeddings
 * 4. Search with the averaged embedding
 *
 * Research shows 20-45% recall improvement over direct query embedding.
 * See: Gao et al., "Precise Zero-Shot Dense Retrieval without Relevance Labels" (ACL 2023)
 */

import { logDebug, logInfo, logWarn } from "./logger.js";
import { generateText , embed, embedOne } from "./ollama-client.js";

const HOOK_NAME = "rlm_hyde";

/**
 * System prompt for generating hypothetical responses.
 *
 * Key design choices:
 * - Concrete example shows what "technical language" means (file names, function names)
 * - Strict constraints (2-3 sentences, under 200 tokens) prevent rambling
 * - Domain-specific priming ("past coding sessions")
 * - Permission to speculate reduces "I don't know" refusals
 * - Generic file paths (not RLM-specific) keep prompt reusable
 */
const HYDE_SYSTEM_PROMPT = `You are a knowledge base assistant. Given a user query about past coding sessions, generate a hypothetical answer that MIGHT exist in session transcripts.

Rules:
- Write 2-3 sentences maximum (under 200 tokens)
- Use specific technical language: file names, function names, error messages, tool names
- Describe actions taken, decisions made, or problems solved
- Do NOT say "I don't know" or ask clarifying questions
- Be concrete and specific, even if speculative

Example:

Query: "How did we fix the authentication redirect loop?"

Hypothetical Answer: "The redirect loop was caused by middleware checking session.user before the session was populated. We moved the auth check to a route-level guard in src/middleware/auth.ts and updated the session initialization order in app.ts to populate user data before routing."`;

/**
 * Average multiple embedding vectors element-wise.
 *
 * Embedding vectors exist in semantic space where averaging is meaningful.
 * Averaging across multiple hypothetical responses:
 * - Preserves dimensionality (768-dim → 768-dim)
 * - Smooths out noise/hallucinations from individual generations
 * - Captures the "centroid" of the semantic space around the query
 */
function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length === 0) {
    throw new Error("No embeddings to average");
  }

  const dim = embeddings[0].length;
  const avg = new Float32Array(dim);

  // Sum all embeddings element-wise
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i];
    }
  }

  // Divide by count
  const n = embeddings.length;
  for (let i = 0; i < dim; i++) {
    avg[i] /= n;
  }

  return avg;
}

/**
 * Generate hypothetical responses to a query, embed them, and return the averaged embedding.
 *
 * Process:
 * 1. Generate N hypothetical responses in parallel via Promise.all
 * 2. Filter out failed/short responses (minimum 20 chars)
 * 3. Require at least 3 successful responses (threshold for meaningful averaging)
 * 4. Embed all successful responses in batch
 * 5. Average the embeddings element-wise
 *
 * Fallback behavior:
 * - If < 3 successful responses AND config.fallbackToQuery = true: return embedOne(query)
 * - If < 3 successful responses AND config.fallbackToQuery = false: throw error
 *
 * @param query - The user's search query
 * @param config - HyDE configuration (num responses, max tokens, timeout, fallback behavior)
 * @returns Averaged embedding vector (Float32Array)
 */
export async function hydeQueryEmbedding(
  query: string,
  config: {
    numResponses: number;
    maxTokens: number;
    timeout: number;
    fallbackToQuery: boolean;
  },
): Promise<Float32Array> {
  logInfo(HOOK_NAME, `Generating ${config.numResponses} hypothetical responses via Ollama`);

  // Step 1: Generate N hypothetical responses in parallel
  const promises = Array.from({ length: config.numResponses }, (_) =>
    generateText(query, {
      systemPrompt: HYDE_SYSTEM_PROMPT,
      maxTokens: config.maxTokens,
      timeout: config.timeout,
      temperature: 0.7, // Diversity across responses
    }),
  );

  const results = await Promise.all(promises);
  const responses = results
    .filter((r) => r.success && r.text.trim().length > 20)
    .map((r) => r.text.trim());

  logDebug(HOOK_NAME, `Generated ${responses.length}/${config.numResponses} successful responses`);

  // Step 2: Fallback if too few responses (minimum 3 for meaningful averaging)
  if (responses.length < 3) {
    logWarn(
      HOOK_NAME,
      `Only ${responses.length} responses generated (need ≥3), falling back to direct query embedding`,
    );
    if (config.fallbackToQuery) {
      return embedOne(query);
    }
    throw new Error("HyDE generation failed: insufficient responses");
  }

  // Note: Proceeding with 3-4 responses when 1-2 fail is acceptable
  // Averaging 3+ responses still provides HyDE benefits vs. direct query embedding

  // Step 3: Embed all responses (batch for efficiency)
  const embeddings = await embed(responses);

  // Step 4: Average embeddings
  logDebug(HOOK_NAME, `Averaging ${embeddings.length} embeddings`);
  const avg = averageEmbeddings(embeddings);

  logInfo(HOOK_NAME, `HyDE complete: ${responses.length} responses averaged`);
  return avg;
}
