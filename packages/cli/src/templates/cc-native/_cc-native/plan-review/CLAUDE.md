# Plan Review System

Multi-agent plan quality review pipeline triggered before plan approval. Runs structured reviewer agents, orchestrates scoring, and decides pass/deny.

## Overview

When a Claude Code agent exits plan mode (`ExitPlanMode`), the plan review hook intercepts and runs:
1. **Questions Gate** — runs PLAN-QUESTIONER agent to surface unclear requirements. If questions found, denies ExitPlanMode and injects questions as context.
2. **Review Pipeline** — runs 3-35 specialized reviewer agents in parallel, aggregates verdicts, optionally runs orchestrator for agent selection, and evaluates pass/deny.

## File Structure

```
plan-review/
├── CLAUDE.md            ← This file
├── CODING-STANDARDS-CHECKLIST.md ← Standards injected during plan mode via plan_questions_early.ts
├── agents/
│   ├── CLAUDE.md        ← Agent file format, frontmatter fields, selection rules
│   ├── PLAN-ORCHESTRATOR.md   ← Orchestrator agent (complexity analysis)
│   ├── plan-questions/
│   │   └── PLAN-QUESTIONER.md ← Questions gate agent
│   └── plan-review/     ← 31 reviewer agent spec files (*.md)
│       ├── ARCH-EVOLUTION.md
│       ├── ARCH-PATTERNS.md
│       └── ... (29 more)
├── lib/
│   ├── review-pipeline.ts   ← Main pipeline orchestrator
│   ├── agent-selection.ts   ← Mandatory agents, orchestrator-based selection
│   ├── corroboration.ts     ← Cross-agent agreement analysis
│   ├── graduation.ts        ← Pass eligibility, streak tracking
│   ├── orchestrator.ts      ← Complexity analyzer agent runner
│   ├── output-builder.ts    ← Context/block message construction
│   ├── plan-questions.ts    ← Questions gate agent runner
│   ├── verdict.ts           ← Verdict aggregation and decision
│   └── reviewers/
│       ├── index.ts         ← Barrel re-export
│       ├── agent.ts         ← AgentReviewer dispatch (Claude/Codex/Gemini)
│       ├── types.ts         ← Reviewer-local types
│       ├── schemas.ts       ← REVIEW_SCHEMA, ORCHESTRATOR_SCHEMA constants
│       ├── base/
│       │   └── base-agent.ts   ← Abstract CLI agent base class
│       └── providers/
│           ├── claude-agent.ts         ← Claude CLI reviewer
│           ├── codex-agent.ts          ← Codex CLI reviewer
│           ├── gemini-agent.ts         ← Gemini CLI reviewer (stub)
│           └── orchestrator-claude-agent.ts ← Claude orchestrator agent
└── workflows/
    └── specdev.md       ← specdev workflow doc (user-facing)
```

## Hooks

**Hooks are NOT co-located here.** Hooks are path-referenced in `.claude/settings.json` at install time. Moving a hook file requires settings.json updates in both `.aiwcli/` and `packages/cli/src/templates/`, which is high blast-radius and fragile. The co-location pattern applies to lib, agents, scripts, and workflows — NOT to Claude Code hooks.

Hooks that invoke this system (all in `../_cc-native/hooks/`):

| Hook | Event | Role |
|------|-------|------|
| `cc-native-plan-review.ts` | PreToolUse: ExitPlanMode | Main entry point — runs questions gate then review pipeline |
| `enhance_plan_post_subagent.ts` | PostToolUse: Task | Post-subagent plan enhancement |
| `enhance_plan_post_write.ts` | PostToolUse: Write | Post-write plan enhancement |
| `mark_questions_asked.ts` | PostToolUse: AskUserQuestion | Marks questions-asked state after user answers |
| `plan_questions_early.ts` | UserPromptSubmit | Injects Phase A clarification in plan mode |

## Public API (`lib/`)

