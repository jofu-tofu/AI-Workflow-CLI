# Artifacts System

Review artifact generation, formatting, and file I/O for the plan review pipeline.

## Overview

The artifacts system handles all output files produced by plan review runs: combined markdown reports, JSON results, inline summaries, corroboration reports, and the review tracker. It is a pure library — no hooks or scripts.

## File Structure

```
artifacts/
├── CLAUDE.md        ← This file
└── lib/
    ├── index.ts     ← Barrel re-export of all public API
    ├── format.ts    ← Pure formatting functions (markdown, JSON, summaries)
    ├── write.ts     ← File I/O: atomic writes to context reviews dir
    └── tracker.ts   ← Review tracker: read/write/hash extraction
```

## Public API (`lib/index.ts`)

| Function | Source | Purpose |
|----------|--------|---------|
| `formatReviewMarkdown` | format.ts | Format single agent review as markdown |
| `formatCombinedMarkdown` | format.ts | Format all agent reviews into combined markdown |
| `buildInlineReviewSummary` | format.ts | Short inline summary for context injection |
| `extractTopIssuesText` | format.ts | Extract top issues as text block |
| `buildHighIssuesDocument` | format.ts | Full high-issues document for context |
| `buildCorroborationReport` | format.ts | Corroboration analysis markdown report |
| `generateReviewIndex` | format.ts | Index markdown linking all review files |
| `buildCombinedJson` | format.ts | Combined JSON artifact for all reviews |
| `writeCombinedArtifacts` | write.ts | Write all artifacts to context reviews dir |
| `writeFile` | write.ts | Atomic file write |
| `writeFileNonCritical` | write.ts | Non-atomic file write (non-critical paths) |
| `writeReviewTracker` | tracker.ts | Write review tracker JSON to disk |
| `extractPreviousHashes` | tracker.ts | Read previous plan hashes from tracker |
| `ReviewTrackerEntry` | tracker.ts | Type: single tracker entry |

## Dependencies

- `../../lib-ts/types.ts` — `CombinedReviewResult`, `CorroborationResult` types
- `../../lib-ts/constants.ts` — `ENABLE_ROBUST_PLAN_WRITES` feature flag
- `../../../_shared/lib-ts/base/atomic-write.ts` — atomic file I/O
- `../../../_shared/lib-ts/base/constants.ts` — `sanitizeFilename`
- `../../../_shared/lib-ts/base/logger.ts` — logging

## Hooks

Hooks for this system are NOT co-located here. Hooks are path-referenced in `.claude/settings.json` at install time. Moving a hook file requires settings.json updates in both `.aiwcli/` and `packages/cli/src/templates/`, which is high blast-radius and fragile.

The artifacts system is invoked indirectly through the plan review pipeline — it has no dedicated hooks. See `../_cc-native/hooks/` for the plan review hooks that drive this system.

## Callers

- `../plan-review/lib/review-pipeline.ts` — primary caller, writes all review artifacts
- `../../lib-ts/index.ts` — re-exports public API surface

## Design Decisions

- **Pure library:** No global state, no side effects except file I/O in write.ts/tracker.ts
- **Atomic writes:** `write.ts` uses atomic writes (write to temp + rename) for critical review files when `ENABLE_ROBUST_PLAN_WRITES` is set, preventing partial writes on crash
- **format.ts is pure:** All formatting is pure functions — takes data, returns strings. No file I/O.
- **Co-location:** Moved from `lib-ts/artifacts/` to `artifacts/lib/` to give the system peer-level status alongside `plan-review/` and `rlm/`
