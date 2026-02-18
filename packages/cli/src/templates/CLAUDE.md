# Template Development Guidelines

## Output Directory

Write all method outputs to `_output/{method}/`:

```
_output/
├── gsd/.planning/    # GSD planning artifacts
├── bmad/docs/        # BMAD documentation
└── {method}/{subdir}/ # Other method outputs
```

Include `_output/{method}/` in template `.gitignore`.

---

## Directory Structure

Each template installs into `.aiwcli/` (method files) and `.{ide}/` (IDE integration). The `_shared/` template provides cross-method infrastructure used by all methods.

```
packages/cli/src/templates/
├── _shared/                          # Cross-method infrastructure (installed by all methods)
│   ├── hooks-ts/                     # Shared TypeScript hook scripts (context, tasks, sessions)
│   └── lib-ts/                       # Shared TypeScript libraries
│       ├── base/                     #   Core: atomic-write, constants, inference, utils
│       ├── context/                  #   Context CRUD, selection, formatting, plans, tasks
│       ├── handoff/                  #   Session handoff document generation
│       └── templates/                #   Output formatters, plan context templates
│
├── cc-native/                        # CC-Native method template
│   ├── _cc-native/                   #   Method-specific hooks, lib, agents, workflows, scripts
│   ├── .claude/                      #   Claude Code: settings.json, commands/, agents/
│   ├── .windsurf/                    #   Windsurf: workflows/
│   └── .gitignore
│
├── gsd/                              # GSD method template
│   ├── .aiwcli/_gsd/                 #   Templates, workflows, hooks, config, docs
│   ├── .claude/                      #   Claude Code: settings.json, commands/, agents/
│   ├── .windsurf/                    #   Windsurf: workflows/
│   ├── GSD-README.md
│   ├── TEMPLATE-SCHEMA.md
│   └── MIGRATION.md
│
├── bmad/                             # BMAD method template
│   ├── .aiwcli/_bmad/               #   Agents, workflows, teams, testarch, config
│   ├── .claude/                      #   Claude Code: settings.json, commands/
│   └── ...
│
├── planning-with-files/              # Planning-with-Files method template
│   ├── .claude/                      #   Claude Code: settings.json, skills/
│   ├── .windsurf/                    #   Windsurf: workflows/, scripts/
│   └── ...
│
└── CLAUDE.md                         # This file
```

### Tier Details

| Tier | Location | Purpose |
|------|----------|---------|
| Shared | `_shared/` | Cross-method hooks and libraries (context management, task tracking, sessions) |
| Method | `_{method}/` or `.aiwcli/_{method}/` | Method-specific templates, workflows, hooks, config |
| IDE | `.{ide}/` | IDE-specific command stubs, settings, workflow definitions |
| Config | `.{ide}/settings.json` | Hooks, model prefs, method settings (merged on install) |

---

## Settings Merge Rules

When multiple templates install, settings.json files merge:

**Hook merging** - Hooks combine by lifecycle event
**Method namespacing** - Use method name as top-level key: `"gsd": { ... }`

```json
{
  "gsd": { "planReview": { "enabled": true } },
  "bmad": { "agents": { "defaultModel": "claude-3-opus" } }
}
```

---

## Hooks

**Location:** Hooks live in `.aiwcli/_shared/hooks-ts/` (cross-method, TypeScript) and `.aiwcli/_{method}/hooks/` (method-specific). They are configured in `.{ide}/settings.json`, not placed in IDE directories.

**Configuration:**
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write",
      "hooks": [{ "type": "command", "command": "bun run .aiwcli/_cc-native/hooks/cc-native-plan-review.ts", "timeout": 300000 }]
    }]
  }
}
```

**Requirements:**
- Prefix method-specific hooks with method name (e.g., `cc-native-plan-review.ts`)
- Use relative paths from project root
- Write outputs to `_output/{method}/`
- Specify timeouts
- Set `blockOnFail: false` unless critical

---

## Workflow Pattern

### Canonical Workflow (`_{method}/workflows/`)

```markdown
# {Method} Workflow: {Name}

## Purpose
Brief description.

## Process
### Step 1: {Name}
Instructions.

