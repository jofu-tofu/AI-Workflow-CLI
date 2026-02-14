/**
 * Shared plan enhancement logic.
 * Appends Skills Reference, Quality Criteria, and Documentation Requirements
 * sections to plan files.
 *
 * Used by both SubagentStop hook (Plan agents) and PostToolUse:Write hook (direct writes).
 */

import { isPlanEnhancementApplied, markPlanEnhancementApplied } from "./cc-native-state.js";
import { atomicWrite } from "../../_shared/lib-ts/base/atomic-write.js";
import { logInfo } from "../../_shared/lib-ts/base/logger.js";
import * as fs from "fs";
import * as path from "path";

/**
 * Generate the three enhancement sections as a Record.
 */
export function generateEnhancements(): Record<string, string> {
  return {
    skills: `## Skills Reference

The implementation agent has access to specialized skills via system-reminder messages. Reference these inline in Steps/Verification sections where they add value:

- **TypeScript/React/CSharp** — Language-specific best practices and patterns
- **Browser** — UI verification, screenshots, accessibility testing
- **System** — Code integrity checks, documentation generation, git operations
- **AccessibleUI** — WCAG compliance validation

**Usage:** Mention skills at point of use (e.g., "Step 3: Verify UI — Use \`Browser\` skill to screenshot before/after")`,

    quality: `## Quality Criteria

**Before marking complete:**
- [ ] All file paths are absolute and verified to exist (not "the auth file")
- [ ] Function/class names are exact references (not "the handler" or "it")
- [ ] Test verification steps are concrete and binary-testable
- [ ] No dangling references to "above", "as discussed", or conversation context

**Self-check:** Could an agent with zero conversation history execute this plan?`,

    docs: `## Documentation Requirements

**Update after implementation:**

1. **CLAUDE.md** (nearest to changed code):
   - Architectural decisions and rejected alternatives
   - Non-obvious constraints (what breaks if X changes)
   - Workarounds with underlying issue context
   - Patterns that prevent future mistakes

2. **MEMORY.md** (\`~/.claude/projects/.../memory/\`):
   - Cross-session learnings (API quirks, silent failures, debugging patterns)
   - Include when: architectural decisions, non-obvious constraints
   - Omit when: routine changes (rename, format, dependency bump)

**Format:** \`## Topic\` / \`**Decision:**\` / \`**Rationale:**\``,
  };
}

/**
 * Enhance a plan file by appending missing sections.
 * Returns the number of sections added.
 * Idempotent: detects existing sections and skips them.
 */
export function enhancePlan(planPath: string): number {
  const original = fs.readFileSync(planPath, "utf-8");
  const sections = generateEnhancements();

  const additions: string[] = [];

  // Only append sections that aren't already present (idempotent)
  if (!original.includes("## Skills Reference")) {
    additions.push(sections.skills);
  }
  if (!original.includes("## Quality Criteria")) {
    additions.push(sections.quality);
  }
  if (!original.includes("## Documentation Requirements")) {
    additions.push(sections.docs);
  }

  if (additions.length === 0) {
    return 0; // All sections already present
  }

  // Append with visual separator
  const enhanced = original.trimEnd() + "\n\n---\n\n" + additions.join("\n\n");
  atomicWrite(planPath, enhanced);

  return additions.length;
}

/**
 * Main entry point: enhance plan if not already enhanced.
 * Checks state, calls enhancePlan, marks state as applied.
 * Returns { applied: boolean, reason: string }.
 */
export function enhancePlanIfNeeded(
  sessionId: string,
  planPath: string,
  projectRoot: string,
  hookName: string,
): { applied: boolean; reason: string } {
  // Normalize path to absolute
  const normalizedPath = path.normalize(path.resolve(planPath));

  // Check if this specific plan was already enhanced
  if (isPlanEnhancementApplied(sessionId, normalizedPath, projectRoot)) {
    return { applied: false, reason: "already enhanced this plan" };
  }

  // Enhance the plan
  const sectionCount = enhancePlan(normalizedPath);

  if (sectionCount === 0) {
    // Sections already present in file, but state didn't know
    markPlanEnhancementApplied(sessionId, normalizedPath, projectRoot, hookName);
    return { applied: false, reason: "sections already present in file" };
  }

  // Mark as enhanced in state
  markPlanEnhancementApplied(sessionId, normalizedPath, projectRoot, hookName);

  return { applied: true, reason: `added ${sectionCount} sections` };
}
