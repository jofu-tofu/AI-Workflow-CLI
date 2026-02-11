/**
 * Review artifact writing and formatting.
 * See cc-native-plan-review-spec.md §4.3
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { atomicWrite } from "../../../_shared/lib-ts/base/atomic-write.js";
import { logDebug, logWarn, logError } from "../../../_shared/lib-ts/base/logger.js";
import { nowIso } from "../../../_shared/lib-ts/base/utils.js";
import { sanitizeFilename } from "../../../_shared/lib-ts/base/constants.js";
import { ENABLE_ROBUST_PLAN_WRITES } from "./constants.js";
import type {
  CombinedReviewResult,
  ReviewerResult,
  DisplaySettings,
} from "./types.js";
import { DEFAULT_DISPLAY } from "./types.js";

// ---------------------------------------------------------------------------
// Markdown Formatting
// ---------------------------------------------------------------------------

/**
 * Format review results as markdown (legacy compat format).
 */
export function formatReviewMarkdown(
  results: ReviewerResult[],
  overall: string,
  title = "CC-Native Plan Review",
  settings?: Record<string, unknown>,
): string {
  const display = resolveDisplay(settings);

  const lines: string[] = [];
  lines.push(`# ${title}\n`);
  lines.push(`**Overall verdict:** \`${overall.toUpperCase()}\`\n`);

  for (const r of results) {
    const displayName = r.name === r.name.toLowerCase() ? titleCase(r.name) : r.name;
    lines.push(`## ${displayName}\n`);
    lines.push(`- ok: \`${r.ok}\``);
    lines.push(`- verdict: \`${r.verdict}\``);

    if (r.data && Object.keys(r.data).length > 0) {
      const summary = String(r.data.summary ?? "").trim();
      if (r.data.summary_source === "default") {
        lines.push(`- summary: ⚠️ ${summary} *(reviewer did not return summary)*`);
      } else {
        lines.push(`- summary: ${summary}`);
      }
      appendReviewDetails(lines, r.data, display);
    } else {
      lines.push(`- note: ${r.err || "no structured output"}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Format combined review result as a single markdown document.
 */
export function formatCombinedMarkdown(
  result: CombinedReviewResult,
  settings?: Record<string, unknown>,
): string {
  const display = resolveDisplay(settings);

  const lines: string[] = [];
  lines.push("# CC-Native Plan Review\n");
  lines.push(`**Overall Verdict:** \`${result.overall_verdict.toUpperCase()}\``);
  lines.push(`**Plan Hash:** \`${result.plan_hash}\`\n`);
  lines.push("---\n");

  // CLI Reviewers section
  if (Object.keys(result.cli_reviewers).length > 0) {
    lines.push("## CLI Reviewers\n");
    for (const [name, r] of Object.entries(result.cli_reviewers)) {
      lines.push(`### ${titleCase(name)}\n`);
      lines.push(`- verdict: \`${r.verdict}\``);
      if (r.data && Object.keys(r.data).length > 0) {
        appendSummaryLine(lines, r.data);
        appendReviewDetails(lines, r.data, display);
      } else if (r.err) {
        lines.push(`- error: ${r.err}`);
      }
      lines.push("");
    }
  }

  // Orchestration section
  if (result.orchestration) {
    lines.push("---\n");
    lines.push("## Orchestration\n");
    lines.push(`- **Complexity:** \`${result.orchestration.complexity}\``);
    lines.push(`- **Category:** \`${result.orchestration.category}\``);
    const agentsStr =
      result.orchestration.selected_agents.length > 0
        ? result.orchestration.selected_agents.join(", ")
        : "None";
    lines.push(`- **Agents Selected:** ${agentsStr}`);
    lines.push(`- **Reasoning:** ${result.orchestration.reasoning}`);
    if (result.orchestration.skip_reason) {
      lines.push(`- **Skip Reason:** ${result.orchestration.skip_reason}`);
    }
    if (result.orchestration.error) {
      lines.push(`- **Error:** ${result.orchestration.error}`);
    }
    lines.push("");
  }

  // Agent Reviews section
  if (Object.keys(result.agents).length > 0) {
    lines.push("---\n");
    lines.push("## Agent Reviews\n");
    for (const [name, r] of Object.entries(result.agents)) {
      lines.push(`### ${name}\n`);
      lines.push(`- verdict: \`${r.verdict}\``);
      if (r.data && Object.keys(r.data).length > 0) {
        appendSummaryLine(lines, r.data);
        appendReviewDetails(lines, r.data, display);
      } else if (r.err) {
        lines.push(`- error: ${r.err}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim() + "\n";
}

// ---------------------------------------------------------------------------
// Inline Summaries
// ---------------------------------------------------------------------------

/**
 * Build compact inline summary of HIGH-severity findings for additionalContext.
 */
export function buildInlineReviewSummary(
  combined: CombinedReviewResult,
  maxIssues = 5,
  maxChars = 800,
): string {
  const allReviewers = [
    ...Object.values(combined.cli_reviewers),
    ...Object.values(combined.agents),
  ];

  const highIssues: Array<Record<string, unknown>> = [];
  for (const r of allReviewers) {
    if (!r.data) continue;
    const issues = r.data.issues as Array<Record<string, unknown>> | undefined;
    if (!issues) continue;
    for (const issue of issues) {
      if (issue.severity === "high") {
        highIssues.push({ ...issue, _reviewer: r.name });
      }
    }
  }

  const parts: string[] = [];

  // Overall verdict line
  const issueCount = highIssues.length;
  const countSuffix =
    issueCount > 0
      ? ` (${issueCount} high-severity issue${issueCount !== 1 ? "s" : ""})`
      : "";
  parts.push(`**Plan Review: ${combined.overall_verdict.toUpperCase()}**${countSuffix}`);

  // High-severity issue bullets
  for (const issue of highIssues.slice(0, maxIssues)) {
    const cat = (issue.category as string) ?? "general";
    const text = (issue.issue as string) ?? "";
    const fix = (issue.suggested_fix as string) ?? "";
    const reviewer = (issue._reviewer as string) ?? "unknown";
    let line = `- [${cat}] ${text}`;
    if (fix) line += ` \u2192 ${fix}`;
    line += ` (${reviewer})`;
    parts.push(line);
  }

  const remaining = highIssues.length - maxIssues;
  if (remaining > 0) {
    parts.push(`  ...and ${remaining} more`);
  }

  let result = parts.join("\n");
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 3) + "...";
  }
  return result;
}

/**
 * Extract top issues as compact text for permissionDecisionReason.
 */
export function extractTopIssuesText(
  combined: CombinedReviewResult,
  maxCount = 3,
  severity = "high",
): string {
  const allReviewers = [
    ...Object.values(combined.cli_reviewers),
    ...Object.values(combined.agents),
  ];

  const issues: string[] = [];
  for (const r of allReviewers) {
    if (!r.data) continue;
    const issueList = r.data.issues as Array<Record<string, unknown>> | undefined;
    if (!issueList) continue;
    for (const issue of issueList) {
      if (issue.severity === severity) {
        const text = String(issue.issue ?? "").trim();
        if (text) {
          issues.push(`[${r.name}] ${text}`);
          break; // first high issue per reviewer only
        }
      }
    }
    if (issues.length >= maxCount) break;
  }

  if (issues.length === 0) return "Review found critical issues";
  return issues.join("; ");
}

/**
 * Build markdown document containing ONLY high-severity issues.
 */
export function buildHighIssuesDocument(
  combined: CombinedReviewResult,
): string {
  const lines = ["# High-Severity Issues\n"];
  const allReviewers = [
    ...Object.values(combined.cli_reviewers),
    ...Object.values(combined.agents),
  ];

  let foundAny = false;
  for (const r of allReviewers) {
    if (!r.data) continue;
    const issues = r.data.issues as Array<Record<string, unknown>> | undefined;
    if (!issues) continue;

    const highIssues = issues.filter((i) => i.severity === "high");
    if (highIssues.length === 0) continue;

    foundAny = true;
    lines.push(`## ${r.name} (${r.verdict})\n`);
    for (const issue of highIssues) {
      const cat = (issue.category as string) ?? "general";
      const text = String(issue.issue ?? "").trim();
      const fix = String(issue.suggested_fix ?? "").trim();
      lines.push(`- **[${cat}]** ${text}`);
      if (fix) lines.push(`  - Fix: ${fix}`);
    }
    lines.push(""); // blank line between agents
  }

  if (!foundAny) {
    lines.push("No high-severity issues found.\n");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Index Generation
// ---------------------------------------------------------------------------

/**
 * Generate index.md for a review folder.
 */
export function generateReviewIndex(
  result: CombinedReviewResult,
  iteration?: number,
  _settings?: Record<string, unknown>,
): string {
  const now = new Date();

  const lines = [
    "---",
    `type: review`,
    `plan_hash: ${result.plan_hash}`,
    `overall_verdict: ${result.overall_verdict}`,
    `created_at: ${result.timestamp}`,
  ];
  if (iteration) lines.push(`iteration: ${iteration}`);
  lines.push(
    "---",
    "",
    `# Plan Review - ${formatDate(now)}`,
    "",
    `**Overall Verdict:** \`${result.overall_verdict.toUpperCase()}\``,
  );

  if (iteration) lines.push(`**Iteration:** ${iteration}`);
  lines.push(`**Plan Hash:** \`${result.plan_hash}\``, "");

  // Summary from orchestrator
  if (result.orchestration) {
    lines.push(
      "## Analysis",
      `- **Complexity:** \`${result.orchestration.complexity}\``,
      `- **Category:** \`${result.orchestration.category}\``,
      `- **Reasoning:** ${result.orchestration.reasoning}`,
      "",
    );
  }

  // Navigation table
  lines.push(
    "## Review Files",
    "",
    "| File | Description |",
    "|------|-------------|",
    "| [combined.md](./combined.md) | Full review details |",
    "| [combined.json](./combined.json) | Structured review data |",
  );

  for (const name of Object.keys(result.cli_reviewers)) {
    lines.push(
      `| [${name}.json](./${name}.json) | ${titleCase(name)} reviewer output |`,
    );
  }
  for (const name of Object.keys(result.agents)) {
    const safeName = sanitizeFilename(name);
    lines.push(
      `| [${safeName}.json](./${safeName}.json) | ${name} agent output |`,
    );
  }

  lines.push(
    "",
    "## Verdicts Summary",
    "",
    "| Reviewer | Verdict |",
    "|----------|---------|",
  );

  for (const [name, r] of Object.entries(result.cli_reviewers)) {
    lines.push(`| ${titleCase(name)} | \`${r.verdict}\` |`);
  }
  for (const [name, r] of Object.entries(result.agents)) {
    lines.push(`| ${name} | \`${r.verdict}\` |`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON Output
// ---------------------------------------------------------------------------

/**
 * Build combined JSON output structure.
 */
export function buildCombinedJson(
  result: CombinedReviewResult,
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    metadata: {
      timestamp: result.timestamp,
      plan_hash: result.plan_hash,
    },
    overall: {
      verdict: result.overall_verdict,
    },
  };

  // CLI reviewers
  if (Object.keys(result.cli_reviewers).length > 0) {
    const cliReviewers: Record<string, unknown> = {};
    output.cliReviewers = cliReviewers;
    for (const [name, r] of Object.entries(result.cli_reviewers)) {
      cliReviewers[name] = {
        verdict: r.verdict,
        summary: r.data?.summary ?? null,
        summarySource: r.data?.summary_source ?? null,
        issues: r.data
          ? ((r.data.issues as Array<Record<string, unknown>>) ?? []).filter(
              (i) => i.severity !== "low",
            )
          : [],
        ok: r.ok,
        error: r.err || null,
      };
    }
  }

  // Orchestration
  if (result.orchestration) {
    output.orchestration = {
      complexity: result.orchestration.complexity,
      category: result.orchestration.category,
      selectedAgents: result.orchestration.selected_agents,
      reasoning: result.orchestration.reasoning,
      skipReason: result.orchestration.skip_reason ?? null,
      error: result.orchestration.error ?? null,
    };
  }

  // Agents
  if (Object.keys(result.agents).length > 0) {
    const agents: Record<string, unknown> = {};
    output.agents = agents;
    for (const [name, r] of Object.entries(result.agents)) {
      agents[name] = {
        verdict: r.verdict,
        summary: r.data?.summary ?? null,
        summarySource: r.data?.summary_source ?? null,
        issues: r.data
          ? ((r.data.issues as Array<Record<string, unknown>>) ?? []).filter(
              (i) => i.severity !== "low",
            )
          : [],
        missing_sections: r.data?.missing_sections ?? [],
        questions: r.data?.questions ?? [],
        ok: r.ok,
        error: r.err || null,
      };
    }
  }

  return output;
}

// ---------------------------------------------------------------------------
// Artifact Writing
// ---------------------------------------------------------------------------

/**
 * Write combined review artifacts to context reviews folder.
 * Uses atomic writes for critical files when ENABLE_ROBUST_PLAN_WRITES is true.
 */
export function writeCombinedArtifacts(
  base: string,
  plan: string,
  result: CombinedReviewResult,
  payload: Record<string, unknown>,
  settings?: Record<string, unknown>,
  contextReviewsDir?: string,
  reviewFolder?: string,
  iteration?: number,
): string {
  const outDir = reviewFolder ?? contextReviewsDir;
  if (!outDir) {
    throw new Error("Either contextReviewsDir or reviewFolder is required");
  }

  logDebug("utils", `Using review folder: ${outDir}`);

  // Create directory
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (e: unknown) {
    logError("utils", `Cannot create directory ${outDir}: ${e}`);
    throw e;
  }

  // JSON write
  const jsonFilename = reviewFolder ? "combined.json" : "review.json";
  const jsonPath = path.join(outDir, jsonFilename);
  const jsonData = buildCombinedJson(result);
  writeFile(jsonPath, JSON.stringify(jsonData, null, 2));

  // Markdown write
  const mdFilename = reviewFolder ? "combined.md" : "review.md";
  const mdPath = path.join(outDir, mdFilename);
  const mdContent = formatCombinedMarkdown(result, settings);
  writeFile(mdPath, mdContent);

  // Individual reviewer writes (non-critical)
  for (const [name, r] of Object.entries(result.cli_reviewers)) {
    if (r.data) {
      writeFileNonCritical(
        path.join(outDir, `${name}.json`),
        JSON.stringify(r.data, null, 2),
      );
    }
  }
  for (const [name, r] of Object.entries(result.agents)) {
    if (r.data) {
      writeFileNonCritical(
        path.join(outDir, `${sanitizeFilename(name)}.json`),
        JSON.stringify(r.data, null, 2),
      );
    }
  }

  // Generate index.md for folder-based reviews
  if (reviewFolder) {
    const indexContent = generateReviewIndex(result, iteration, settings);
    writeFileNonCritical(path.join(outDir, "index.md"), indexContent);
    return path.join(outDir, "index.md");
  }

  return mdPath;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDisplay(
  settings?: Record<string, unknown>,
): DisplaySettings {
  if (!settings) return { ...DEFAULT_DISPLAY };
  const display = (settings.display as Partial<DisplaySettings>) ?? {};
  return { ...DEFAULT_DISPLAY, ...display };
}

function appendSummaryLine(lines: string[], data: Record<string, unknown>): void {
  const summary = String(data.summary ?? "").trim();
  if (data.summary_source === "default") {
    lines.push(`- summary: ⚠️ ${summary} *(reviewer did not return summary)*`);
  } else {
    lines.push(`- summary: ${summary}`);
  }
}

function appendReviewDetails(
  lines: string[],
  data: Record<string, unknown>,
  display: DisplaySettings,
): void {
  const issues = ((data.issues as Array<Record<string, unknown>>) ?? []).filter(
    (i) => i.severity !== "low",
  );
  if (issues.length > 0) {
    lines.push("\n**Issues:**");
    for (const it of issues.slice(0, display.maxIssues)) {
      const sev = (it.severity as string) ?? "medium";
      const cat = (it.category as string) ?? "general";
      const issue = (it.issue as string) ?? "";
      const fix = (it.suggested_fix as string) ?? "";
      lines.push(`- **[${sev}] ${cat}**: ${issue}`);
      if (fix) lines.push(`  - fix: ${fix}`);
    }
  }

  const missing = (data.missing_sections as string[]) ?? [];
  if (missing.length > 0) {
    lines.push("\n**Missing Sections:**");
    for (const m of missing.slice(0, display.maxMissingSections)) {
      lines.push(`- ${m}`);
    }
  }

  const qs = (data.questions as string[]) ?? [];
  if (qs.length > 0) {
    lines.push("\n**Questions:**");
    for (const q of qs.slice(0, display.maxQuestions)) {
      lines.push(`- ${q}`);
    }
  }
}

function writeFile(filePath: string, content: string): void {
  try {
    if (ENABLE_ROBUST_PLAN_WRITES) {
      const [success, error] = atomicWrite(filePath, content);
      if (!success) throw new Error(`Atomic write failed: ${error}`);
    } else {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  } catch (e: unknown) {
    logError("utils", `Failed to write ${path.basename(filePath)}: ${e}`);
    throw e;
  }
}

function writeFileNonCritical(filePath: string, content: string): void {
  try {
    if (ENABLE_ROBUST_PLAN_WRITES) {
      const [success, error] = atomicWrite(filePath, content);
      if (!success) {
        logWarn("utils", `Failed to write ${path.basename(filePath)}: ${error}`);
      }
    } else {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  } catch (e: unknown) {
    logWarn("utils", `Failed to write ${path.basename(filePath)}: ${e}`);
  }
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
