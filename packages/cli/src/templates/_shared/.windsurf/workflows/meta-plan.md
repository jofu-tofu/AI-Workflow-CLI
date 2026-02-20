# MetaPlan Workflow

> **Trigger:** "meta-plan", "chain thinking", "dissect problem", "comprehensive plan", "help me figure out the right approach"

## Reference Material

- `../CLAUDE.md` — MetaPlan system spec: purpose, design decisions, constraints

---

A workflow for complex problems where choosing the right approach is harder than implementing it. Chains thinking categories together to produce a comprehensive, reviewable plan before any implementation begins.

## When to Use

- Problems with high ambiguity or large solution spaces
- Multiple valid approaches where the trade-offs are unclear
- Unfamiliar domains requiring structured exploration before commitment
- Multi-stakeholder problems needing multiple perspectives
- Any situation where "version 1" quality matters and rework is expensive

## When NOT to Use

- The solution is already known — just implement it
- Simple, well-scoped tasks with obvious approaches
- Trivial fixes, typos, or configuration changes

---

## Section 1 — Intent Preservation (First-Principles Decomposition)

Decompose the user's prompt into 5 categories. **Preserve all information** from the original prompt — no summarizing, no condensing, no abbreviating. Quote verbatim where possible.

### The 5 Decomposition Categories

1. **Explicit wants** — what they directly asked for, quoted verbatim where possible
2. **Implied wants** — what they expect but didn't state (inferred from context, domain norms, prior work)
3. **Explicit constraints** — stated limitations, requirements, boundaries, deadlines
4. **Implied constraints** — assumed limitations from context, domain norms, technical environment, prior decisions
5. **Anti-wants** — what they explicitly or implicitly don't want (stated rejections, implied aversions, things to avoid)

### Information Loss Check

After completing the decomposition, **re-read the original prompt in full** and explicitly list any information not captured in the 5 categories above. This prevents silent information loss.

Output one of:
- A numbered list of missed information items (then incorporate them into the appropriate category)
- "None — all information captured" (only if genuinely everything is accounted for)

### Problem Classification

Classify the problem along these dimensions to guide which thinking categories to apply:

| Dimension | Assessment |
|-----------|-----------|
| **Ambiguity level** | How many valid interpretations exist? (Low: 1-2, Medium: 3-5, High: 5+) |
| **Solution space size** | How many viable approaches exist? (Small: 1-2, Medium: 3-5, Large: 5+) |
| **Domain familiarity** | How well-understood is the problem domain? (Familiar / Partially familiar / Unfamiliar) |
| **Stakeholder count** | How many perspectives must be considered? (Single / Few / Many) |

---

## Section 2 — Problem Classification Decision Tree

Based on the characteristics from Section 1, select which thinking categories to apply and in what order. **Not all categories are required for every problem** — the decision tree gates execution, not just ordering.

| Problem Profile | Categories to Apply | Rationale |
|----------------|-------------------|-----------|
| High ambiguity, any domain | 1 → 2 → 3 → 7 (Decomposition → Divergent → Convergent → Integration) | Must explore broadly before narrowing |
| Large solution space, familiar domain | 1 → 2 → 4 → 5 → 7 (Decomposition → Divergent → Adversarial → Trade-off → Integration) | Need to stress-test candidates |
| Unfamiliar domain, any ambiguity | 1 → 6 → 2 → 3 → 7 (Decomposition → Expert Synthesis → Divergent → Convergent → Integration) | Research before ideation |
| Multi-stakeholder, moderate ambiguity | 1 → 6 → 5 → 4 → 7 (Decomposition → Expert Synthesis → Trade-off → Adversarial → Integration) | Gather perspectives, evaluate trade-offs |
| Low ambiguity, small solution space | 1 → 4 → 7 (Decomposition → Adversarial → Integration) | Quick path: decompose, stress-test, synthesize |
| Multiple valid approaches, familiar domain | 1 → 2 → 5 → 4 → 7 (Decomposition → Divergent → Trade-off → Adversarial → Integration) | Compare, evaluate, stress-test |

Numbers reference the 7 categories in Section 3.

**If no profile matches exactly:** Select the closest match, or combine elements. When in doubt, use the full sequence: 1 → 2 → 3 → 4 → 5 → 6 → 7.

---

## Section 3 — The 7 Thinking Categories

Each category has concrete instructions to execute directly. External skills discovered at runtime (see Section 4) can enhance any category but are never required.

### Category 1: Decomposition

Break the complex problem into atomic sub-problems that can be addressed independently.

**Instructions:**
- List every distinct sub-problem, constraint, and dependency
- Identify which sub-problems are independent (parallelizable) vs. sequential (dependent)
- For each sub-problem, state what "solved" looks like in one sentence
- Map dependencies: which sub-problems must be solved before others can start

