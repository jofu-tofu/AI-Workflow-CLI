# Handoff System

Comprehensive specification for the handoff workflow system.

## Overview

- **Purpose:** Capture session state for asynchronous handoff to next session
- **Philosophy:** Structured sections (dead-ends, pending, decisions, etc.) + executable restoration
- **When to use:** End of work session when context needs preservation
- **Runtime location:** `_output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/`

## Directory Structure

```
handoff-system/
├── CLAUDE.md           # This file — comprehensive spec
├── lib/                # Reusable modules
│   ├── handoff-reader.ts       # Read and parse handoff sections
│   └── document-generator.ts   # Generate handoff markdown (not currently imported)
├── scripts/            # CLI entry points
│   ├── save_handoff.ts         # Create handoff from stdin markdown
│   └── resume_handoff.ts       # Load handoff and format for restoration
└── workflows/          # Procedural documentation
    ├── handoff.md              # Creation workflow
    └── handoff-resume.md       # Restoration workflow
```

## Data Model & Schema

### Handoff Folder Structure

Runtime location: `_output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/`

**Files created:**
- `index.md` — Entry point with frontmatter
- `completed-work.md` — What was accomplished
- `dead-ends.md` — Failed approaches to avoid
- `decisions.md` — Key decisions made
- `pending.md` — Incomplete work items
- `context.md` — Background context
- `plan.md` — Optional, copied from context if plan exists

### HandoffSections Interface

```typescript
// From _shared/lib-ts/types.ts
interface HandoffSections {
  index: string;           // Entry point with frontmatter
  deadEnds: string | null; // Failed approaches to avoid
  pending: string | null;  // Incomplete work items
  plan: string | null;     // Copy of plan file if exists
  decisions: string | null; // Key decisions made
  completedWork: string | null; // What was accomplished
  context: string | null;  // Background context
}
```

**Why inline interfaces:** Makes CLAUDE.md self-contained — agents don't jump between files.

### Section Markers

Content parsed via HTML comments: `<!-- SECTION: name -->`

**Valid section names:**
- `CONTEXT`
- `COMPLETED_WORK`
- `DEAD_ENDS`
- `DECISIONS`
- `PENDING`
- `PLAN`

**Critical:** Markers must be HTML comments, not markdown headings. Parser searches for `<!-- SECTION: -->` format.

### Frontmatter Schema

YAML frontmatter in index.md:

```yaml
---
title: Handoff - {project_name}
date: {ISO timestamp}
session_id: {Claude session ID}
project: {context directory name}
plan_document: {path to plan file if exists}
---
```

## Lifecycle & Hook Integration

### Creation Flow (save_handoff.ts script)

**Trigger:** `/aiwcli-shared:handoff` command invokes script with stdin markdown

**Process:**
1. Parse frontmatter and section markers from stdin
2. Resolve context ID (5-tier resolution: `--context-id`, `--session-id`, frontmatter, `CLAUDE_SESSION_ID`, fallback to active)
3. Create timestamped folder: `_output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/`
4. Shard content into section files
5. Update state.json with handoff metadata

**State updates:**
- `handoff_path`: Set to `handoffs/{timestamp}/index.md` (relative to context folder)
- `work_consumed`: Set to `false` (enables staging)
- `next_artifact_type`: Set to `"handoff"` (explicit artifact tracking)
- **Latest-wins replacement:** If `plan_hash` exists, clear plan fields (`plan_path`, `plan_hash`, `plan_signature`)

**Context resolution tiers** (first match wins):
1. `--context-id` CLI arg
2. `--session-id` CLI arg (lookup via CLAUDE_SESSION_ID → context)
3. `session_id` in frontmatter (lookup via session → context)
4. `CLAUDE_SESSION_ID` env var (lookup via session → context)
5. Fallback: most recent active context

### Staging (session_end.ts hook)

**Trigger:** SessionEnd event

**Condition for staging:**
```typescript
if (state.handoff_path && !state.work_consumed) {
  state.mode = "has_staged_work";
  state.next_artifact_type = "handoff";
}
```

**Latest-wins detection:**
If `plan_hash` differs from `plan_hash_consumed`, new plan detected:
- Clear `handoff_path` (plan wins)
- Set `work_consumed = false`
- Set `next_artifact_type = "plan"`

**Unified staging mode:** `has_staged_work` replaces old `has_plan` and `has_handoff` modes (v0.13.0+).

### Restoration (session_start.ts hook)

**Trigger:** SessionStart event with `source = "clear"`

**Process:**
1. Find context with `mode = "has_staged_work"`
2. Dispatch by `next_artifact_type`:
   - If `"handoff"`: call `formatHandoffContinuation(ctx)`
   - If `"plan"`: inject plan content
3. Bind session to context
4. Transition `has_staged_work` → `active`
5. Set `work_consumed = true` (one-shot latch prevents re-staging)

**formatHandoffContinuation()** (from context-formatter.ts):
- Reads handoff sections via `readHandoffSections()`
- Assembles restoration context: dead-ends → pending → plan remaining → decisions → git delta → completed work
- Injects as system-reminder for Claude

