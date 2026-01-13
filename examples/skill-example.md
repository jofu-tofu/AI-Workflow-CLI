# Example: Cross-Platform Skill Template

This file demonstrates a skill written in the superset standard format that can be adapted to all three platforms (Claude Code, Windsurf, GitHub Copilot).

---

## Standard Format (Superset)

**File:** `.ai-templates/skills/test-runner/SKILL.md`

```yaml
---
# ============================================
# CORE FIELDS (Universal)
# ============================================
name: test-runner
description: USE WHEN running tests. Executes test suites and analyzes results.
version: "1.0.0"

# ============================================
# CLAUDE CODE FIELDS
# ============================================
allowed-tools:
  - Bash(npm test)
  - Bash(npm run test:*)
  - Read
  - Grep
model: sonnet
context: inherit
permissions:
  allow:
    - Read(tests/**)
    - Read(src/**)
    - Bash(npm test*)
  deny:
    - Write(**)

# ============================================
# WINDSURF FIELDS
# ============================================
trigger: model_decision
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "tests/**/*"
labels:
  - testing
  - automation
  - quality

# ============================================
# GITHUB COPILOT FIELDS
# ============================================
applyTo:
  - "**/*.test.ts"
  - "**/*.spec.ts"
mode: agent

# ============================================
# CROSS-PLATFORM FIELDS
# ============================================
platforms:
  - claude-code
  - windsurf
  - github-copilot
---

# Test Runner

Execute test suites and provide analysis of results.

## Process

### 1. Identify Tests
- Scan for test files matching `*.test.ts` or `*.spec.ts`
- List available test scripts in `package.json`
- Ask user which tests to run (all, unit, integration, specific)

### 2. Execute Tests
- Run selected test command
- Capture output including passes, failures, and errors
- Monitor for test timeouts or crashes

### 3. Analyze Results
- Parse test output
- Identify failing tests
- Extract error messages and stack traces
- Categorize failures (assertions, errors, timeouts)

### 4. Report Findings
- Summarize: X passed, Y failed out of Z total
- List failing tests with file locations
- Show error messages for failures
- Suggest next steps (fix code, update tests, check dependencies)

## Output Format

```
TEST RESULTS
============
Status: [PASS|FAIL]
Passed: X/Z (XX%)
Failed: Y/Z (XX%)

FAILURES:
---------
1. tests/auth/login.test.ts:42
   Test: "should reject invalid credentials"
   Error: Expected status 401, received 500

2. tests/api/users.test.ts:88
   Test: "should create new user"
   Error: ValidationError: email is required

NEXT STEPS:
-----------
- Fix server error in login handler (returning 500 instead of 401)
- Add email validation to user creation endpoint
```
```

---

## Windsurf Adaptation

Following **Pattern 1: Skill Emulation for Windsurf** from WORKAROUND-PATTERNS.md:

**File:** `.windsurf/workflows/test-runner.md`

```yaml
---
description: USE WHEN running tests. Executes test suites and analyzes results.
trigger: model_decision
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "tests/**/*"
labels:
  - testing
  - automation
  - quality
---

# Test Runner

<!-- Version: 1.0.0 -->
<!-- Adapted from cross-platform skill template -->

## Tool Restrictions (Advisory)

> **NOTE:** These restrictions rely on AI compliance and are NOT enforced by Windsurf.

**Allowed Operations:**
- Run test commands (`npm test`, `npm run test:*`)
- Read test files (`tests/**`)
- Read source files (`src/**`)
- Search for test patterns

**Forbidden Operations:**
- Writing or editing files
- Modifying test configuration
- Installing dependencies
- Committing changes

**IMPORTANT:** Before using tools outside this list, ask user for permission.

---

## Execution Context

This workflow uses inherited context (normal Cascade session).

---

## Process

### 1. Identify Tests
- Scan for test files matching `*.test.ts` or `*.spec.ts`
- List available test scripts in `package.json`
- Ask user which tests to run (all, unit, integration, specific)

### 2. Execute Tests
- Run selected test command
- Capture output including passes, failures, and errors
- Monitor for test timeouts or crashes

### 3. Analyze Results
- Parse test output
- Identify failing tests
- Extract error messages and stack traces
- Categorize failures (assertions, errors, timeouts)

### 4. Report Findings
- Summarize: X passed, Y failed out of Z total
- List failing tests with file locations
- Show error messages for failures
- Suggest next steps (fix code, update tests, check dependencies)

## Output Format

```
TEST RESULTS
============
Status: [PASS|FAIL]
Passed: X/Z (XX%)
Failed: Y/Z (XX%)

FAILURES:
---------
1. tests/auth/login.test.ts:42
   Test: "should reject invalid credentials"
   Error: Expected status 401, received 500

2. tests/api/users.test.ts:88
   Test: "should create new user"
   Error: ValidationError: email is required

NEXT STEPS:
-----------
- Fix server error in login handler (returning 500 instead of 401)
- Add email validation to user creation endpoint
```

---

## Invocation

This workflow activates automatically when:
- User mentions "run tests", "test suite", or "check tests"
- User is working in test files (matches globs)
- Windsurf's AI determines testing is relevant to current task

Manual invocation: `/test-runner`
```

---

## Claude Code Adaptation

The skill works natively in Claude Code with minimal changes:

**File:** `.claude/skills/test-runner/SKILL.md`

```yaml
---
name: test-runner
description: USE WHEN running tests. Executes test suites and analyzes results.
version: "1.0.0"
allowed-tools:
  - Bash(npm test)
  - Bash(npm run test:*)
  - Read
  - Grep
model: sonnet
context: inherit
---

# Test Runner

Execute test suites and provide analysis of results.

[Same process and output format as standard template]
```

**File:** `.claude/settings.json` (permissions merged)

```json
{
  "permissions": {
    "allow": [
      "Read(tests/**)",
      "Read(src/**)",
      "Bash(npm test*)"
    ],
    "deny": [
      "Write(**)"
    ]
  }
}
```

---

## GitHub Copilot Adaptation

**File:** `.github/prompts/test-runner.prompt.md`

```yaml
---
description: USE WHEN running tests. Executes test suites and analyzes results.
applyTo:
  - "**/*.test.ts"
  - "**/*.spec.ts"
