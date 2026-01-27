# GSD Templates

Reference for all template files used by GSD to generate documentation.

---

## Template Location

All templates are stored in:

```
_gsd/templates/
```

---

## Template Overview

| Template | Output File | Used By |
|----------|-------------|---------|
| `PROJECT.md.template` | `PROJECT.md` | `new-project` |
| `REQUIREMENTS.md.template` | `REQUIREMENTS.md` | `new-project` |
| `ROADMAP.md.template` | `ROADMAP.md` | `new-project` |
| `STATE.md.template` | `STATE.md` | `new-project` |
| `CONTEXT.md.template` | `CONTEXT.md` | `discuss-phase` |
| `RESEARCH.md.template` | `RESEARCH.md` | `research-phase` |
| `PLAN.md.template` | `PLAN-phase-{N}.md` | `plan-phase` |
| `SUMMARY.md.template` | `SUMMARY.md` | `execute-phase` |
| `ISSUES.md.template` | `ISSUES.md` | `new-project` |

---

## Template Syntax

Templates use placeholder syntax for dynamic content:

```markdown
# Project: {{PROJECT_NAME}}

## Vision
{{VISION_STATEMENT}}

## Goals
{{GOALS_LIST}}
```

### Placeholder Types

| Pattern | Description | Example |
|---------|-------------|---------|
| `{{VARIABLE}}` | Simple replacement | `{{PROJECT_NAME}}` |
| `{{#SECTION}}...{{/SECTION}}` | Conditional section | `{{#HAS_V2}}V2 items...{{/HAS_V2}}` |
| `{{ITEMS_LIST}}` | List expansion | Requirements list |

---

## Template Details

### PROJECT.md.template

**Purpose:** Project vision and goals structure.

**Key Sections:**
- Project header with name and description
- Vision statement
- Goals (numbered list)
- Success criteria (checkbox list)
- Constraints and assumptions
- Out of scope items

**Placeholders:**
- `{{PROJECT_NAME}}` - Project name
- `{{PROJECT_DESCRIPTION}}` - One-line description
- `{{VISION_STATEMENT}}` - Vision paragraph
- `{{GOALS_LIST}}` - Numbered goal items
- `{{SUCCESS_CRITERIA}}` - Checkbox items
- `{{CONSTRAINTS}}` - Constraint items
- `{{OUT_OF_SCOPE}}` - Excluded items

---

### REQUIREMENTS.md.template

**Purpose:** Structured requirements with traceability IDs.

**Key Sections:**
- V1 Must Have (Functional, Non-Functional)
- V2 Should Have (Functional, Non-Functional)
- Requirement traceability matrix

**ID Format:**
- `V1-F01` - Version 1, Functional, item 01
- `V1-N01` - Version 1, Non-Functional, item 01
- `V2-F01` - Version 2, Functional, item 01

**Placeholders:**
- `{{V1_FUNCTIONAL}}` - V1 functional requirements
- `{{V1_NONFUNCTIONAL}}` - V1 non-functional requirements
- `{{V2_FUNCTIONAL}}` - V2 functional requirements
- `{{V2_NONFUNCTIONAL}}` - V2 non-functional requirements

---

### ROADMAP.md.template

**Purpose:** Phase sequence with status tracking.

**Key Sections:**
- Phase list with descriptions
- Requirements per phase
- Status indicators
- Dependencies

**Status Values:**
- `⏳ Pending` - Not started
- `🔄 In Progress` - Currently active
- `✅ Complete` - Finished
- `⏸️ Blocked` - Waiting on dependency

**Placeholders:**
- `{{PHASES_LIST}}` - Phase entries
- `{{PHASE_N_NAME}}` - Phase name
- `{{PHASE_N_REQUIREMENTS}}` - Linked requirements
- `{{PHASE_N_STATUS}}` - Current status

---

### STATE.md.template

**Purpose:** Persistent state across sessions.

**Key Sections:**
- Current position (phase, task, wave)
- Decisions log
- Blockers list
- Progress metrics
- Session notes