### Fallback Matching (user_prompt_submit.ts hook)

**Trigger:** UserPromptSubmit when no staged work mode detected

**Process in determineContext():**
1. Filter contexts by `has_staged_work` mode
2. Separate by `determineArtifactType()`:
   - Plan artifacts: check `plan_hash` and `plan_path`
   - Handoff artifacts: check `handoff_path`
3. Try plan match first (content-based via plan hash)
4. Fall back to handoff match (first-match by recency)
5. Set `work_consumed = true` if match found

**determineArtifactType() utility:**
- Checks `next_artifact_type` field first (authoritative)
- Fallback: field detection (`plan_hash` + `plan_path` vs `handoff_path`)
- Logs warning if both plan and handoff fields exist (bug - violates latest-wins)

## Scripts

### save_handoff.ts

**Usage:**
```bash
bun .aiwcli/_shared/skills/handoff-system/scripts/save_handoff.ts [--context-id ID] [--session-id SID] < handoff.md
```

**Stdin format:**
```markdown
---
title: Handoff - Project Name
session_id: abc123
---

# Handoff Document

<!-- SECTION: CONTEXT -->
Context details here...

<!-- SECTION: PENDING -->
Pending items...
```

**Output:**
- Creates folder: `_output/contexts/{context_id}/handoffs/{YYYY-MM-DD-HHMM}/`
- Shards to files: `index.md`, `pending.md`, `dead-ends.md`, etc.
- Updates `state.json`: `handoff_path`, `work_consumed=false`, `next_artifact_type="handoff"`

**Collision handling:**
If timestamp folder exists, appends `-2`, `-3`, etc.

**State updates (latest-wins):**
- Sets handoff fields
- **Clears plan fields if they exist** (`plan_path`, `plan_hash`, `plan_signature` → null)

### resume_handoff.ts

**Usage:**
```bash
# Auto-discover from current session
bun .aiwcli/_shared/skills/handoff-system/scripts/resume_handoff.ts

# Explicit handoff path
bun .aiwcli/_shared/skills/handoff-system/scripts/resume_handoff.ts path/to/handoff/index.md

# Explicit context
bun .aiwcli/_shared/skills/handoff-system/scripts/resume_handoff.ts --context context-id
```

**Output format (to stdout):**
```markdown
# Handoff Restoration

## Dead Ends (Priority: Address First)
...

## Pending Items
...

## Plan Status
42% complete (5/12 tasks)

## Decisions Made
...

## Git Delta
Changed files since handoff...

## Completed Work
...

## Full Plan (Appendix)
...
```

**Features:**
- **Staleness warnings:** If handoff > 7 days old, warns in output
- **Plan progress:** Calculates % complete from plan anchors
- **Git delta:** Compares current git state to plan's git anchors
- **Priority ordering:** Dead-ends first, then pending, then context

**Auto-discovery:**
Uses `CLAUDE_SESSION_ID` env var → lookup context → find latest handoff in `handoffs/` folder.

## Library Modules

### handoff-reader.ts

**Location:** `_shared/skills/handoff-system/lib/handoff-reader.ts`

**Exports:**

```typescript
// Find most recent handoff in context
function findLatestHandoff(contextPath: string): string | null

// Read and parse handoff sections
function readHandoffSections(handoffPath: string): HandoffSections

// Extract timestamp from handoff path
function getHandoffTimestamp(handoffPath: string): Date | null

// Get plan reference from handoff frontmatter
function getHandoffPlanReference(handoffPath: string): string | null
```

**Section mapping:**
```typescript
const SECTION_FILES = {
  index: "index.md",
  deadEnds: "dead-ends.md",
  pending: "pending.md",
  plan: "plan.md",
  decisions: "decisions.md",
  completedWork: "completed-work.md",
  context: "context.md",
};
```

**Returns null for missing optional sections** (dead-ends, pending, etc.).

### document-generator.ts

**Location:** `_shared/skills/handoff-system/lib/document-generator.ts`

**Exports:**

```typescript
// Generate complete handoff markdown with sections
function generateHandoffDocument(options: HandoffOptions): string

// Section builders
function buildContextSection(ctx: ContextState): string
function buildCompletedWorkSection(history: WorkHistory): string
function buildDeadEndsSection(deadEnds: DeadEnd[]): string
// ... (other section builders)
```

**Used by:** `/aiwcli-shared:handoff` workflow to programmatically generate handoff content before piping to `save_handoff.ts`.

**Note:** Currently not imported by any files. Moved here for logical grouping and completeness.

## Skill Integration

**Thin pointer pattern:**

`.claude/plugins/aiwcli-shared/skills/handoff/SKILL.md` (user-facing, discoverable via `/`, `user-invocable: true`)
→ References `.aiwcli/_shared/skills/handoff-system/workflows/handoff.md` (detailed procedural steps)

**Benefits:**
- Skill files stay concise (easy to scan in `/` menu)
- Workflow files can expand without bloating command discovery
- Single source of truth for procedural details

