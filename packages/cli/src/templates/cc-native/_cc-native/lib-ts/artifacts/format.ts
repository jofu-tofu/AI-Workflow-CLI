/**
 * Pure formatting functions for review artifacts.
 * Extracted from artifacts.ts — no file I/O.
 */

import { sanitizeFilename } from "../../../_shared/lib-ts/base/constants.js";
import type {
  CombinedReviewResult,
  ReviewerResult,
  DisplaySettings,
  CorroborationResult,
} from "../types.js";
import { DEFAULT_DISPLAY } from "../types.js";

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
  corroboration?: CorroborationResult,
): string {
  const display = resolveDisplay(settings);

  const lines: string[] = [];
  lines.push("# CC-Native Plan Review\n");
  lines.push(`**Overall Verdict:** \`${result.overall_verdict.toUpperCase()}\``);
  lines.push(`**Plan Hash:** \`${result.plan_hash}\`\n`);

  // Corroboration summary
  if (corroboration) {
    lines.push("## Corroboration Analysis\n");
    if (corroboration.blocking.length > 0) {
      lines.push("### Blocking Dimensions\n");
      for (const group of corroboration.blocking) {
        lines.push(`- **${group.dimension}**: ${group.issues.length} issues from ${group.agentCount} agents (threshold: ≥${group.threshold})`);
      }
      lines.push("");
    }
    if (corroboration.solo.length > 0) {
      lines.push("### Solo Dimensions (informational)\n");
      for (const s of corroboration.solo) {
        lines.push(`- **${s.dimension}**: ${s.issues.length} issues from ${s.agentCount} agents (threshold: >${s.threshold}, not exceeded)`);
      }
      lines.push("");
    }
    if (corroboration.unclassified.length > 0) {
      lines.push(`> ${corroboration.unclassified.length} issue(s) without dimension classification (unclassified, not blocking)\n`);
    }
  }

  lines.push("---\n");

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
 * When corroboration data is provided, annotates issues as [CORROBORATED] or [perspective].
 */
export function buildInlineReviewSummary(
  combined: CombinedReviewResult,
  maxIssues = 5,
  maxChars = 800,
  corroboration?: CorroborationResult,
): string {
  const allReviewers = Object.values(combined.agents);

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

  const issueCount = highIssues.length;
  const countSuffix =
    issueCount > 0
      ? ` (${issueCount} high-severity issue${issueCount !== 1 ? "s" : ""})`
      : "";
  parts.push(`**Plan Review: ${combined.overall_verdict.toUpperCase()}**${countSuffix}`);

  if (corroboration) {
    const blockCount = corroboration.blocking.length;
    const soloCount = corroboration.solo.length;
    if (blockCount > 0) {
      parts.push(`**Corroboration:** ${blockCount} dimension${blockCount !== 1 ? "s" : ""} exceeded threshold (blocking), ${soloCount} solo (informational)`);
    } else {
      parts.push(`**Corroboration:** No dimensions exceeded threshold — all ${soloCount} solo (informational)`);
    }
  }

  for (const issue of highIssues.slice(0, maxIssues)) {
    const cat = (issue.category as string) ?? "general";
    const text = (issue.issue as string) ?? "";
    const fix = (issue.suggested_fix as string) ?? "";
    const reviewer = (issue._reviewer as string) ?? "unknown";
    const dim = issue.dimension as string | undefined;

    let annotation = "";
    if (corroboration && dim) {
      const group = corroboration.blocking.find(g => g.dimension === dim);
      if (group) {
        annotation = ` [CORROBORATED — ${group.issues.length} issues from ${group.agentCount} agents exceeds threshold ${group.threshold}]`;
      } else {
        annotation = " [perspective]";
      }
    }

    let line = `- [${cat}] ${text}`;
    if (fix) line += ` \u2192 ${fix}`;
    line += ` (${reviewer})${annotation}`;
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
  const allReviewers = Object.values(combined.agents);

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
 * Build markdown document containing high-severity issues.
 * When corroboration data is provided, only includes corroborated (blocking) issues.
 */
export function buildHighIssuesDocument(
  combined: CombinedReviewResult,
  corroboration?: CorroborationResult,
): string {
  if (corroboration && corroboration.blocking.length > 0) {
    const lines = ["# Corroborated High-Severity Issues\n"];
    lines.push("> Only issues from dimensions where the total count exceeded the proportional threshold are shown.\n");

    for (const group of corroboration.blocking) {
      lines.push(`## ${group.dimension} (${group.issues.length} issues from ${group.agentCount} agents, threshold: ${group.threshold})\n`);
      for (const { agent, issue } of group.issues) {
        const cat = issue.category ?? "general";
        const text = String(issue.issue ?? "").trim();
        const fix = String(issue.suggested_fix ?? "").trim();
        lines.push(`- **[${cat}]** ${text} *(${agent})*`);
        if (fix) lines.push(`  - Fix: ${fix}`);
      }
      lines.push("");
    }

    if (corroboration.solo.length > 0) {
      lines.push("---\n");
      lines.push(`> ${corroboration.solo.length} dimension${corroboration.solo.length !== 1 ? "s" : ""} had issues below threshold (not blocking): ${corroboration.solo.map(s => `${s.dimension} (${s.issues.length}/${s.threshold})`).join(", ")}\n`);
    }

    return lines.join("\n");
  }

  const lines = ["# High-Severity Issues\n"];
  const allReviewers = Object.values(combined.agents);

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
    lines.push("");
  }

  if (!foundAny) {
    lines.push("No high-severity issues found.\n");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Corroboration Report
// ---------------------------------------------------------------------------

/**
 * Build a detailed markdown report of the corroboration analysis.
 */
export function buildCorroborationReport(
  corroborationResult: CorroborationResult,
): string {
  const lines: string[] = [
    "# Corroboration Analysis",
    "",
    "## Verdict: " + corroborationResult.verdict.toUpperCase(),
    "",
  ];

  if (corroborationResult.blocking.length > 0) {
    lines.push("## Blocking Issues (Corroborated)");
    lines.push("");
    lines.push("| Dimension | Issues | Agents | Threshold | Status |");
    lines.push("|-----------|--------|--------|-----------|--------|");

    for (const group of corroborationResult.blocking) {
      lines.push(
        `| ${group.dimension} | ${group.issues.length} | ${group.agentCount} | ${group.threshold} | ⛔ EXCEEDED |`
      );
    }
    lines.push("");

    for (const group of corroborationResult.blocking) {
      lines.push(`### ${group.dimension} (${group.issues.length} issues)`);
      lines.push("");
      for (const {agent, issue} of group.issues) {
        lines.push(`- **[${agent}]** ${issue.issue || "No description"}`);
      }
      lines.push("");
    }
  }

  if (corroborationResult.solo.length > 0) {
    lines.push("## Solo Findings (Below Threshold)");
    lines.push("");
    lines.push("| Dimension | Issues | Agents | Threshold | Status |");
    lines.push("|-----------|--------|--------|-----------|--------|");

    for (const group of corroborationResult.solo) {
      lines.push(
        `| ${group.dimension} | ${group.issues.length} | ${group.agentCount} | ${group.threshold} | ℹ️ SOLO |`
      );
    }
    lines.push("");

    for (const group of corroborationResult.solo) {
      lines.push(`### ${group.dimension} (${group.issues.length} issues)`);
      lines.push("");
      for (const {agent, issue} of group.issues) {
        lines.push(`- **[${agent}]** ${issue.issue || "No description"}`);
      }
      lines.push("");
    }
  }

  if (corroborationResult.unclassified.length > 0) {
    lines.push("## Unclassified Issues (No Dimension)");
    lines.push("");
    for (const {agent, issue} of corroborationResult.unclassified) {
      lines.push(`- **[${agent}]** ${issue.issue || "No description"}`);
    }
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Blocking groups**: ${corroborationResult.blocking.length}`);
  lines.push(`- **Solo findings**: ${corroborationResult.solo.length}`);
  lines.push(`- **Unclassified**: ${corroborationResult.unclassified.length}`);
  lines.push(`- **Final verdict**: ${corroborationResult.verdict}`);
  lines.push("");
  lines.push("**Threshold rule**: Issues in a dimension block when count ≥ 2× distinct agents in that dimension.");

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

  if (result.orchestration) {
    lines.push(
      "## Analysis",
      `- **Complexity:** \`${result.orchestration.complexity}\``,
      `- **Category:** \`${result.orchestration.category}\``,
      `- **Reasoning:** ${result.orchestration.reasoning}`,
      "",
    );
  }

  lines.push(
    "## Review Files",
    "",
    "| File | Description |",
    "|------|-------------|",
    "| [review.md](./review.md) | Full review details |",
    "| [review.json](./review.json) | Structured review data |",
    "| [plan.md](./plan.md) | Plan snapshot at review time |",
  );

  for (const name of Object.keys(result.agents)) {
    const safeName = sanitizeFilename(name);
    lines.push(
      `| [${safeName}.json](./reviewer-output/${safeName}.json) | ${name} agent output |`,
    );
  }

  lines.push(
    "",
    "## Verdicts Summary",
    "",
    "| Reviewer | Verdict |",
    "|----------|---------|",
  );

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
// Helpers (private)
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
