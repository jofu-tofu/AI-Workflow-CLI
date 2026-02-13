/**
 * Corroboration-based verdict computation for plan review.
 *
 * Replaces the old per-verdict aggregation with proportional thresholding:
 * high-severity issues in a dimension only block when the total count
 * exceeds 2× the number of distinct agents contributing to that dimension.
 *
 * **Why proportional thresholding:**
 * The agent pool has dimensional imbalance (e.g., 10 completeness agents vs
 * 1 maintainability agent). A fixed "2+ agents agree = block" would mean
 * any 2 completeness agents always block. Proportional scaling (issues > 2×agents)
 * sets a fair bar regardless of how many agents focus on each dimension.
 *
 * **Convergence problem this solves:**
 * Agents with opposing philosophies (simplicity-guardian vs completeness-gaps)
 * produce contradictory high-severity issues. Because the old system treated
 * every agent's finding as independently authoritative, plans oscillated —
 * addressing one agent's feedback triggered the opposing agent.
 *
 * **Revert path:** Change one line in cc-native-plan-review.ts back to
 * `computeReviewDecision(allVerdicts)`. Old function kept in verdict.ts.
 */

import type {
  ReviewerResult,
  ReviewIssue,
  IssueDimension,
  CorroborationResult,
  CorroboratedGroup,
  SoloFinding,
} from "./types.js";

/**
 * Compute a corroboration-based review decision from all reviewer results.
 *
 * Algorithm:
 * 1. Collect all high-severity issues with a `dimension` field
 * 2. Group by dimension, tracking distinct agent names per group
 * 3. For each dimension: block if `issues.length > 2 × agentCount`
 * 4. Issues without `dimension` are unclassified (never block)
 * 5. Non-high issues are ignored (informational only)
 *
 * @param allResults - Map of reviewer name → ReviewerResult (CLI + agent)
 * @returns CorroborationResult with blocking groups, solo findings, and verdict
 */
export function computeCorroboratedDecision(
  allResults: Record<string, ReviewerResult>,
): CorroborationResult {
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

      // Issues without dimension are unclassified — cannot block
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

  const blocking: CorroboratedGroup[] = [];
  const solo: SoloFinding[] = [];

  for (const [dimension, group] of dimMap) {
    const agentCount = group.agentNames.size;
    const threshold = 2 * agentCount;

    if (group.issues.length > threshold) {
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
    verdict: blocking.length > 0 ? "fail" : "pass",
  };
}