**Example reference format:**
```markdown
See `.aiwcli/_shared/skills/handoff-system/workflows/handoff.md` for complete process documentation.
```

## Testing

**Integration test:**
`_shared/lib-ts/__tests__/integration/handoff-lifecycle.test.ts`

**Coverage:**
- Creation: active + handoff → session_end → has_staged_work
- Restoration: /clear → session_start → active + work_consumed=true
- One-shot latch: subsequent session_end does NOT re-stage (work_consumed=true)

**Hook execution test:**
```bash
echo '{"hook_event_name":"SessionStart","session_id":"test","source":"clear"}' | \
  bun .aiwcli/_shared/hooks-ts/session_start.ts
```

Expected: No import errors, clean execution.

## Migration Notes (v0.13.0+)

**Unified lifecycle:**
- Old modes `has_plan` and `has_handoff` → unified `has_staged_work`
- Old flags `plan_consumed` and `handoff_consumed` → unified `work_consumed`
- New field `next_artifact_type` (`"plan" | "handoff" | null`) for explicit artifact tracking

**Migration handled by migrateConsumedFlags()** in `state-io.ts`:
- Runs on every `state.json` read
- Transparently converts old modes to new structure
- Idempotent (safe to run multiple times)

**Latest-wins principle:**
- Only ONE artifact staged at a time
- New handoff clears plan fields
- New plan clears handoff_path
- Most recent creation wins

**Work consumed as one-shot latch:**
- Set to `true` when `has_staged_work` → `active` transition occurs
- Prevents `session_end` from re-staging same artifact
- Reset to `false` when new artifact created

## Plan-Specific Behaviors

**Critical: Auto-paste bypasses hooks.** After ExitPlanMode "clear context", Claude Code runs `/clear` and auto-pastes the plan content. This auto-paste is an internal mechanism that does NOT trigger UserPromptSubmit. The `session_start.ts` handler for `source=clear` bridges this gap.

**One plan per session assumption:** Plan review iteration state resets across sessions but NOT within a session. When a plan is rejected by reviewers and the user creates a new plan in the same session, the iteration state (agent graduation, pass streaks) persists. This allows the review framework to work correctly: rejection within a session means "fix and retry," not "start completely fresh." Only when starting a new planning session (new session ID) does iteration state reset to allow full fresh review.

**Rejection handling:** `archive_plan` archives the file on PermissionRequest (before accept/reject decision). If rejected, the archive exists but `session_end`'s fallback may assign plan_hash. This is acceptable — rejected plans with hash set don't cause harm because plan matching in context_selector requires content match.

**Two restore paths:**
- **source=clear** (plan/handoff acceptance): Plan auto-pasted by Claude Code (plans only). Hook injects task/git context and handoff content (dispatch by `next_artifact_type`).
- **source=compact** (auto-compaction): Plan NOT auto-pasted. Hook inlines plan content via `buildRestoreSections(inline_plan=True)`.

## Architecture Decisions

**Why folder sharding (not single file)?**
- Enables selective loading (resume script loads only needed sections)
- Allows future extensions (e.g., attachments, screenshots)
- Chronological discovery via timestamp folders

**Why section markers (not frontmatter)?**
- Flexible content generation (Claude outputs sections in natural flow)
- No strict ordering required (script extracts by marker)
- Easy to extend (add new sections without schema version bump)

**Why latest-wins (not dual artifact tracking)?**
- Simplifies state machine (one artifact, one mode transition)
- Prevents ambiguity (which artifact to restore?)
- Matches user mental model (most recent work is relevant)

**Why unified work_consumed flag?**
- Prevents infinite re-staging loop
- Simpler than per-artifact flags (plan_consumed, handoff_consumed)
- One-shot latch pattern is well-understood

## Gotchas

**Template sync is mandatory:**
Both `.aiwcli/_shared/skills/handoff-system/` (working copy) and `packages/cli/src/templates/_shared/skills/handoff-system/` (template source) must stay in sync per CLAUDE.md template sync rules.

**Import paths after move:**
- From `scripts/resume_handoff.ts` → `lib/handoff-reader.ts`: `../lib/handoff-reader.js`
- From `lib/handoff-reader.ts` → `lib-ts/base/constants.ts`: `../../lib-ts/base/constants.js`

**Hooks don't import handoff-reader:**
- `session_start.ts` uses `formatHandoffContinuation()` from `context-formatter.ts`
- `context-formatter.ts` reads `ctx.handoff_path` directly
- No direct handoff-reader dependency in hooks

**Command file script paths are absolute:**
- Reference from project root: `.aiwcli/_shared/skills/handoff-system/scripts/save_handoff.ts`
- NOT relative to command file location

**Section markers must be HTML comments:**
```markdown
<!-- SECTION: PENDING -->  ✅ Correct
# SECTION: PENDING        ❌ Incorrect (parsed as heading, not marker)
```

**Windsurf and Codex workflows also reference scripts:**
When updating script paths, check:
- `packages/cli/src/templates/_shared/.windsurf/workflows/handoff.md`
- `packages/cli/src/templates/_shared/.codex/workflows/handoff.md`
