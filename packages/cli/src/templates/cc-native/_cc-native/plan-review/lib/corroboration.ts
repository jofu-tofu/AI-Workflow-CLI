/**
 * Corroboration-based verdict computation for plan review.
 *
 * Uses agent-agreement thresholding: a dimension blocks only when a sufficient
 * number of *distinct agents* independently flag it. This measures true
 * corroboration (multiple independent reviewers converge) rather than issue
 * density (one verbose agent floods a dimension).
 *
 * **Algorithm:**
 * For each dimension, compute: `effective_threshold = max(minAgreement, ceil(minRatio × totalAgents))`
 * Block when `distinct_agents_in_dimension >= effective_threshold`.
 *
 * **Default config:** `minAgreement=2, minRatio=0.40`
 * - At 6 agents: threshold=3 (50% must agree)
 * - At 10 agents: threshold=4 (40% must agree)
 * - At 20 agents: threshold=8 (40% must agree)
 *
 * **Why agent-agreement over issue-density:**
 * The previous system (issues >= 2×agents_in_dimension) allowed a single agent
 * to self-corroborate by raising 2+ issues, and made blocking harder as more
 * agents covered a dimension (inverted scaling). Agent-agreement fixes both:
 * a single agent can never self-corroborate, and more agents agreeing is a
 * stronger signal, not a weaker one.
 *
 * **Convergence problem this solves:**
 * Agents with opposing philosophies (simplicity-guardian vs completeness-gaps)
 * produce contradictory high-severity issues. Because the old system treated
 * every agent's finding as independently authoritative, plans oscillated —
 * addressing one agent's feedback triggered the opposing agent. The minAgreement
 * floor prevents any single agent's philosophy from blocking alone.
 *
 * **Revert path:** Change one line in review-pipeline.ts back to
 * `computeReviewDecision(allVerdicts)`. Old function kept in verdict.ts.
 */

import type {
  ReviewerResult,
  ReviewIssue,
  IssueDimension,
  CorroborationResult,
  CorroboratedGroup,
  SoloFinding,
} from "../../lib-ts/types.js";

/** Configuration for corroboration thresholds */
export interface CorroborationConfig {
  /** Minimum distinct agents that must agree to trigger blocking (default: 2) */
  minAgreement?: number;
  /** Minimum fraction of total agent pool that must agree (default: 0.40) */
  minRatio?: number;
}

const DEFAULT_MIN_AGREEMENT = 2;
const DEFAULT_MIN_RATIO = 0.40;

/**
 * Compute the effective blocking threshold for a given agent pool size.
 *
 * Returns `max(minAgreement, ceil(minRatio × totalAgents))`.
 * This ensures a fixed floor (no single-agent self-corroboration) while
 * scaling proportionally at larger pool sizes.
 */
export function getEffectiveThreshold(
  totalAgents: number,
  config: CorroborationConfig = {},
): number {
  const minAgreement = config.minAgreement ?? DEFAULT_MIN_AGREEMENT;
  const minRatio = config.minRatio ?? DEFAULT_MIN_RATIO;
  return Math.max(minAgreement, Math.ceil(totalAgents * minRatio));
}

/**
 * Compute a corroboration-based review decision from all reviewer results.
 *
 * Algorithm:
 * 1. Collect all high-severity issues with a `dimension` field
 * 2. Group by dimension, tracking distinct agent names per group
 * 3. Compute effective threshold: `max(minAgreement, ceil(minRatio × totalAgents))`
 * 4. For each dimension: block if `distinct_agents >= effective_threshold`
 * 5. Issues without `dimension` are unclassified (logged as warning, never block)
 * 6. Non-high issues are ignored (informational only)
 *
 * @param allResults - Map of reviewer name → ReviewerResult (CLI + agent)
 * @param config - Optional threshold configuration
 * @returns CorroborationResult with blocking groups, solo findings, and verdict
 */
export function computeCorroboratedDecision(
  allResults: Record<string, ReviewerResult>,
  config: CorroborationConfig = {},
): CorroborationResult {
  const totalAgents = Object.keys(allResults).length;
  const threshold = getEffectiveThreshold(totalAgents, config);

  // Accumulator: dimension → { issues, agentNames }
  const dimMap = new Map<
    IssueDimension,
    {
      issues: Array<{ agent: string; issue: ReviewIssue }>;
      agentNames: Set<string>;
    }
  >();

  const unclassified: Array<{ agent: string; issue: ReviewIssue }> = [];

  for (const [agentName, result] of Object.entries(allResults)) {
    if (!result.data) continue;
    const issues = result.data.issues as ReviewIssue[] | undefined;
    if (!Array.isArray(issues)) continue;

    for (const issue of issues) {
      // Only high-severity issues participate in corroboration
      if (issue.severity !== "high") continue;

      // Issues without dimension are unclassified — logged but cannot block
      if (!issue.dimension) {
        unclassified.push({ agent: agentName, issue });
        continue;
      }

      let group = dimMap.get(issue.dimension);
      if (!group) {
        group = { issues: [], agentNames: new Set() };
        dimMap.set(issue.dimension, group);
      }
      group.issues.push({ agent: agentName, issue });
      group.agentNames.add(agentName);
    }
  }

  // Warn about unclassified issues so they don't silently disappear
  if (unclassified.length > 0) {
    const agents = [...new Set(unclassified.map(u => u.agent))];
    process.stderr.write(
      `[corroboration] WARNING: ${unclassified.length} high-severity issue(s) from [${agents.join(", ")}] lack dimension classification and cannot participate in corroboration\n`,
    );
  }

  const blocking: CorroboratedGroup[] = [];
  const solo: SoloFinding[] = [];

  for (const [dimension, group] of dimMap) {
    const agentCount = group.agentNames.size;

    // Block when enough distinct agents independently flag this dimension
    if (agentCount >= threshold) {
      blocking.push({
        dimension,
        issues: group.issues,
        agentCount,
        threshold,
      });
    } else {
      solo.push({
        dimension,
        issues: group.issues,
        agentCount,
        threshold,
      });
    }
  }

  return {
    blocking,
    solo,
    unclassified,
    verdict: blocking.length > 0
      ? "fail"
      : solo.length > 0
        ? "warn"
        : "pass",
  };
}