**Placeholders:**
- `{{CURRENT_PHASE}}` - Active phase number
- `{{CURRENT_TASK}}` - Active task number
- `{{DECISIONS_LIST}}` - Key decisions made
- `{{BLOCKERS_LIST}}` - Active blockers
- `{{PROGRESS_METRICS}}` - Completion percentages

---

### CONTEXT.md.template

**Purpose:** Pre-planning decisions per phase.

**Key Sections:**
- Phase header
- Decision categories
- Assumptions list
- Open questions

**Decision Categories:**
- Visual/UI decisions
- API/Data decisions
- Content/Copy decisions
- Organization decisions
- Technical decisions

**Placeholders:**
- `{{PHASE_NUMBER}}` - Phase being discussed
- `{{PHASE_NAME}}` - Phase description
- `{{UI_DECISIONS}}` - UI-related decisions
- `{{API_DECISIONS}}` - API-related decisions
- `{{ASSUMPTIONS}}` - Working assumptions

---

### RESEARCH.md.template

**Purpose:** Research findings and recommendations.

**Key Sections:**
- Research topic
- Findings summary
- Options comparison
- Recommendation
- References

**Placeholders:**
- `{{RESEARCH_TOPIC}}` - What was researched
- `{{FINDINGS}}` - Key findings
- `{{OPTIONS}}` - Compared options
- `{{RECOMMENDATION}}` - Suggested choice
- `{{REFERENCES}}` - Source links

---

### PLAN.md.template

**Purpose:** XML-structured task specifications.

**Key Sections:**
- Plan header with phase info
- Task list (max 3)
- Wave groupings
- Requirements traceability

**Task XML Structure:**
```xml
<task id="{{TASK_ID}}" wave="{{WAVE_NUMBER}}">
  <objective>{{TASK_OBJECTIVE}}</objective>
  <requirements>{{LINKED_REQUIREMENTS}}</requirements>
  <action>{{ACTION_STEPS}}</action>
  <decisions>{{RELEVANT_DECISIONS}}</decisions>
  <verification>{{VERIFICATION_STEPS}}</verification>
  <rollback>{{ROLLBACK_STEPS}}</rollback>
  <acceptance_criteria>{{ACCEPTANCE_CRITERIA}}</acceptance_criteria>
</task>
```

---

### SUMMARY.md.template

**Purpose:** Commit history and change tracking.

**Key Sections:**
- Phase commit list
- Files changed per task
- Commit messages

**Placeholders:**
- `{{PHASE_NUMBER}}` - Phase summarized
- `{{COMMITS_LIST}}` - Commit entries
- `{{FILES_CHANGED}}` - Modified files

---

### ISSUES.md.template

**Purpose:** Deferred enhancements and known issues.

**Key Sections:**
- Deferred enhancements (V2 items)
- Known issues
- Technical debt
- Future considerations

**Placeholders:**
- `{{DEFERRED_ITEMS}}` - V2 requirements
- `{{KNOWN_ISSUES}}` - Bug list
- `{{TECH_DEBT}}` - Technical debt items

---

## Template Customization

### Modifying Templates

1. Locate template in `_gsd/templates/`
2. Edit while preserving placeholder syntax
3. Test with `/gsd:new-project` or relevant command

### Adding New Templates

1. Create `FILENAME.md.template` in `_gsd/templates/`
2. Use consistent placeholder syntax
3. Update workflow to reference new template

### Best Practices

- Keep templates focused on structure, not content
- Use clear placeholder names
- Document placeholder meanings
- Test after modifications

---

## Template Relationships

```
new-project
    │
    ├── PROJECT.md.template
    ├── REQUIREMENTS.md.template
    ├── ROADMAP.md.template
    ├── STATE.md.template
    └── ISSUES.md.template

discuss-phase
    └── CONTEXT.md.template

research-phase
    └── RESEARCH.md.template

plan-phase
    └── PLAN.md.template

execute-phase
    └── SUMMARY.md.template
```

---

**Next:** [Workflows](./workflows.md) | [Back to Index](./index.md)
