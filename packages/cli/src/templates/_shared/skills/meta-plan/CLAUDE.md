# MetaPlan System

## Purpose

Prompt amplifier for complex problems. Takes a user's request, analyzes it through multiple reasoning lenses, and produces an enriched "Amplified Request" document that a next session can use to build a thorough plan. This session does the hard reasoning work so the planning session starts informed.

## When to Use

- Complex problems where choosing the solution is harder than implementing it
- Large solution spaces, high ambiguity, or multiple stakeholders
- Problems where "version 1" quality matters and rework is expensive

## When NOT to Use

- Simple, well-scoped tasks with obvious approaches
- Tasks where the solution is already known
- Trivial fixes or configuration changes

## Directory Structure

```
meta-plan/
  CLAUDE.md              ← This file (system spec)
  workflows/
    meta-plan.md         ← Canonical workflow with analysis categories and output format
```

## Design Decisions

**Reasoning lenses, not action steps:** Each of the 7 analysis categories is a lens for examining the problem from a specific angle. They contain concrete instructions for deepening understanding, not for producing implementation steps. This makes MetaPlan fully functional without unknown external skill system. Skills are system-agnostic — they work in unknown AI environment.

**Prompt amplification model:** MetaPlan's output is an "Amplified Request" — the original prompt enriched with decomposition, approach analysis, trade-offs, risks, and a recommended direction. This becomes the input for a planning session, not the plan itself.

**No hardcoded skill names:** Skills come from whatever system is installed (PAI, or other). MetaPlan uses abstract category mappings (e.g., "adversarial/red-team skills") and discovers available skills at runtime. This is a cross-cutting convention: AIWCLI skills must never hardcode external skill names.

**Decision tree gates categories:** Not all 7 categories are needed for every problem. The decision tree selects which to apply based on problem characteristics, avoiding unnecessary overhead for simpler problems.

**Inline is primary, discovery is enhancement:** The inline instructions ARE the skill. Runtime skill discovery is an optional enhancement layer. Zero discovered skills is the normal path, not a degraded path.

## Relationship to Plan Mode

MetaPlan output (the Amplified Request) is captured automatically by plan mode (if active) or the project's context/notes system. A fresh session then consumes this output to create the actual plan.

## Hooks

None. MetaPlan is a pure workflow document — no hooks required.