**Output:** Numbered list of sub-problems with dependency relationships noted.

---

### Category 2: Divergent Ideation

Generate multiple distinct solution candidates — prioritize breadth over depth.

**Instructions:**
- For each sub-problem (or the whole problem if atomic), brainstorm 3-5 fundamentally different approaches
- Each approach must differ in architecture, not just parameters (e.g., "use a queue" vs "use polling" vs "use webhooks" — not "poll every 5s" vs "poll every 10s")
- Name each approach with a descriptive 3-5 word label
- For each, list 1-2 key strengths and 1-2 key weaknesses in brief

**Output:** Table of approaches per sub-problem, each with a label, strengths, and weaknesses.

---

### Category 3: Convergent Analysis

Narrow from many candidates to 1-3 finalists using structured evaluation.

**Instructions:**
- Define 3-5 evaluation criteria relevant to this problem (e.g., complexity, performance, maintainability, risk, time-to-implement)
- Score each approach against each criterion (High / Medium / Low)
- Identify deal-breakers: any approach that fails a critical criterion is eliminated with stated reason
- Rank surviving approaches

**Output:** Evaluation matrix with scores, eliminations noted, and shortlist of 1-3 surviving approaches.

---

### Category 4: Adversarial Challenge

Stress-test the leading approach(es) by actively trying to break them.

**Instructions:**
- Answer each question for the leading approach:
  - "What is the strongest argument against this approach?"
  - "Under what conditions does this approach fail catastrophically?"
  - "What is the most likely way this approach produces a subtly wrong result?"
  - "If I had to argue for a completely different approach, what would I say?"
- For each identified weakness, either:
  - Propose a concrete mitigation, or
  - Acknowledge the risk explicitly with conditions under which it becomes critical

**Output:** List of challenges with mitigations or acknowledged risks.

---

### Category 5: Trade-off Evaluation

Compare surviving approaches on key dimensions with explicit trade-off acknowledgment.

**Instructions:**
- For each pair of finalist approaches, state what you gain and what you lose by choosing one over the other
- Identify irreversible decisions (hard to change later) vs. reversible ones (can switch cheaply)
- State the conditions under which you would switch from the recommended approach to an alternative
- Flag any "one-way door" decisions that deserve extra scrutiny

**Output:** Trade-off matrix with gain/lose analysis and switching conditions.

---

### Category 6: Expert Synthesis

Gather domain-specific knowledge relevant to the problem.

**Instructions:**
- What established patterns, best practices, or prior art exist for this type of problem?
- What domain-specific constraints or conventions apply that a non-expert might miss?
- What are the known failure modes or anti-patterns in this domain?
- What would a domain expert check first?

*Note: This category operates on available knowledge. If external research tools or skills are available in the environment, use them to augment this category.*

**Output:** Domain knowledge summary with explicit relevance to the current problem.

---

### Category 7: Integration

Combine all thinking outputs into a coherent, actionable plan.

**Instructions:**
- State the recommended approach with rationale referencing evidence from prior categories
- List trade-offs explicitly acknowledged (from Category 5)
- List risks explicitly accepted with mitigations (from Category 4)
- Apply domain knowledge as validation (from Category 6, if used)
- Define concrete next steps with enough detail to begin execution immediately

**Output:** Structured plan document containing:
- Problem decomposition results
- Approaches considered with trade-offs
- Recommended approach with rationale
- Risk assessment with mitigations
- Domain context applied (if Category 6 was used)
- Actionable next steps
- Execution Manifest (from Section 4)

---

## Section 4 — Runtime Skill Discovery (Two-Pass)

Before executing the thinking chain, scan for ALL available skills and commands in the current environment. Skills serve two distinct roles in MetaPlan — they can enhance the *thinking* process and/or become steps in the *execution* plan.

### Discovery Protocol

**Pass 1 — Enumerate:** Scan all available skills, commands, and workflows in the current environment (skill registries, help commands, workflow directories). For each, read its description or summary.

**Pass 2 — Classify:** Place each discovered skill into one or both categories:

**Thinking Skills** — enhance one of the 7 thinking categories during the MetaPlan process itself:
- Decomposition-related skills → Category 1
- Ideation/creativity skills → Category 2
- Analysis/evaluation skills → Category 3
- Adversarial/red-team skills → Category 4
- Comparison/trade-off skills → Category 5
- Research/domain-knowledge skills → Category 6
- Synthesis/integration skills → Category 7

**Auxiliary Skills** — relevant to *executing* the recommended solution, not to thinking about it:
- Domain-specific tools (coding standards, linting, formatting, testing frameworks)
- Content processing (PDF extraction, image generation, data transformation)
- Research and information gathering (web search, content analysis)
- Communication and output (presentation, documentation, knowledge management)
- Automation and infrastructure (browser automation, deployment, CI/CD)
- Any skill that the person executing the plan would benefit from knowing about

