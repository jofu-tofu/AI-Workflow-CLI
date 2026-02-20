# MetaPlan System

## Purpose

Codifies the "chain thinking skills together" workflow for complex problem-solving. Produces a comprehensive, reviewable plan before any implementation begins.

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
    meta-plan.md         ← Canonical workflow with full process and inlined thinking instructions
```

## Design Decisions

**Abstract categories with inlined instructions:** Each of the 7 thinking categories contains concrete, executable instructions baked into the workflow. This makes MetaPlan fully functional without any external skill system. Skills are system-agnostic — they work in any AI environment.

**No hardcoded skill names:** Skills come from whatever system is installed (PAI, or other). MetaPlan uses abstract category mappings (e.g., "adversarial/red-team skills") and discovers available skills at runtime. This is a cross-cutting convention: AIWCLI skills must never hardcode external skill names.

**Decision tree gates categories:** Not all 7 thinking categories are needed for every problem. The decision tree in Section 2 selects which categories to apply based on problem characteristics, avoiding unnecessary overhead for simpler problems.

**Inline is primary, discovery is enhancement:** The inline instructions ARE the skill. Runtime skill discovery is an optional enhancement layer that can substitute or augment specific categories. Zero discovered skills is the normal path, not a degraded path.

## Relationship to Plan Mode

MetaPlan output is captured automatically by plan mode (if active) or the project's context/notes system. No custom output file handling is needed.

## Hooks

None. MetaPlan is a pure workflow document — no hooks required.
