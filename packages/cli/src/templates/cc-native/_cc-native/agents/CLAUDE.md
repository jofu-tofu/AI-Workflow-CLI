# CC-Native Plan Review Agents

Agent persona definitions for single-turn plan review. 31 agents total: 4 mandatory + 27 selectable (organized into 7 variation families + 7 standalone).

## Agent Roster (31 agents)

### Mandatory (4) — always run
| Agent | Focus |
|-------|-------|
| `handoff-readiness` | Fresh context execution test |
| `clarity-auditor` | Communication clarity |
| `skeptic` | Problem-solution alignment, first-principles |
| `documentation-philosophy` | Knowledge capture (medium+ only) |

### Risk Family (4 variations)
| Agent | Framework | Categories |
|-------|-----------|------------|
| `risk-premortem` | Pre-mortem (Klein 2007) — assumes failure, generates narratives | all |
| `risk-fmea` | FMEA — per-step severity×likelihood×detectability | code, infra, design |
| `risk-dependency` | Blast radius / dependency graph — maps cascading chains | code, infra |
| `risk-reversibility` | One-way doors / optionality — classifies decision reversibility | all |

### Completeness Family (3 variations)
| Agent | Framework | Categories |
|-------|-----------|------------|
| `completeness-gaps` | Structural gap analysis — missing steps, error paths, pre/post-conditions | all |
| `completeness-feasibility` | Feasibility — resource gaps, expertise, timeline realism | all |
| `completeness-ordering` | Critical path / topological sort — step ordering, parallelization | code, infra, design |

### Architecture Family (3 variations)
| Agent | Framework | Categories |
|-------|-----------|------------|
| `arch-structure` | Coupling/cohesion — boundary placement, dependency direction | code, infra, design |
| `arch-evolution` | Evolutionary architecture — change amplification, extension points | code, infra, design |
| `arch-patterns` | Pattern selection — technology fit, pattern-forcing detection | code, infra |

### Verification Family (2 variations)
| Agent | Framework | Categories |
|-------|-----------|------------|
| `verify-coverage` | Coverage mapping — 1:1 implementation-to-verification | all |
| `verify-strength` | Mutation testing — would tests catch subtle bugs? | code, infra |

### Trade-off Family (2 variations)
| Agent | Framework | Categories |
|-------|-----------|------------|
| `tradeoff-costs` | Opportunity cost — hidden costs, capability sacrifice | all |
| `tradeoff-stakeholders` | Stakeholder impact — who wins, who loses, asymmetry | all |

### Design Family (2 variations)
| Agent | Framework | Categories |
|-------|-----------|------------|
| `design-adr-validator` | ADR structure — Context, Decision, Consequences, alternatives analysis | design, code, infra |
| `design-scale-matcher` | Scale matching — design depth proportional to blast radius | design, code, infra |

### TestDriven Family (4 variations)
| Agent | Framework | Categories |
|-------|-----------|------------|
| `testdriven-first-validator` | FIRST principles — Fast, Independent, Repeatable, Self-validating, Thorough | code, infra |
| `testdriven-behavior-auditor` | Behavior contracts — tests verify WHAT not HOW | code, infra |
| `testdriven-pyramid-analyzer` | Test pyramid — balanced distribution, fast feedback at base | code, infra |
| `testdriven-characterization` | Characterization tests — safety nets before code modification | code, infra |

### Standalone Agents (7)
| Agent | Focus | Categories |
|-------|-------|------------|
| `scope-boundary` | Scope drift detection | all |
| `hidden-complexity` | Understated difficulty, "just" statements | all |
| `simplicity-guardian` | Over-engineering, YAGNI | all |
| `devils-advocate` | Contrarian, reductio ad absurdum | all |
| `assumption-tracer` | Stacked assumption chains | all |
| `incremental-delivery` | Vertical slicing, smaller increments | all |
| `constraint-validator` | Constraint satisfaction | all |

## Design: Variation Families

Each family covers the same topic area but through different analytical lenses. Same output format, different analytical identity. This follows the RedTeam pattern (32 agents with unique personalities on the same concern). The orchestrator selects the most relevant variation(s) per family based on plan context.

## System Prompt vs Agent Flag

**Decision:** Use `--system-prompt` with markdown body content instead of `--agent <name>`

**Rationale:**
- Claude Code's `--agent` flag invokes built-in agents designed for multi-turn agentic workflows with tool access
- Plan review needs single-turn text analysis: read plan, output structured JSON
- The `--agent` flag ignores our custom markdown content entirely - it loads Claude Code's built-in agent definitions
- Using `--system-prompt` lets us inject the full persona (expertise, review approach, output requirements) directly
- Result: faster execution, no tool overhead, and our rich agent descriptions actually get used

**Constraint:** If you switch back to `--agent`, the elaborate persona content in these markdown files will be ignored. The reviews will use Claude Code's generic agent behavior instead of our specialized reviewers.

## File Structure

Each agent file has:
- **Frontmatter (YAML):** name, model, focus, categories, enabled
- **Body (Markdown):** Full persona content → becomes `system_prompt` for `--system-prompt` flag

## --setting-sources "" Requirement

**Decision:** Use `--setting-sources ""` to disable user/project settings loading

**Rationale:**
- Without this flag, Claude Code loads user settings (~43k cached tokens of PAI context)
- The PAI Algorithm instructions override the agent's system prompt behavior
- Model tries to follow PAI format instead of calling StructuredOutput directly
- Result: 6+ turns, 30+ seconds, often no structured output

**Constraint:** If you remove `--setting-sources ""`, agent reviews will be slow and unreliable due to PAI context interference.

## --max-turns 3 Requirement

**Decision:** Use `--max-turns 3` with agent invocations

**Rationale:**
- `--max-turns 1` is too restrictive - the model needs turn 1 to call StructuredOutput, turn 2 for the tool result
- `--max-turns 2` works but leaves no buffer for edge cases
- `--max-turns 3` gives safety margin while still preventing runaway multi-turn behavior
- With these settings, reviews complete in ~5-10 seconds

**Constraint:** The agent markdown files MUST contain clear instructions to "call StructuredOutput IMMEDIATELY" and "do NOT use any other tools". Without these instructions, the model will try to use its turns for file operations instead of outputting the review.

## enabled: false Convention

**Decision:** Set `enabled: false` in frontmatter for all plan review agents

**Rationale:** The `enabled` field controls Claude Code's auto-suggestion feature (showing agents in command palette). For plan review agents, we don't want them appearing as general-purpose agents - they're invoked programmatically by the hook. Setting `enabled: false` hides them from auto-suggestion while still allowing the hook to use them.

**Constraint:** Don't set `enabled: true` unless you want the agent to appear in Claude Code's agent picker for general use.
