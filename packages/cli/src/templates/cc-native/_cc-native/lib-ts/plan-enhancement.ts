/**
 * Plan quality guidance for context emission.
 *
 * Provides prompt text that guides the main agent to review plans before
 * presenting them to the user. Emitted via emitContext() — NOT appended to plan files.
 *
 * Used by both SubagentStop hook (Plan agents) and PostToolUse:Write hook (direct writes).
 */

/**
 * Returns the plan quality review prompt to emit as context after a plan is written.
 * This guides the main agent to review the plan before calling ExitPlanMode.
 *
 * Design principles:
 * - No hardcoded skill names — agent discovers relevant skills from system-reminders
 * - Documentation focuses on WHY (preserve decisions) not WHERE (file paths)
 * - Concise — every token in emitted context costs attention budget
 * - Trusts the agent's judgment — guidance, not mandate
 */
export function getPlanQualityReviewContext(): string {
  return `## Plan Quality Review

Before presenting this plan, review it from the perspective of an agent with zero conversation history.

### Self-Check
- File paths are absolute and verified (not "the auth file" or "as discussed")
- Function and class names are exact references (not "the handler" or "it")
- Each step is specific enough to execute without this conversation's context
- Verification steps are binary-testable (pass/fail in one check)

### Skills Integration
Review the skills listed in your system-reminder messages. Where a step would benefit from a specific skill, reference it inline (e.g., "Use \`SkillName\` skill for [specific purpose]"). Only reference skills relevant to this plan's domain.

### Documentation Reasoning
Evaluate whether the plan captures decisions that would be lost when this session ends. The implementation agent should understand:
- What was decided and why alternatives were rejected
- What constraints exist that aren't obvious from the code
- What would break if assumptions change

If the plan has gaps, address them before presenting to the user.`;
}
