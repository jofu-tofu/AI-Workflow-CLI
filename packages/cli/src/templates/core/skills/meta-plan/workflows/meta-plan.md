# MetaPlan — Prompt Amplifier

> **Trigger:** "meta-plan", "chain reasoning", "dissect problem", "help me figure out the right approach"

## Reference Material

- `.aiwcli/_core/skills/meta-plan/CLAUDE.md` — MetaPlan system spec: purpose, design decisions, constraints

---

## Why MetaPlan Exists

For complex problems, a raw prompt produces a shallow plan. MetaPlan amplifies the prompt — analyzing the request through multiple reasoning lenses so a next session can build a thorough, well-informed plan from the enriched output.

**Your job in this session:** Take the user's request, analyze it deeply, and produce an amplified prompt document. Do not produce the plan itself. Do not produce implementation steps, task lists, or code. Those are the next session's job.

**What you produce:** An "Amplified Request" document containing: problem decomposition, approach landscape with trade-offs, risk assessment, domain context, recommended direction, and open questions. This document becomes the input for a planning session.

**If you find yourself writing "Step 1: install X" or "Task: create Y" — stop.** You have left analysis and entered planning. Return to the reasoning level.

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

## Action Bias

Default to analysis and reasoning. Gather information, develop competing perspectives, and synthesize recommendations. Do not jump to implementation or produce action items.

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

After completing the decomposition, **re-read the original prompt in full** and explicitly list unknown information not captured in the 5 categories above. This prevents silent information loss.

Output one of:
- A numbered list of missed information items (then incorporate them into the appropriate category)
- "None — all information captured" (only if genuinely everything is accounted for)

### Problem Classification

Classify the problem along these dimensions to guide which analysis categories to apply:

| Dimension | Assessment |
|-----------|-----------|
| **Ambiguity level** | How many valid interpretations exist? (Low: 1-2, Medium: 3-5, High: 5+) |
| **Solution space size** | How many viable approaches exist? (Small: 1-2, Medium: 3-5, Large: 5+) |
| **Domain familiarity** | How well-understood is the problem domain? (Familiar / Partially familiar / Unfamiliar) |
| **Stakeholder count** | How many perspectives must be considered? (Single / Few / Many) |

---

## Section 2 — Category Selection Decision Tree

Based on the characteristics from Section 1, select which analysis categories to apply and in what order. **Not all categories are required for every problem** — the decision tree gates which lenses to apply, not just ordering.

| Problem Profile | Categories to Apply | Rationale |
|----------------|-------------------|-----------|
| High ambiguity, unknown domain | 1 → 2 → 3 → 7 (Decomposition → Divergent → Convergent → Integration) | Explore broadly before narrowing |
| Large solution space, familiar domain | 1 → 2 → 4 → 5 → 7 (Decomposition → Divergent → Adversarial → Trade-off → Integration) | Stress-test candidates |
| Unfamiliar domain, unknown ambiguity | 1 → 6 → 2 → 3 → 7 (Decomposition → Expert Synthesis → Divergent → Convergent → Integration) | Research before ideation |
| Multi-stakeholder, moderate ambiguity | 1 → 6 → 5 → 4 → 7 (Decomposition → Expert Synthesis → Trade-off → Adversarial → Integration) | Gather perspectives, evaluate trade-offs |
| Low ambiguity, small solution space | 1 → 4 → 7 (Decomposition → Adversarial → Integration) | Quick path: decompose, stress-test, synthesize |
| Multiple valid approaches, familiar domain | 1 → 2 → 5 → 4 → 7 (Decomposition → Divergent → Trade-off → Adversarial → Integration) | Compare, evaluate, stress-test |

Numbers reference the 7 categories in Section 3.

**If no profile matches exactly:** Select the closest match, or combine elements. When in doubt, use the full sequence: 1 → 2 → 3 → 4 → 5 → 6 → 7.

---

## Section 3 — The 7 Analysis Categories

Each category is a **reasoning lens** — a structured way to examine the problem from a specific angle. Apply each selected category to deepen understanding of the user's request. External skills discovered at runtime (see Section 4) can enhance unknown category but are never required.

### Category 1: Decomposition

Break the problem into its constituent parts to understand its structure.

**Apply this lens:**
- List every distinct sub-problem, constraint, and dependency
- Identify which sub-problems are independent vs. coupled
- For each sub-problem, state what "resolved" looks like in one sentence
- Map dependencies: which questions must be answered before others become clear

**Output:** Problem structure map — numbered sub-problems with dependency relationships and resolution criteria.

---

### Category 2: Divergent Exploration

Generate multiple distinct approaches — prioritize breadth over depth.

**Apply this lens:**
- For each sub-problem (or the whole problem if atomic), brainstorm 3-5 fundamentally different approaches
- Each approach must differ in architecture, not just parameters (e.g., "use a queue" vs "use polling" vs "use webhooks" — not "poll every 5s" vs "poll every 10s")
- Name each approach with a descriptive 3-5 word label
- For each, note 1-2 key strengths and 1-2 key weaknesses

**Output:** Approach landscape — table of approaches per sub-problem with strengths and weaknesses that reveal the shape of the solution space.

---

### Category 3: Convergent Analysis

Narrow from many candidates to 1-3 finalists using structured evaluation.

