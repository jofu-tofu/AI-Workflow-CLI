---
description: |
  USE WHEN checking for outdated dependencies, updating packages, or auditing for security vulnerabilities. Automates dependency maintenance workflow.
  
trigger: manual
globs:
  - "package.json"
  - "package-lock.json"
  - "yarn.lock"
  - "pnpm-lock.yaml"
labels:
  - dependencies
  - maintenance
  - security
  - automation
alwaysApply: false
author: "aiwcli Reference Templates"
---
<!-- Version: 1.0.0 -->
## Platform Compatibility Note> **NOTE [COMPATIBILITY]:** This template has full support on Windsurf.> Can execute terminal commands via Cascade
## Tool Restrictions (Advisory)

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.

**Allowed Operations:**
- Read files
- Write/create files
- Edit existing files
- Shell commands: `npm outdated`
- Shell commands: `npm audit`
- Shell commands: `npm update *`
- Shell commands: `npm install *`
- Shell commands: `git add *`
- Shell commands: `git commit *`
- Shell commands: `npm test`

**Forbidden Operations:**
- Spawning subagent tasks

**IMPORTANT:** Before using tools outside this list, ask user for permission.
## Access Permissions (Advisory)

**Allowed:**
- `Read(package.json)`
- `Read(package-lock.json)`
- `Read(yarn.lock)`
- `Write(package.json)`
- `Write(package-lock.json)`
- `Bash(npm *)`
- `Bash(yarn *)`

**Forbidden:**
- `Read(.env)`
- `Bash(rm -rf *)`
- `Bash(* --force)`

> **WARNING:** These restrictions are advisory only and NOT enforced by Windsurf.
# Dependency Updater Workflow

Automated workflow for checking, updating, and verifying project dependencies.

## Pre-Flight Context Gathering

Before beginning updates, gather context from the project:

1. First read package.json to understand current dependency state
2. Use Glob to find all `**/package.json` files in monorepo structures
3. Use Read to examine lock files for version constraints

## : Multi-File Context Acquisition

Use Glob to discover dependency files:

```
Glob: **/package.json
Glob: **/package-lock.json
Glob: **/yarn.lock
```

Read each discovered file to build dependency map.

## Execution Steps

### Step 1: Audit Current State

Execute shell command to run dependency audit:

```bash
npm outdated --json
npm audit --json
```

Parse the output to identify:
- Outdated packages (major, minor, patch)
- Security vulnerabilities (critical, high, medium, low)
- Deprecated packages

### Step 2: Categorize Updates

Execute the following this task steps sequentially:

> **NOTE:** Subagent spawning not available on Windsurf. Running in single Cascade session. to categorize updates by risk level:

| Risk Level | Update Type | Action |
|------------|-------------|--------|
| Low | Patch updates | Auto-update |
| Medium | Minor updates | Review changelog |
| High | Major updates | Manual review required |
| Critical | Security fixes | Immediate update |

### Step 3: Apply Safe Updates

For low-risk updates, proceed automatically:

1. Call Bash to run `npm update` for patch versions
2. Use Edit to update package.json for approved minor versions
3. Run tests to verify changes

**Tool Restrictions

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf. (Advisory):** Only use npm commands listed in allowed-tools

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.. Before using tools outside

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf. this list, ask user for permission.

### Step 4: Verify Updates

Run comprehensive verification:

```bash
npm test
npm run build
npm run lint
```

Update the todo list with verification status:

- [ ] All tests passing
- [ ] Build successful
- [ ] No lint errors
- [ ] No new vulnerabilities

Mark task complete after all checks pass.

### Step 5: Checkpoint

Create atomic commit for the dependency updates:

```
deps: update dependencies to latest compatible versions

Updated packages:
- package-a: 1.0.0 -> 1.0.5 (patch)
- package-b: 2.1.0 -> 2.2.0 (minor)

Security fixes:
- Resolved 3 moderate vulnerabilities
```

Commit changes with descriptive message following conventional commits format.

## Progress Tracking

Track workflow progress across phases:

**Status:** In Progress

- [x] Step 1: Audit complete
- [ ] Step 2: Categorization complete
- [ ] Step 3: Updates applied
- [ ] Step 4: Verification complete
- [ ] Step 5: Committed

## Major Update Handling

For major version updates that require manual review:

1. Create a separate branch for testing
2. Document breaking changes from changelog
3. Spawn a dedicated agent to handle migration steps
4. Run full test suite with coverage report

## Rollback Plan

If issues are discovered after updates:

1. Use `git revert` to undo the checkpoint commit
2. Re-run `npm install` to restore previous lock file
3. Document which package caused the issue

## Manual Invocation

Invocation command: `/dependency-updater`

This workflow activates automatically when:
- User mentions "update dependencies"
- User mentions "check for outdated packages"
- User mentions "npm audit" or "security vulnerabilities"