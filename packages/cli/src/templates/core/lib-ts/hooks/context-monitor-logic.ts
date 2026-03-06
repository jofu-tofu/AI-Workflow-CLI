export const CONTEXT_WARNING_30 = "## Context Window: ~30% Remaining\n\n" +
  "This session is approaching its context limit. Consider:\n\n" +
  "- Completing your current task, then pausing for the user to decide next steps\n" +
  "- If significant work remains, mention that `/aiwcli-shared:handoff` can capture progress " +
  "for a fresh session\n\n" +
  "Do not rush or cut corners — finish the current task properly. " +
  "Just be aware that starting large new tasks may not complete before context runs out.";

export const CONTEXT_WARNING_15 = "## Context Window: ~15% Remaining — Wrap Up Now\n\n" +
  "Context is critically low. After completing your current step:\n\n" +
  "1. **Stop taking on new work**\n" +
  "2. Summarize what was accomplished and what remains\n" +
  "3. Offer to run `/aiwcli-shared:handoff` so progress transfers to a fresh session\n\n" +
  "Do not start new multi-step tasks. Focus on clean closure.";

const WARNING_THRESHOLDS = [
  { pct: 15, msg: CONTEXT_WARNING_15 },
  { pct: 30, msg: CONTEXT_WARNING_30 },
];

export function selectWarningMessage(
  pctRemaining: number,
  alreadyFired: number[],
): { pct: number; msg: string } | null {
  for (const warning of WARNING_THRESHOLDS) {
    if (pctRemaining <= warning.pct && !alreadyFired.includes(warning.pct)) {
      return warning;
    }
  }

  return null;
}
