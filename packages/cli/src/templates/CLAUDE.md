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

```
packages/cli/src/templates/{method}/
├── _{method}/              # Method-specific shared files
│   ├── templates/*.md.template
│   └── workflows/*.md      # Canonical workflow definitions
├── .{ide}/{ide-folder}/{method}/*.md  # IDE command stubs
├── .gitignore              # Output ignore rules
├── {METHOD}-README.md      # User documentation
├── TEMPLATE-SCHEMA.md      # Schema reference
└── MIGRATION.md            # Breaking changes
```

### Tier Details

| Tier | Location | Purpose |
|------|----------|---------|
| General | `_{method}/` | IDE-agnostic templates and canonical workflows |
| IDE | `.{ide}/{folder}/{method}/` | Lightweight stubs that load canonical workflows |
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

**Location:** `.claude/hooks/{method}-{hook-name}.{ext}`

**Configuration:**
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write",
      "hooks": [{ "type": "command", "command": "python .claude/hooks/gsd-plan-review.py", "timeout": 300000 }]
    }]
  }
}
```

**Requirements:**
- Prefix with method name (e.g., `gsd-plan-review.py`)
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
| Workflows (Claude) | `/gsd:other-workflow` |
| Workflows (Windsurf) | `other-workflow` from GSD workflows |
| Outputs | `_output/{method}/{subdir}/FILE.md` |

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Method folder | `_{lowercase}` | `_gsd` |
| Template file | `UPPERCASE.md.template` | `PROJECT.md.template` |
| Workflow file | `kebab-case.md` | `new-project.md` |
| Output file | `UPPERCASE.md` | `PROJECT.md` |
| Hook file | `{method}-{name}.{ext}` | `gsd-plan-review.py` |
| Settings key | `{method}` | `"gsd": {}` |
| Readme | `{METHOD}-README.md` | `GSD-README.md` |

---

## Checklists

**New Template:**
- [ ] Create `_{method}/` with `templates/` and `workflows/`
- [ ] Create `.claude/commands/{method}/` stubs
- [ ] Create `.windsurf/workflows/{method}/` stubs
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

**Avoid:**
- Outputs in project root
- Generic settings keys that conflict
- Hooks without method prefix
- Full workflows in IDE command files
- Hardcoded paths without method namespace
