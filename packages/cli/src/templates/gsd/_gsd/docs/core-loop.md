# GSD Core Loop

The Core Loop is the fundamental workflow of GSD. Five commands take you from project inception to verified completion.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        THE GSD CORE LOOP                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────────┐                                                  │
│   │ new-project  │ ────────────────────────────────────┐            │
│   └──────────────┘                                     │            │
│          │                                             │            │
│          ▼                                             │            │
│   ┌──────────────┐                                     │            │
│   │discuss-phase │ (optional)                          │            │
│   └──────────────┘                                     │            │
│          │                                             │            │
│          ▼                                             │            │
│   ┌──────────────┐                                     │            │
│   │  plan-phase  │                                     │            │
│   └──────────────┘                                     │            │
│          │                                             │            │
│          ▼                                             │            │
│   ┌──────────────┐                                     │            │
│   │execute-phase │                                     │            │
│   └──────────────┘                                     │            │
│          │                                             │            │
│          ▼                                             │            │
│   ┌──────────────┐                                     │            │
│   │ verify-work  │ ─── Pass ───► Next Phase ──────────►│            │
│   └──────────────┘                                     │            │
│          │                                             │            │
│          └─── Fail ───► Fix Cycle ─────────────────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. new-project

**Purpose:** Initialize a new project with discovery, requirements, and roadmap.

**Usage:**
```bash
/gsd:new-project
```

**What It Does:**
1. Conducts discovery conversation about the project
2. Extracts vision, goals, and success criteria
3. Gathers V1 (must have) and V2 (should have) requirements
4. Creates phase-based roadmap

**Creates:**
- `PROJECT.md` - Vision, goals, success criteria
- `REQUIREMENTS.md` - V1/V2 requirements with IDs
- `ROADMAP.md` - Phase sequence with completion status
- `STATE.md` - Persistent decisions and progress tracking
- `ISSUES.md` - Deferred enhancements tracking

**Example Interaction:**
```
User: /gsd:new-project
AI: What project would you like to build?
User: A CLI tool for managing Docker containers
AI: [Conducts discovery, creates documentation]
```

---

## 2. discuss-phase (Optional)

**Purpose:** Capture pre-planning decisions before creating a task plan.

**Usage:**
```bash
/gsd:discuss-phase [N]
```

**What It Does:**
1. Opens discussion about the phase
2. Captures decisions across categories:
   - Visual/UI decisions
   - API/Data decisions
   - Content/Copy decisions
   - Organization decisions
   - Assumptions
3. Records decisions for planning reference

**Creates/Updates:**
- `CONTEXT.md` - Discussion decisions per phase

**Why It Matters:**
- Reduces planning ambiguity
- Documents architectural choices
- Surfaces assumptions before implementation
- Prevents rework from unstated requirements

**Example Interaction:**
```
User: /gsd:discuss-phase 1
AI: Let's discuss Phase 1: Project Setup. What UI framework?
User: React with Tailwind CSS
AI: [Records decision, continues discussion]
```

---

## 3. plan-phase

**Purpose:** Create an atomic task plan with wave groupings.

**Usage:**
```bash
/gsd:plan-phase [N]
```

**What It Does:**
1. Analyzes phase requirements from ROADMAP.md
2. Incorporates decisions from CONTEXT.md
3. Creates maximum 3 atomic tasks
4. Groups tasks into waves for parallel execution
5. Links tasks to requirements (traceability)

**Creates:**
- `PLAN-phase-{N}.md` - XML-structured task plan

**Task Plan Structure:**
```xml
<task id="1" wave="1">
  <objective>Create project structure</objective>
  <requirements>V1-F01, V1-N01</requirements>
  <action>
    1. Initialize npm project
    2. Configure TypeScript
    3. Set up folder structure
  </action>
  <decisions>
    - React with Tailwind CSS (from CONTEXT.md)
  </decisions>
  <verification>
    - npm install succeeds
    - tsc compiles without errors
  </verification>
  <rollback>
    - rm -rf node_modules package.json
  </rollback>
  <acceptance_criteria>
    - Project builds successfully
    - All dependencies installed
  </acceptance_criteria>
</task>
```

