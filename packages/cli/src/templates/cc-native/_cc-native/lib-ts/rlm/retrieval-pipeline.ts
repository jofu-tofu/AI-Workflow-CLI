#!/usr/bin/env bun
/**
 * Retrieval Pipeline — Semantic search across session transcripts.
 *
 * Orchestrates a 4-stage pipeline:
 *   Stage 2: Embed query → KNN search → top chunks
 *   Stage 3: Parallel haiku summarizers per session
 *   Stage 4: Sonnet ranker → structured JSON per session
 *   Stage 5: Sonnet synthesizer → final markdown answer
 *
 * Usage:
 *   bun retrieval-pipeline.ts "query" [--top=20] [--project=name]
 */

import { z } from "zod";

import { hydeQueryEmbedding } from "./hyde.js";
import { logInfo, logWarn, logError } from "./logger.js";
import { checkOllamaHealth, embedOne } from "./ollama-client.js";
import { loadTranscript } from "./transcript-loader.js";
import {
  VECTOR_TOP_K,
  MAX_PARALLEL_SUMMARIZERS,
  HYDE_ENABLED,
  HYDE_NUM_RESPONSES,
  HYDE_MAX_TOKENS,
  HYDE_TIMEOUT_MS,
  HYDE_FALLBACK_TO_QUERY,
  type VectorSearchResult,
  type ChunkSummary,
  type RankedSession,
  type RetrievalResult,
} from "./types.js";
import { openVectorDb, searchKnn } from "./vector-store.js";

const HOOK_NAME = "rlm_retrieve";

// Dynamic import for inference (crosses package boundary)
let inferenceAsync: typeof import("../../../../_shared/lib-ts/base/inference.js").inferenceAsync;

try {
  const mod = await import("../../../../_shared/lib-ts/base/inference.js");
  inferenceAsync = mod.inferenceAsync;
} catch {
  // Fallback: warn and provide a stub that always fails
  logWarn(HOOK_NAME, "Could not import inferenceAsync, AI stages will fail");
  inferenceAsync = async () => ({
    success: false,
    output: "",
    error: "inferenceAsync not available",
    latency_ms: 0,
  });
}

// Zod schema for AI ranking response
const RankingItemSchema = z.object({
  index: z.number(),
  relevant: z.boolean(),
  confidence: z.number(),
  topics: z.array(z.string()),
  key_findings: z.array(z.string()),
});
const RankingsSchema = z.array(RankingItemSchema);

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith("--"));
const topArg = args.find((a) => a.startsWith("--top="));
const topK = topArg ? parseInt(topArg.split("=")[1], 10) : VECTOR_TOP_K;
const projectArg = args.find((a) => a.startsWith("--project="));
const projectFilter = projectArg ? projectArg.split("=")[1] : undefined;