A single skill can appear in both lists — e.g., a research skill might enhance Category 6 (Expert Synthesis) during thinking AND be a standalone step in the execution plan.

### If Zero Skills Are Discovered

Proceed with inline instructions only. This is the **normal path**, not a degraded path. The inline instructions in Section 3 are complete and self-contained, and the plan output uses generic step descriptions instead of skill-specific invocations.

### Skill Inventory (Required Output)

After discovery, output the classified inventory:

```
## Skill Inventory

### Thinking Skills (enhance MetaPlan categories)
| Skill | Maps To | Role |
|-------|---------|------|
| [name] | Category N | Enhances/replaces inline instructions |

### Auxiliary Skills (available for execution plan)
| Skill | Domain | Potential Use |
|-------|--------|---------------|
| [name] | [domain] | [how it helps execute the solution] |

### Unclassified
| Skill | Reason |
|-------|--------|
| [name] | Not relevant to this problem |
```

---

## Section 5 — Chain Execution

Execute the thinking categories selected by the decision tree (Section 2), in the specified order.

**Rules:**
- Feed each category's output forward as context for subsequent categories
- Accumulate all outputs in a running document
- If a category's output reveals new information that changes earlier conclusions, note the update explicitly (e.g., "Category 4 revealed X, which changes the Category 2 assessment of approach Y")
- Do not skip a selected category — if the decision tree selected it, execute it

---

## Section 6 — Plan Synthesis

The Integration category (Category 7) produces the final plan. This is the primary deliverable of MetaPlan — a **sequential, step-by-step execution plan** that a new session can follow mechanically.

The plan captures in plan mode or the project's context/notes system automatically. No special output file handling is needed.

### Part A — Analysis Summary

Summarize the thinking work that informed the plan:

1. **Problem decomposition** — sub-problems identified and dependency-mapped (Category 1)
2. **Solution landscape** — approaches considered with strengths and weaknesses (Category 2)
3. **Evaluation** — how approaches were narrowed, what was eliminated and why (Category 3, if used)
4. **Risk assessment** — stress-test results with mitigations or accepted risks (Category 4)
5. **Trade-off analysis** — what is gained and lost with the recommended approach (Category 5, if used)
6. **Domain context** — relevant patterns, practices, and failure modes applied (Category 6, if used)
7. **Recommended approach** — clear statement with rationale referencing evidence above

### Part B — Sequential Execution Plan (Skill Chain)

The core deliverable. A numbered sequence of steps that interleaves thinking categories and auxiliary skills into a single executable chain. Each step specifies exactly what to do, so a new session can follow it without additional context.

**Step format:**

```
### Step N: [Action description]
- **Invoke:** [Skill name, thinking category, or "manual" for inline work]
- **Input:** [What to feed this step — output from a prior step, user context, or specific files]
- **Expected output:** [What this step produces — be specific enough to verify completion]
- **Feeds into:** Step M [or "Final output"]
```

**Branching format** (when a step's output determines the next path):

```
### Step N: [Decision point description]
- **Invoke:** [Skill or category]
- **Input:** [What to evaluate]
- **Branch:**
  - IF [condition A] → proceed to Step M
  - IF [condition B] → proceed to Step P
  - ELSE → proceed to Step Q
```

**Overlay format** (when a thinking category and auxiliary skill run together):

```
### Step N: [Combined action description]
- **Invoke:** [Thinking category] + [Auxiliary skill]
- **Role of thinking category:** [What the category contributes — e.g., adversarial pressure]
- **Role of auxiliary skill:** [What the skill contributes — e.g., domain standards to test against]
- **Input:** [Combined input context]
- **Expected output:** [Combined output]
```

**Rules for building the chain:**
- Every step must have a clear input and output — no dangling steps
- Thinking categories from Section 3 and auxiliary skills from Section 4 can freely interleave
- A single step can overlay a thinking category with one or more auxiliary skills when they naturally combine
- Branching logic uses IF/ELSE based on concrete, observable conditions from the prior step's output
- The chain must be followable by a session with zero prior context — include enough detail in each step
- If no auxiliary skills were discovered, the chain uses thinking categories and manual inline steps only

### Part C — Skill Inventory

Include the full Skill Inventory from Section 4 so the executing session knows what tools are available.

### Part D — Execution Manifest

After completing the thinking chain, output a summary showing what ran and how:

```
## Execution Manifest
| Step | Type | Skill/Category Used | Method |
|------|------|---------------------|--------|
| 1 | Thinking | Category 1: Decomposition | Inline |
| 2 | Auxiliary | [discovered skill name] | Skill invocation |
| 3 | Thinking + Auxiliary | Category 4 + [skill name] | Overlay |
| 4 | Branch | — | IF/ELSE on Step 3 output |
| ... | ... | ... | ... |
```
