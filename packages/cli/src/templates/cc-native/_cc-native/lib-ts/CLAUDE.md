# CC-Native Library

**Location:** `_cc-native/lib-ts/` — TypeScript modules for plan review, state, and agent orchestration.

**Import direction:** `hooks/` → `lib-ts/` → `_shared/lib-ts/`. Never the reverse.

---

## Module Reference

The barrel `index.ts` re-exports most modules. Three files are **not** re-exported and must be imported directly: `plan-discovery.ts`, `plan-enhancement.ts`, `settings.ts`.

| File | Purpose | Key Exports |
|------|---------|-------------|
| `aggregate-agents.ts` | Agent frontmatter parser — loads agent configs from markdown | `aggregateAgents`, `extractBody`, `extractFrontmatter` |
| `cc-native-state.ts` | CC-native state accessor for context `state.json` | `getCcNativeState`, `saveCcNativeState`, `isPlanAlreadyReviewed`, `markPlanReviewed`, `markQuestionsAsked` |
| `cli-output-parser.ts` | Unified Claude CLI JSON output parser | `parseCliOutput` |
| `config.ts` | Configuration loading from `cc-native.config.json` | `loadConfig`, `getDisplaySettings` |
| `constants.ts` | Feature flags, security limits, path validation | `ENABLE_ROBUST_PLAN_WRITES`, `PLANS_DIR`, `validatePlanPath`, `MAX_RETRY_ATTEMPTS` |
| `debug.ts` | Per-context debug logging (thin layer over shared logger) | `debugLog`, `debugRaw`, `getDebugDir`, `cleanupDebugFolder` |
| `index.ts` | Barrel — re-exports public API from all modules | (see individual modules) |
| `json-parser.ts` | JSON parsing with recovery for LLM responses | `parseJsonMaybe`, `coerceToReview` |
| `plan-discovery.ts` | Plan file discovery, reading, and hashing | *(not re-exported)* — import directly |
| `plan-enhancement.ts` | Plan quality guidance prompt for context emission | *(not re-exported)* — import directly |
| `settings.ts` | Settings loading, defaults, agent library management | *(not re-exported)* — import directly |
| `state.ts` | Iteration state management for plan review cycles | `loadState`, `saveStateToPlan`, `getIterationState`, `shouldContinueIterating` |
| `types.ts` | All cc-native type definitions and prompt constants | `Verdict`, `ReviewData`, `AgentConfig`, `PlanReviewConfig`, `REVIEW_SCHEMA` |

**Subfolder:** `rlm/` — retrieval-augmented learning memory. Has its own `rlm/CLAUDE.md`.

---

## Shared Dependencies

These `_shared/lib-ts` modules are used across cc-native lib-ts:

| Shared Module | Used By |
|--------------|---------|
| `base/logger` | All modules (logging) |
| `base/atomic-write` | `state.ts` (crash-safe writes) |
| `base/utils` | `cc-native-state.ts` (`nowIso`) |
| `context/context-store` | `cc-native-state.ts` (state access) |
| `context/plan-manager` | `plan-discovery.ts` (plan path lookup) |
| `types` | `types.ts` (re-exports `ContextState`, `HookInput`, `HookOutput`) |

---

## Import Direction

```
hooks/                    (entry points — import from lib-ts/ and _shared/)
  ↓
lib-ts/                   (this directory — import from _shared/ only)
  ↓
_shared/lib-ts/           (cross-method infrastructure — no reverse imports)
```

Never import from `hooks/` or `plan-review/` into `lib-ts/`. The one exception noted in `aggregate-agents.ts`: it stays in `lib-ts/` because both `settings.ts` and `plan-review/` depend on it.

---

## Context Maintenance

**After modifying files in this directory:** scan the entries above — if unknown claim is now
false or incomplete, update this file before ending the task. Do not defer.

**Staleness anchor:** This file assumes `index.ts` exists with 13 sibling `.ts` files. If the
count changes, update the Module Reference table.

<!-- context-layer: generated=2026-03-01 | last-audited=2026-03-01 | version=1 | dir-commits-at-audit=15 -->