mode: agent
---

# Test Runner

<!-- Version: 1.0.0 -->

## Operational Constraints

**This prompt has the following tool restrictions:**

Allowed:
- Run test commands (`npm test`, `npm run test:*`)
- Read test files (`tests/**`)
- Read source files (`src/**`)

Not Allowed:
- Writing or editing files
- Installing dependencies
- Committing changes

Please adhere to these constraints throughout execution.

---

[Same process and output format as standard template]
```

---

## Comparison Summary

| Aspect | Claude Code | Windsurf | GitHub Copilot |
|--------|------------|----------|----------------|
| **Format** | Native skill | Emulated as workflow | Emulated as prompt |
| **Activation** | Auto-invoke via description | Model decision trigger | Apply to file patterns |
| **Permissions** | Enforced by system | Advisory only | Advisory only |
| **File Location** | `.claude/skills/` | `.windsurf/workflows/` | `.github/prompts/` |
| **Agent Support** | Native | Emulated via persona rules | Inline persona in prompt |
| **Invocation** | Auto or `/skill` | Auto or `/workflow` | Auto when editing matching files |

---

## Testing the Pattern

### Manual Traceability Test

**Scenario:** User wants to run tests in a TypeScript project

**Windsurf Execution Flow:**

1. **User:** "Can you run the tests and show me the results?"

2. **Model Decision:**
   - AI scans workflows with `trigger: model_decision`
   - Matches "run the tests" to description "USE WHEN running tests"
   - Activates `test-runner` workflow

3. **Context Loading:**
   - Reads `.windsurf/workflows/test-runner.md`
   - Parses frontmatter and markdown body
   - Loads instructions into AI context

4. **Execution:**
   - **Step 1:** AI uses Glob to scan for `*.test.ts` files
   - **Step 1:** AI reads `package.json` to find test scripts
   - **Step 1:** AI asks: "I found unit tests and integration tests. Which would you like to run?"

5. **User:** "Run all tests"

6. **Execution Continues:**
   - **Step 2:** AI runs `npm test`
   - **Step 2:** Captures output showing 45 passed, 2 failed
   - **Step 3:** Parses failures, extracts error messages
   - **Step 4:** Formats report according to template

7. **Output:** AI presents formatted test results with failures highlighted

8. **Completion:** Workflow completes, Cascade returns to normal mode

**Verification:**
- File exists: `.windsurf/workflows/test-runner.md`
- YAML frontmatter valid
- Workflow activated on keyword "run tests"
- All 4 process steps executed
- Output matches defined format
- No forbidden operations performed (no file writes)

---

## Key Takeaways

1. **One Source, Multiple Targets:** Write skill once in standard format, adapt to all platforms
2. **Graceful Degradation:** Features not available on a platform become advisory instructions
3. **Clear Documentation:** Each adaptation documents what works and what's emulated
4. **Practical Testing:** Example includes manual trace to verify pattern works
5. **Platform Strengths:** Each platform's adaptation uses its native features where possible
