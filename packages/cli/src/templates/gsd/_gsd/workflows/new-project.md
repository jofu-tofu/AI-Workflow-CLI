# GSD Workflow: New Project

## Purpose

Extract project ideas through guided discovery and create foundational PROJECT.md documentation.

## Process

### Step 1: Discovery Questions

Ask the user the following questions to understand their project vision:

1. **What problem are you solving?**
   - What's the core pain point?
   - Who experiences this problem?

2. **What's the desired outcome?**
   - What does success look like?
   - How will you measure it?

3. **What are the constraints?**
   - Time limitations?
   - Technical requirements?
   - Resource availability?

4. **Who is this for?**
   - Target audience/users?
   - Stakeholders?

5. **What's explicitly out of scope?**
   - What are you NOT building?
   - What features are deferred?

### Step 2: Synthesize Responses

Take the user's answers and create a coherent project vision.

### Step 3: Generate PROJECT.md

Use the template at `_gsd/templates/PROJECT.md.template` to create the project documentation:

1. Replace `{{PROJECT_NAME}}` with the project name
2. Replace `{{DATE}}` with current date
3. Fill in all sections based on user responses
4. Create the file at project root: `PROJECT.md`

### Step 4: Initialize Supporting Files

Create these files in the project root:
- `ROADMAP.md` (from template)
- `STATE.md` (from template)
- `ISSUES.md` (from template)
- Create `todos/` directory for captured ideas

### Step 5: Confirmation

Show the user the created PROJECT.md and confirm it captures their vision accurately.

## Next Steps

Recommend running `/gsd:create-roadmap` to break the project into phases.

## Success Criteria

- [ ] PROJECT.md created with complete vision
- [ ] All supporting files initialized
- [ ] User confirms accuracy of documentation
- [ ] Clear next steps provided
