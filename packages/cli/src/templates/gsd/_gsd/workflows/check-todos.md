# GSD Workflow: Check Todos

## Purpose

List all pending todos captured via `/gsd:add-todo`, organized by priority and category.

## Process

### Step 1: Scan Todos Directory

Read all files in `.planning/todos/`

### Step 2: Parse and Organize

Group todos by:
- Priority (High → Medium → Low)
- Category (Bug, Idea, Enhancement, Note)
- Status (Pending, In Progress, Done)

### Step 3: Display Summary

```markdown
## Pending Todos

### 🔴 High Priority

| Todo | Category | Created | Phase |
|------|----------|---------|-------|
| {Title} | Bug | {Date} | {N} |
| {Title} | Enhancement | {Date} | {N} |

### 🟡 Medium Priority

| Todo | Category | Created | Phase |
|------|----------|---------|-------|
| {Title} | Idea | {Date} | General |

### 🟢 Low Priority

| Todo | Category | Created | Phase |
|------|----------|---------|-------|
| {Title} | Note | {Date} | {N} |

---

**Total:** {N} pending todos
**High Priority:** {N}
**Oldest:** {Date} - {Title}
```

### Step 4: Offer Actions

```markdown
## Actions

1. **View details:** Specify todo to see full content
2. **Mark done:** Move to completed
3. **Promote to issue:** Add to ISSUES.md
4. **Promote to phase:** Create task in phase plan
5. **Delete:** Remove if no longer needed

What would you like to do?
```

## Output

Display only (no file changes unless acting on todo)
