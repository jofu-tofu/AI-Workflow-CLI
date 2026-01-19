# GSD Workflow: Research Phase

## Purpose

Conduct standalone research for a phase before or during planning. Spawns research agents to investigate technical unknowns, gather best practices, and document findings.

## Use Cases

- Pre-planning research when technical approach is unclear
- Mid-execution research when blockers arise
- Technology evaluation for future phases
- Documentation lookup for unfamiliar APIs

## Process

### Step 1: Define Research Scope

1. Identify the phase or topic
2. List specific questions to answer
3. Define success criteria for research

```markdown
## Research Request

**Phase:** {N} (or "General")
**Topic:** {What to research}

**Questions:**
1. {Specific question 1}
2. {Specific question 2}
3. {Specific question 3}

**Success Criteria:**
- [ ] {What we need to know to proceed}
```

### Step 2: Spawn Research Agents

For each research area, spawn focused agent:

```xml
<research-agent>
  <focus>{Specific area}</focus>
  <questions>{Questions for this agent}</questions>
  <sources>
    - Codebase analysis
    - External documentation
    - Best practices
  </sources>
  <output>
    Structured findings for RESEARCH.md
  </output>
</research-agent>
```

### Step 3: Gather Findings

Agents investigate and return:
- Relevant code patterns found
- External documentation references
- Recommended approaches
- Risks and trade-offs
- Code examples

### Step 4: Update RESEARCH.md

Create or update `_output/gsd/.planning/RESEARCH.md`:

```markdown
## Phase {N} Research

### Research Summary
**Date:** {Date}
**Scope:** {What was researched}

### Findings

#### {Topic 1}
- **Source:** {Where found}
- **Key Insight:** {What we learned}
- **Application:** {How to use it}

#### {Topic 2}
...

### Recommendations
{Summary of recommended approach}

### Risks
{Identified risks and mitigations}
```

### Step 5: Present to User

Show research summary and ask for validation:
- Does this answer your questions?
- Any additional research needed?
- Ready to proceed with planning?

## Output

- `_output/gsd/.planning/RESEARCH.md` - Research findings

## Success Criteria

- [ ] Questions answered with evidence
- [ ] Sources documented
- [ ] Risks identified
- [ ] User validates findings