if (!query) {
  process.stderr.write(
    'Usage: bun retrieval-pipeline.ts "query" [--top=20] [--project=name]\n',
  );
  process.exitCode = 1;
} else {
  try {
    await runPipeline(query, topK, projectFilter);
  } catch (error) {
    logError(HOOK_NAME, `Fatal: ${error}`, { stderr: true });
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator
// ---------------------------------------------------------------------------

async function runPipeline(
  query: string,
  topK: number,
  project?: string,
): Promise<void> {
  const totalStart = Date.now();
  const timings = {
    embed_query_ms: 0,
    vector_search_ms: 0,
    summarize_ms: 0,
    rank_ms: 0,
    synthesize_ms: 0,
    total_ms: 0,
  };

  // Pre-flight: check Ollama
  const health = await checkOllamaHealth();
  if (!health.ok) {
    logError(HOOK_NAME, health.error ?? "Unknown Ollama health check error", { stderr: true });
    process.exitCode = 1;
    return;
  }

  // Stage 2: Embed query + KNN search
  let t = Date.now();
  let queryEmbedding: Float32Array;
  let hydeTiming = 0;

  if (HYDE_ENABLED) {
    try {
      const hydeStart = Date.now();
      queryEmbedding = await hydeQueryEmbedding(query, {
        numResponses: HYDE_NUM_RESPONSES,
        maxTokens: HYDE_MAX_TOKENS,
        timeout: HYDE_TIMEOUT_MS,
        fallbackToQuery: HYDE_FALLBACK_TO_QUERY,
      });
      hydeTiming = Date.now() - hydeStart;
      logInfo(HOOK_NAME, `HyDE query embedding completed in ${hydeTiming}ms`);
    } catch (error) {
      logWarn(HOOK_NAME, `HyDE failed: ${error}, falling back to direct query embedding`);
      queryEmbedding = await embedOne(query);
    }
  } else {
    queryEmbedding = await embedOne(query);
  }

  timings.embed_query_ms = Date.now() - t;
  if (hydeTiming > 0) {
    (timings as any).hyde_ms = hydeTiming;
  }

  t = Date.now();
  const db = openVectorDb();
  let results: VectorSearchResult[];
  try {
    results = searchKnn(db, queryEmbedding, topK, project);
  } finally {
    db.close();
  }
  timings.vector_search_ms = Date.now() - t;

  if (results.length === 0) {
    const empty: RetrievalResult = {
      query,
      synthesis:
        "No results found. Suggestions:\n" +
        "- Try a different query\n" +
        "- Run `/rlm:embed-index` to build/refresh the vector index\n" +
        "- Use `/rlm:search` for keyword-based fallback",
      sources: [],
      stage_timings: { ...timings, total_ms: Date.now() - totalStart },
    };
    process.stdout.write(JSON.stringify(empty, null, 2) + "\n");
    return;
  }

  // Deduplicate by session_id (keep best chunk per session)
  const sessionMap = new Map<
    string,
    { result: VectorSearchResult; chunks: VectorSearchResult[] }
  >();
  for (const r of results) {
    const key = `${r.session_id}:${r.project}`;
    const existing = sessionMap.get(key);
    if (!existing) {
      sessionMap.set(key, { result: r, chunks: [r] });
    } else {
      existing.chunks.push(r);
      if (r.distance < existing.result.distance) {
        existing.result = r;
      }
    }
  }
  const sessions = [...sessionMap.values()];
  logInfo(
    HOOK_NAME,
    `Stage 2: ${results.length} chunks → ${sessions.length} sessions`,
  );

  // Stage 3: Parallel haiku summarization
  t = Date.now();
  const summaries = await summarizeSessions(query, sessions);
  timings.summarize_ms = Date.now() - t;

  if (summaries.length === 0) {
    const noSummaries: RetrievalResult = {
      query,
      synthesis: "Found matching chunks but all summarization attempts failed.",
      sources: [],
      stage_timings: { ...timings, total_ms: Date.now() - totalStart },
    };
    process.stdout.write(JSON.stringify(noSummaries, null, 2) + "\n");
    return;
  }

  // Stage 4: Sonnet ranking
  t = Date.now();
  const ranked = await rankSessions(query, summaries);
  timings.rank_ms = Date.now() - t;

  // Stage 5: Sonnet synthesis
  t = Date.now();
  const relevant = ranked.filter((r) => r.relevant);
  let synthesis: string;
  if (relevant.length > 0) {
    synthesis = await synthesize(query, relevant, summaries);
  } else {
    synthesis =
      "No sessions were deemed relevant to your query.\n" +
      "Suggestions:\n" +
      "- Try a different or broader query\n" +
      "- Use `/rlm:search` for keyword-based fallback";
  }
  timings.synthesize_ms = Date.now() - t;
  timings.total_ms = Date.now() - totalStart;

  const output: RetrievalResult = {
    query,
    synthesis,
    sources: ranked,
    stage_timings: timings,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Stage 3: Parallel haiku summarization
// ---------------------------------------------------------------------------

async function summarizeSessions(
  query: string,
  sessions: Array<{
    result: VectorSearchResult;
    chunks: VectorSearchResult[];
  }>,
): Promise<ChunkSummary[]> {
  const results: ChunkSummary[] = [];

  // Process in batches of MAX_PARALLEL_SUMMARIZERS
  for (let i = 0; i < sessions.length; i += MAX_PARALLEL_SUMMARIZERS) {
    const batch = sessions.slice(i, i + MAX_PARALLEL_SUMMARIZERS);
    const promises = batch.map(async (session) => {
      try {
        return await summarizeOneSession(query, session);
      } catch (error) {
        logWarn(
          HOOK_NAME,
          `Summarize failed for ${session.result.session_id}: ${error}`,
        );
        return null;
      }
    });

    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results;
}

async function summarizeOneSession(
  query: string,
  session: { result: VectorSearchResult; chunks: VectorSearchResult[] },
): Promise<ChunkSummary | null> {
  const best = session.result;

  // Load transcript segment
  let content: string;
  try {
    const loaded = await loadTranscript(
      best.source_path,
      [best.line_start, best.line_end],
      4000,
    );
    content = loaded.content;
  } catch {
    content = `[Could not load transcript. Topic: ${best.topic}]`;
  }

  if (!content || content.length < 20) return null;

  const systemPrompt =
    "You are a session transcript summarizer. Extract ONLY information relevant to the query. " +
    "Mention specific file names, function names, decisions made, and outcomes. " +
    "If nothing in the transcript is relevant to the query, respond with exactly: Not relevant. " +
    "Keep your summary under 200 words.";

  const userPrompt =
    `Query: ${query}\n\n` +
    `Session: ${best.session_id} (${best.project}, ${best.date})\n` +
    `Topic: ${best.topic}\n\n` +
    `Transcript:\n${content}`;

  const result = await inferenceAsync(systemPrompt, userPrompt, "fast", 30);

  if (!result.success || !result.output) {
    logWarn(HOOK_NAME, `Summarize inference failed: ${result.error}`);
    return null;
  }

  if (result.output.trim().toLowerCase() === "not relevant.") {
    return null;
  }

  return {
    session_id: best.session_id,
    project: best.project,
    date: best.date,
    segment_lines: [best.line_start, best.line_end],
    summary: result.output.trim(),
    source_path: best.source_path,
  };
}

// ---------------------------------------------------------------------------
// Stage 4: Sonnet ranking
// ---------------------------------------------------------------------------

async function rankSessions(
  query: string,
  summaries: ChunkSummary[],
): Promise<RankedSession[]> {
  const summaryText = summaries
    .map(
      (s, i) =>
        `[${i + 1}] Session: ${s.session_id} | Project: ${s.project} | Date: ${s.date}\nSummary: ${s.summary}`,
    )
    .join("\n\n");

  const systemPrompt =
    "You are a session relevance ranker. Given a query and session summaries, " +
    "evaluate each session's relevance. Output a JSON array where each element has:\n" +
    '  { "index": number, "relevant": boolean, "confidence": number (0-1), "topics": string[], "key_findings": string[] }\n' +
    "Output ONLY the JSON array, no other text.";

  const userPrompt = `Query: ${query}\n\nSessions:\n${summaryText}`;

  const result = await inferenceAsync(systemPrompt, userPrompt, "standard", 60);

  if (!result.success || !result.output) {
    logWarn(HOOK_NAME, `Rank inference failed: ${result.error}, marking all as relevant`);
    return summaries.map((s) => ({
      session_id: s.session_id,
      project: s.project,
      date: s.date,
      relevant: true,
      confidence: 0.3,
      topics: [],
      key_findings: [s.summary.slice(0, 200)],
    }));
  }

  try {
    // Extract JSON array from response (may be wrapped in markdown code blocks)
    let jsonStr = result.output.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const rawJson = JSON.parse(jsonStr);
    const parseResult = RankingsSchema.safeParse(rawJson);
    if (!parseResult.success) {
      throw new Error(`Invalid ranking response format: ${parseResult.error.message}`);
    }

    const rankings = parseResult.data;

    return rankings.map((r) => {
      // Safe array indexing with bounds check
      if (r.index < 1 || r.index > summaries.length) {
        logWarn(HOOK_NAME, `Rank index ${r.index} out of bounds (1-${summaries.length})`);
        return null;
      }
      const summary = summaries[r.index - 1];
      return {
        session_id: summary.session_id,
        project: summary.project,
        date: summary.date,
        relevant: r.relevant,
        confidence: r.confidence,
        topics: r.topics,
        key_findings: r.key_findings,
      };
    }).filter((r): r is RankedSession => r !== null);
  } catch (error) {
    logWarn(HOOK_NAME, `Rank parse failed: ${error}, marking all as relevant`);
    return summaries.map((s) => ({
      session_id: s.session_id,
      project: s.project,
      date: s.date,
      relevant: true,
      confidence: 0.3,
      topics: [],
      key_findings: [s.summary.slice(0, 200)],
    }));
  }
}

// ---------------------------------------------------------------------------
// Stage 5: Sonnet synthesis
// ---------------------------------------------------------------------------

async function synthesize(
  query: string,
  relevant: RankedSession[],
  summaries: ChunkSummary[],
): Promise<string> {
  // Build context from relevant sessions
  const summaryMap = new Map(summaries.map((s) => [s.session_id, s]));

  const context = relevant
    .map((r) => {
      const summary = summaryMap.get(r.session_id);
      return (
        `Session: ${r.session_id} | Project: ${r.project} | Date: ${r.date}\n` +
        `Topics: ${r.topics.join(", ")}\n` +
        `Key Findings: ${r.key_findings.join("; ")}\n` +
        `Full Summary: ${summary?.summary ?? "(no summary)"}`
      );
    })
    .join("\n\n---\n\n");

  const systemPrompt =
    "You are a knowledge synthesizer. Given a query and relevant session findings, " +
    "produce a coherent markdown answer. Include session citations inline as " +
    '"(session: {date}, {project})". Highlight the most recent and relevant information. ' +
    "Note any contradictions or evolution across sessions. Be concise but thorough.";

  const userPrompt = `Query: ${query}\n\nRelevant Sessions:\n${context}`;

  const result = await inferenceAsync(systemPrompt, userPrompt, "standard", 60);

  if (!result.success || !result.output) {
    logWarn(HOOK_NAME, `Synthesize inference failed: ${result.error}`);
    // Fallback: concatenate key findings
    return relevant
      .map(
        (r) =>
          `**${r.date} (${r.project}):** ${r.key_findings.join(". ")}`,
      )
      .join("\n\n");
  }

  return result.output.trim();
}