| Module | Key Exports |
|--------|-------------|
| `review-pipeline.ts` | `runReviewPipeline(input)` — main entry point |
| `agent-selection.ts` | `resolveMandatoryAgents()`, `selectAgents()`, `assignModelsToAgents(agents, config, available?, options?)`, `resolveEnabledProviders()` (@internal). `assignModelsToAgents` accepts optional `{ isCliAvailable, randomFn }` for DI. |
| `corroboration.ts` | `computeCorroboratedDecision()` |
| `preflight.ts` | `runPreflight()`, `collectPreflightChecks()` (@internal), `buildPreflightReport()` (@internal), `KNOWN_PROVIDERS` |
| `graduation.ts` | `computePassEligible()`, `extractTopIssuesForTracker()`, `advanceIterationState()` |
| `orchestrator.ts` | `runOrchestrator()`, `buildOrchestratorSchema()` (re-exported) |
| `output-builder.ts` | `buildReviewOutput()`, `truncateAgentIssues()`, `overrideVerdictsByThreshold()` |
| `plan-questions.ts` | `runPlanQuestions()` |
| `verdict.ts` | `computeReviewDecision()`, `worstVerdict()` |
| `reviewers/index.ts` | `AgentReviewer`, `runAgentReview()` |

## Dependencies

**Reads from shared lib-ts (stays in lib-ts, not part of plan-review):**
- `_core/lib-ts/runtime/cli-args.ts` — centralized CLI arg construction (`buildCliInvocation`, `reviewSpec`, `preflightCommandConfig`). All provider agents and preflight delegate flag construction here.
- `../../lib-ts/types.ts` — all shared types (AgentConfig, ReviewerResult, etc.)
- `../../lib-ts/settings.ts` — config loading
- `../../lib-ts/plan-discovery.ts` — plan file discovery
- `../../lib-ts/state.ts` — iteration state persistence
- `../../lib-ts/cc-native-state.ts` — plan review / questions-asked state
- `../../lib-ts/debug.ts` — debug logging
- `../../lib-ts/aggregate-agents.ts` — agent file discovery (stays in lib-ts, see note)
- `../../lib-ts/cli-output-parser.ts` — CLI output parsing
- `../../lib-ts/json-parser.ts` — JSON coercion

**Reads from artifacts system:**
- `../../artifacts/lib/index.ts` — artifact writing and formatting
- `../../artifacts/lib/format.ts` — formatting functions

**Note on aggregate-agents.ts:** This file intentionally stays in lib-ts rather than plan-review/lib. Both `settings.ts` (shared infra) and `plan-questions.ts` (plan-review) import it. Moving it would create a backward dependency from lib-ts into plan-review.

## Flow: Questions Gate

```
ExitPlanMode
  └── cc-native-plan-review.ts (hook)
        └── runReviewPipeline()
              └── wasQuestionsAsked()? NO
                    └── runPlanQuestions() → PLAN-QUESTIONER agent
                          ├── questions found → emitContextAndBlock(questions)
                          └── no questions → mark asked, proceed to review
```

## Flow: Review Pipeline

```
runReviewPipeline()
  ├── discoverPlan() — find and hash plan file
  ├── loadSettings() + loadAgentLibrary() — config + 31 agent specs
  ├── isPlanAlreadyReviewed()? YES → skip (cached pass)
  ├── runOrchestrator() — optional complexity analysis + agent selection
  ├── resolveMandatoryAgents() → always-run agents
  ├── selectAgents() → orchestrator-selected agents
  ├── Promise.all() — parallel agent reviews (runAgentReview per agent)
  ├── computeCorroboratedDecision() — cross-agent agreement
  ├── computePassEligible() — graduation threshold check
  ├── buildReviewOutput() — context/block messages
  ├── writeCombinedArtifacts() — write review files to context dir
  └── emitContext() or emitContextAndBlock() — pass or deny
```

## Agent Files

Agent spec files live in `agents/plan-review/` (31 files) and `agents/plan-questions/` (1 file). Each is a markdown file with YAML frontmatter:

```markdown
---
id: ARCH-EVOLUTION
name: Architecture Evolution Reviewer
mandatory: false
model: claude-opus-4-5
weight: 1.0
---
[Agent system prompt here]
```

`mandatory: true` agents always run. `mandatory: false` agents are selected by the orchestrator based on plan complexity.

## Design Decisions

- **Thin hook, fat pipeline:** The hook is ~70 lines and delegates everything to `review-pipeline.ts`. This enables testing the pipeline without hook machinery.
- **Parallel reviews:** All selected agents run simultaneously via `Promise.all()`. Review time is bounded by the slowest agent, not total agents.
- **Questions gate first:** Questions must be asked before review. `wasQuestionsAsked()` prevents skipping the gate via repeated ExitPlanMode attempts.
- **Co-location:** Moved from scattered `lib-ts/`, `agents/`, and `workflows/` to `plan-review/` to follow the handoff system pattern. See root CLAUDE.md "System Co-location Pattern".