## Output Files
All in `_output/{method}/{subdir}/`:
- `FILE.md` - Description

## Success Criteria
- [ ] Criterion 1
```

### IDE Stub (`.{ide}/{folder}/{method}/`)

```markdown
---
description: One-line for command palette
---
# {Workflow Name}
Load and execute `_{method}/workflows/{name}.md`.
```

---

## Reference Patterns

| Reference Type | Pattern |
|----------------|---------|
| Templates | `_{method}/templates/FILE.md.template` |
| Workflows (Claude) | `/gsd:workflow-name` (maps to `.claude/commands/gsd/workflow-name.md`) |
| Workflows (Windsurf) | `workflow-name` from method workflows |
| Outputs | `_output/{method}/{subdir}/FILE.md` |

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Method folder | `_{lowercase}` | `_gsd` |
| Template file | `UPPERCASE.md.template` | `PROJECT.md.template` |
| Workflow file | `kebab-case.md` | `new-project.md` |
| Output file | `UPPERCASE.md` | `PROJECT.md` |
| Hook file | `{method}-{name}.{ext}` | `gsd-plan-review.ts` |
| Settings key | `{method}` | `"gsd": {}` |
| Readme | `{METHOD}-README.md` | `GSD-README.md` |

---

## Checklists

**New Template:**
- [ ] Create `_{method}/` with `templates/` and `workflows/`
- [ ] Create `.claude/commands/{method}/` stubs (Claude Code)
- [ ] Create `.windsurf/workflows/{method}/` stubs (Windsurf)
- [ ] Add `.gitignore` with `_output/{method}/`
- [ ] Create `{METHOD}-README.md`, `TEMPLATE-SCHEMA.md`, `MIGRATION.md`
- [ ] Configure method-namespaced settings in `.claude/settings.json`

**New Workflow:**
- [ ] Create canonical in `_{method}/workflows/{name}.md`
- [ ] Create stubs in `.claude/commands/{method}/` and `.windsurf/workflows/{method}/`
- [ ] Update README and TEMPLATE-SCHEMA.md

---

## Practices

**Do:**
- Write outputs to `_output/{method}/`
- Namespace settings under method key
- Prefix hooks with method name
- Keep canonical workflows in `_{method}/workflows/`
- Use relative paths from project root
- Document changes in TEMPLATE-SCHEMA.md
- Place hooks in `.aiwcli/` directories, wire them in `.{ide}/settings.json`

**Avoid:**
- Outputs in project root
- Generic settings keys that conflict
- Hooks without method prefix
- Full workflows in IDE command files
- Hardcoded paths without method namespace
- Putting hook scripts directly in IDE directories (`.claude/hooks/`)
- Creating `_shared/` directories inside method templates (e.g., `cc-native/_shared/`). All shared code lives in `packages/cli/src/templates/_shared/`. Method templates reference shared code via imports at runtime, not by copying.

---

## System Co-location Pattern

Cohesive subsystems are organized as self-contained folders, following the handoff system model. Each system folder lives at the `_shared/` or `_cc-native/` level and contains:

```
{system-name}/
├── CLAUDE.md       ← Spec: lifecycle, API reference, design decisions, gotchas
├── lib/            ← TypeScript implementation (imported by hooks and other systems)
├── agents/         ← Agent spec .md files used by this system (if any)
├── scripts/        ← Standalone entry points invoked independently (if any)
└── workflows/      ← User-facing procedural workflow docs (if any)
```

**Existing systems following this pattern:**
- `_shared/handoff-system/` — handoff creation and restoration
- `_cc-native/plan-review/` — multi-agent plan review pipeline
- `_cc-native/artifacts/` — review artifact generation and tracking
- `_cc-native/lib-ts/rlm/` — retrieval-augmented learning memory

**Hooks are NOT co-located with their owning system.**
Claude Code hooks are path-referenced in `.claude/settings.json` at install time.
Moving a hook file requires settings.json updates — high blast-radius, fragile.
Hooks live in `_shared/hooks-ts/` or `_cc-native/hooks/`. Each system's CLAUDE.md
lists the hooks that invoke it under a "Hooks" section.