**Wave Groupings:**
- **Wave 1:** Independent tasks (can run in parallel)
- **Wave 2:** Tasks depending on Wave 1
- **Wave 3:** Tasks depending on Wave 2

---

## 4. execute-phase

**Purpose:** Execute tasks wave by wave with fresh context.

**Usage:**
```bash
/gsd:execute-phase
```

**What It Does:**
1. Reads current plan from `PLAN-phase-{N}.md`
2. Executes Wave 1 tasks (potentially in parallel)
3. Waits for Wave 1 completion
4. Executes Wave 2 tasks
5. Makes atomic git commits per task
6. Updates STATE.md with progress

**Execution Pattern:**
```
Wave 1: [Task 1] [Task 2] (parallel)
            ↓
        Wait for completion
            ↓
Wave 2: [Task 3] (sequential)
            ↓
        Atomic commits
```

**Key Behaviors:**
- Fresh 200k context per task (no degradation)
- Atomic git commit after each task
- Progress tracked in STATE.md
- Rollback info available for failures

---

## 5. verify-work

**Purpose:** Conversational UAT with auto-diagnosis.

**Usage:**
```bash
/gsd:verify-work [N]
```

**What It Does:**
1. Runs automated checks (tests, linting, build)
2. Presents verification items one-by-one
3. Accepts user confirmation for each
4. Auto-diagnoses failures
5. Creates fix plans for issues

**Verification Flow:**
```
┌─────────────────────────────────────────────────────────┐
│ 1. Automated Checks                                     │
│    - Run tests                                          │
│    - Run linter                                         │
│    - Run build                                          │
├─────────────────────────────────────────────────────────┤
│ 2. Manual Verification (one-by-one)                     │
│    AI: "Does the navbar display correctly?"             │
│    User: "Yes" / "No, the logo is missing"              │
├─────────────────────────────────────────────────────────┤
│ 3. Outcome                                              │
│    Pass → Phase complete, advance to next               │
│    Fail → Auto-diagnosis + fix plan                     │
└─────────────────────────────────────────────────────────┘
```

**Creates/Updates:**
- `VERIFICATION-phase-{N}.md` - UAT report
- `STATE.md` - Phase completion status

---

## Typical Workflow

### Greenfield Project

```bash
# 1. Start new project
/gsd:new-project

# 2. Optionally discuss Phase 1
/gsd:discuss-phase 1

# 3. Create plan for Phase 1
/gsd:plan-phase 1

# 4. Execute Phase 1
/gsd:execute-phase

# 5. Verify Phase 1
/gsd:verify-work 1

# 6. Repeat for Phase 2, 3, etc.
/gsd:plan-phase 2
...
```

### Brownfield Project

```bash
# 1. Analyze existing codebase
/gsd:map-codebase

# 2. Start project with existing code context
/gsd:new-project

# 3. Continue with normal flow
/gsd:plan-phase 1
...
```

---

## Best Practices

1. **Always discuss before complex phases** - `discuss-phase` prevents costly rework
2. **Review plans before executing** - Plans can be modified before `execute-phase`
3. **Verify incrementally** - Don't skip `verify-work`
4. **Check progress frequently** - Use `/gsd:progress` to stay oriented
5. **Use handoffs** - `/gsd:pause-work` before context switches

---

## Related Commands

- `/gsd:progress` - Check current phase and task
- `/gsd:pause-work` - Create handoff documentation
- `/gsd:resume-work` - Restore from handoff
- `/gsd:add-phase` - Add new phases to roadmap
- `/gsd:debug` - Systematic debugging workflow

---

**Next:** [File Reference](./file-reference.md) | [Templates](./templates.md)
