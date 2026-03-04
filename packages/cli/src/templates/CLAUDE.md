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

Template source lives under `src/templates/`. At install time, `_shared/` is copied into `.aiwcli/_core/` and used as the runtime base. Method templates add method-owned files (for example `.aiwcli/_cc-native/*`) and IDE-specific stubs.

```
packages/cli/src/templates/
├── _shared/                          # Core runtime source (installed as .aiwcli/_core)
│   ├── hooks-ts/                     # Shared TypeScript hook scripts (context, tasks, sessions)
│   └── lib-ts/                       # Shared TypeScript libraries
│       ├── runtime/                  #   Core runtime helpers
│       ├── context/                  #   Context CRUD, selection, formatting, plans, tasks
│       ├── hooks/                    #   Hook utility APIs
│       ├── agent-exec/               #   Agent execution backends
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
| Core Source | `_shared/` | Source for runtime payload copied into `.aiwcli/_core/` |
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

**Location:** Runtime hooks live in `.aiwcli/_core/hooks-ts/` (cross-method, TypeScript) and optional method hooks in `.aiwcli/_{method}/hooks/`. Template source paths remain under `_shared/` and `_{method}/` and are wired via reconstructed `.{ide}/settings.json`.

**Configuration:**
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write",
      "hooks": [{ "type": "command", "command": "bun ~/.aiwcli/bin/resolve-run.ts .aiwcli/_core/hooks-ts/lint_after_edit.ts", "timeout": 10000 }]
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

Cohesive subsystems are organized as self-contained folders. In source they live under `_shared/` or method folders; at runtime, `_shared` subsystems execute from `.aiwcli/_core/*`.

```
{system-name}/
├── CLAUDE.md       ← Spec: lifecycle, API reference, design decisions, gotchas
├── lib/            ← TypeScript implementation (imported by hooks and other systems)
├── agents/         ← Agent spec .md files used by this system (if present)
├── scripts/        ← Standalone entry points invoked independently (if present)
└── workflows/      ← User-facing procedural workflow docs (if present)
```

**Existing systems following this pattern:**
- `_shared/skills/handoff-system/` — handoff creation and restoration
- `_shared/skills/codex/` — Codex launch + watch integration
- `_shared/skills/meta-plan/` — prompt amplification workflow
- `cc-native/_cc-native/plan-review/` — method-specific plan review pipeline
- `cc-native/_cc-native/artifacts/` — method-specific review artifacts
- `cc-native/_cc-native/lib-ts/rlm/` — method-specific retrieval memory

**Hooks are NOT co-located with their owning system.**
Claude Code hooks are path-referenced in `.claude/settings.json` at install time.
Moving a hook file requires settings.json updates — high blast-radius, fragile.
Core hooks live in `_shared/hooks-ts/` source (installed to `.aiwcli/_core/hooks-ts/`), and method hooks live in method folders (for example `cc-native/_cc-native/hooks/`). Each system's CLAUDE.md
lists the hooks that invoke it under a "Hooks" section.

