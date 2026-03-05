# CC-Native Method

**Location:** `.aiwcli/_cc-native/` — Claude Code-specific plan review, artifacts, and agent orchestration.

---

## Subsystems

| Directory | Purpose | CLAUDE.md |
|-----------|---------|-----------|
| `agents/` | Plan review agent roster and specs | `agents/CLAUDE.md` |
| `artifacts/` | Review artifact generation and tracking | `artifacts/CLAUDE.md` |
| `hooks/` | CC-native hook entry points (plan review triggers) | `hooks/CLAUDE.md` |
| `lib-ts/` | Shared TypeScript library for cc-native subsystems | `lib-ts/CLAUDE.md` |
| `lib-ts/rlm/` | Retrieval-augmented learning memory | `lib-ts/rlm/CLAUDE.md` |
| `plan-review/` | Multi-agent plan review pipeline | `plan-review/CLAUDE.md` |

---

## Shared Infrastructure (`_core/lib-ts/`)

CC-native code depends heavily on shared infrastructure. Full API details: `_core/lib-ts/CLAUDE.md`.

| Module | Capability | Use When |
|--------|-----------|----------|
| `base/hook-utils` | Hook lifecycle (load input, run, emit context) | Writing hooks |
| `base/logger` | Structured logging (debug/info/warn/error) | Any hook or lib module |
| `base/constants` | Project paths, context dirs, sanitization | Resolving file locations |
| `base/subprocess-utils` | Find executables, exec with env, shell quoting | Spawning agent CLIs |
| `base/cli-args` | CLI invocation builder, review spec construction | Launching review agents |
| `base/atomic-write` | Crash-safe file writes | Writing state or artifacts |
| `base/state-io` | State read/write helpers | Context state persistence |
| `base/inference` | Claude CLI subprocess calls | AI inference from hooks |
| `context/context-store` | Context CRUD (get by session, list all) | Session/context binding |
| `context/plan-manager` | Plan lifecycle (archive, hash, sign) | Plan discovery and hashing |
| `types` | Shared type definitions (`ContextState`, etc.) | Type imports |

---

## Import Patterns

**Import direction:** `hooks/` → `lib-ts/` → `_core/lib-ts/`. Never the reverse.

```typescript
// From hooks/ (2 levels up to _core):
import { runHook, logInfo } from "../../_core/lib-ts/base/hook-utils.js";
import { loadConfig } from "../lib-ts/config.js";

// From lib-ts/ (2 levels up to _core):
import { logDebug } from "../../_core/lib-ts/base/logger.js";
import { atomicWrite } from "../../_core/lib-ts/base/atomic-write.js";

// From plan-review/lib/ (3 levels up to _core):
import { logInfo } from "../../../_core/lib-ts/base/logger.js";
```

---

## Context Maintenance

**After modifying files in this directory:** scan the entries above — if unknown claim is now
false or incomplete, update this file before ending the task. Do not defer.

**Add** an entry only if an agent would fail without knowing it, it is not obvious from
the code, and it belongs at this scope.

**Remove** unknown entry that fails the falsifiability test: if removing it would not change
how an agent acts here, remove it.

**Staleness anchor:** This file assumes `lib-ts/index.ts` exists. If it doesn't, this file
is stale — update or regenerate before relying on it.

<!-- context-layer: generated=2026-03-01 | last-audited=2026-03-01 | version=1 | dir-commits-at-audit=15 -->