**Apply this lens:**
- Define 3-5 evaluation criteria relevant to this problem (e.g., complexity, performance, maintainability, risk, time-to-implement)
- Score each approach against each criterion (High / Medium / Low)
- Identify deal-breakers: unknown approach that fails a critical criterion is eliminated with stated reason
- Rank surviving approaches

**Output:** Evaluation matrix — scores, eliminations with reasoning, and shortlist of 1-3 surviving approaches.

---

### Category 4: Adversarial Challenge

Stress-test the leading approach(es) by actively trying to break them.

**Apply this lens:**
- "What is the strongest argument against this approach?"
- "Under what conditions does this approach fail catastrophically?"
- "What is the most likely way this approach produces a subtly wrong result?"
- "If I had to argue for a completely different approach, what would I say?"
- For each identified weakness: propose a concrete mitigation, or acknowledge the risk with conditions under which it becomes critical

**Output:** Vulnerability assessment — challenges identified with mitigations or explicitly accepted risks and their trigger conditions.

---

### Category 5: Trade-off Evaluation

Compare surviving approaches with explicit acknowledgment of what each choice costs.

**Apply this lens:**
- For each pair of finalist approaches, state what you gain and what you lose by choosing one over the other
- Identify irreversible decisions (hard to change later) vs. reversible ones (can switch cheaply)
- State the conditions under which you would switch from the recommended approach to an alternative
- Flag unknown "one-way door" decisions that deserve extra scrutiny

**Output:** Trade-off map — gain/lose analysis with switching conditions and irreversibility flags.

---

### Category 6: Expert Synthesis

Surface domain-specific knowledge relevant to the problem.

**Apply this lens:**
- What established patterns, best practices, or prior art exist for this type of problem?
- What domain-specific constraints or conventions apply that a non-expert might miss?
- What are the known failure modes or anti-patterns in this domain?
- What would a domain expert check first?

*Note: If external research tools or skills are available, use them to augment this category.*

**Output:** Domain knowledge summary — patterns, constraints, and failure modes with explicit relevance to the current problem.

---

### Category 7: Integration

Synthesize all analysis into the amplified prompt document.

**Apply this lens:**
- State the recommended approach with rationale referencing evidence from prior categories
- List trade-offs explicitly acknowledged (from Category 5)
- List risks explicitly accepted with mitigations (from Category 4)
- Apply domain knowledge as validation (from Category 6, if used)
- Identify what remains uncertain and what the planning session should investigate further

**Output:** This category produces the final Amplified Request document (see Section 6 for format).

---

## Section 4 — Skill Discovery (Optional)

Scan available skills in the current environment. Classify each as:
- **Analysis enhancer** — maps to a specific reasoning category (e.g., red-team skill → Category 4)
- **Domain relevant** — informs understanding of the problem space

If zero skills are discovered, proceed with inline instructions. This is the normal path.

Output a brief inventory table only if skills were found.

---

## Section 5 — Analysis Chain

Apply the categories selected by the decision tree (Section 2), in the specified order.

**Rules:**
- Feed each category's output forward as context for subsequent categories
- Accumulate all outputs in a running analysis
- If a category's output reveals new information that changes earlier conclusions, note the update explicitly (e.g., "Category 4 revealed X, which changes the Category 2 assessment of approach Y")
- Do not skip a selected category — if the decision tree selected it, apply it

---

## Section 6 — Amplified Request Document

Category 7 (Integration) produces the final deliverable. This IS the output of MetaPlan — an amplified version of the user's original request, enriched with all the analysis. A fresh session can consume this document and immediately begin building a thorough plan.

### Output Format

Structure the amplified request as follows:

```
## Amplified Request: [Problem Title]

### Original Request
[User's original prompt, quoted verbatim]

### Problem Structure
[Sub-problems identified, dependencies mapped, resolution criteria stated]

### Approaches Explored
[For each approach: name, strengths, weaknesses, evaluation score]
[Eliminated approaches with stated reason]

### Domain Context
[Relevant patterns, best practices, failure modes from expert synthesis]
[Skip if Category 6 was not applied]

### Recommendation
**Approach:** [Name of recommended approach]
**Rationale:** [Evidence from analysis categories — why this over alternatives]
**Trade-offs accepted:** [What this choice costs, stated explicitly]

### Risks
[Vulnerabilities identified with mitigations or accepted risk conditions]

### Open Questions for Planning Session
[Uncertainties that could not be resolved with available information]
[Assumptions the planning session should validate before committing]
[Areas where further investigation would strengthen the recommendation]
```

### Analysis Inventory

After the amplified request, append an inventory of which categories were applied:

```
## Analysis Inventory
| Category | Applied | Key Insight |
|----------|---------|-------------|
| 1: Decomposition | Yes/No | [What this lens revealed] |
| 2: Divergent Exploration | Yes/No | [What this lens revealed] |
| 3: Convergent Analysis | Yes/No | [What this lens revealed, or why skipped] |
| 4: Adversarial Challenge | Yes/No | [What this lens revealed] |
| 5: Trade-off Evaluation | Yes/No | [What this lens revealed] |
| 6: Expert Synthesis | Yes/No | [What this lens revealed] |
| 7: Integration | Yes | [Synthesized into amplified request above] |
```

