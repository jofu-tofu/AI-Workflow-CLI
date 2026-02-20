---
name: meta-plan
description: Structured problem-solving workflow that chains thinking categories to produce comprehensive plans. USE WHEN complex problem OR large solution space OR high ambiguity OR multiple approaches OR choosing solution is harder than implementing OR need comprehensive plan OR meta-plan OR dissect problem OR chain thinking.
user-invocable: true
---

# MetaPlan

Structured problem-solving workflow that chains thinking categories (decomposition, divergent ideation, convergent analysis, adversarial challenge, trade-off evaluation, expert synthesis, integration) to produce comprehensive plans for complex problems where choosing the right approach is harder than implementing it.

## Workflow Routing

When a workflow is matched, **read its file and follow the steps within it.**

| Workflow | Trigger | File |
|----------|---------|------|
| **MetaPlan** | "meta-plan", "chain thinking", "dissect problem", "comprehensive plan for complex problem" | `.aiwcli/_shared/skills/meta-plan/workflows/meta-plan.md` |

## Examples

**Example 1: Complex architecture decision**
```
User: "I need to add real-time updates to our app — not sure if we should use WebSockets, SSE, or polling"
-> Invokes MetaPlan workflow
-> Decomposes requirements, generates 3+ approaches, evaluates trade-offs, stress-tests leading option
-> Produces structured plan with recommended approach, risk assessment, and actionable next steps
```

**Example 2: Unfamiliar domain problem**
```
User: "/meta-plan — We need to implement end-to-end encryption for our messaging feature"
-> Invokes MetaPlan workflow
-> Runs expert synthesis first (domain research), then divergent ideation, convergent analysis
-> Produces plan grounded in domain best practices with approaches compared
```

**Example 3: Multi-stakeholder trade-off**
```
User: "Help me figure out the right approach for migrating our monolith to microservices"
-> Invokes MetaPlan workflow
-> Decision tree selects: Decomposition → Expert Synthesis → Trade-off → Adversarial → Integration
-> Produces plan with explicit trade-offs, irreversible decisions flagged, and switching conditions
```
