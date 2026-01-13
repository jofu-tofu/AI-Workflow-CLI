---
# ============================================
# CORE FIELDS (Universal - All Platforms)
# ============================================
name: dependency-updater
description: >
  USE WHEN checking for outdated dependencies, updating packages, or auditing
  for security vulnerabilities. Automates dependency maintenance workflow.
version: "1.0.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(npm outdated)
  - Bash(npm audit)
  - Bash(npm update *)
  - Bash(npm install *)
  - Bash(git add *)
  - Bash(git commit *)
  - Bash(npm test)
model: claude-sonnet-4-5-20250929
context: inherit
permissions:
  allow:
    - Read(package.json)
    - Read(package-lock.json)
    - Read(yarn.lock)
    - Write(package.json)
    - Write(package-lock.json)
    - Bash(npm *)
    - Bash(yarn *)
  deny:
    - Read(.env)
    - Bash(rm -rf *)
    - Bash(* --force)

# ============================================
# WINDSURF FIELDS
# ============================================
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

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "package.json"
  - "package-lock.json"
  - "requirements.txt"
  - "Cargo.toml"
mode: agent
tools:
  - githubRepo
  - search/codebase

# ============================================
# CROSS-PLATFORM FIELDS
# ============================================
platforms:
  - claude-code
  - windsurf
  - github-copilot

compatibility:
  claude-code:
    status: full
    notes: "Full automation with Bash tool for npm commands"
  windsurf:
    status: full
    notes: "Can execute terminal commands via Cascade"
  github-copilot:
    status: partial
    notes: "Limited terminal access; may require manual command execution"
---

# Dependency Updater Workflow

Automated workflow for checking, updating, and verifying project dependencies.

## Pre-Flight Context Gathering

Before beginning updates, gather context from the project:

1. First read package.json to understand current dependency state
2. Use Glob to find all `**/package.json` files in monorepo structures
3. Use Read to examine lock files for version constraints

## Step 0: Multi-File Context Acquisition

Use Glob to discover dependency files:

```
Glob: **/package.json
Glob: **/package-lock.json
Glob: **/yarn.lock
```

Read each discovered file to build dependency map.

## Execution Steps

### Step 1: Audit Current State

Use the Bash tool to run dependency audit:

```bash
npm outdated --json
npm audit --json
```

Parse the output to identify:
- Outdated packages (major, minor, patch)
- Security vulnerabilities (critical, high, medium, low)
- Deprecated packages

### Step 2: Categorize Updates

Spawn agent to categorize updates by risk level:

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

**Tool Restrictions (Advisory):** Only use npm commands listed in allowed-tools. Before using tools outside this list, ask user for permission.

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
