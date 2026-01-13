---
name: code-review
description: |
  USE WHEN reviewing code changes, pull requests, or examining code quality. Performs comprehensive code review for maintainability, performance, security, and adherence to best practices.
  
version: "1.0.0"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(npm run lint)
model: claude-sonnet-4-5-20250929
context: fork
agent: code-reviewer
---

# Code Review Skill

Perform comprehensive code review focusing on quality, maintainability, security, and best practices.

## Context Gathering Protocol

Before beginning the review, gather comprehensive context from the codebase:

1. First read PROJECT.md or README.md to understand project conventions
2. Use Glob to discover all files matching `**/*.ts` and `**/*.tsx` in the target directory
3. Use Grep to search for patterns related to the changes being reviewed

**Context Checklist:**
- [ ] Project conventions understood
- [ ] Related files identified
- [ ] Test files located
- [ ] Dependencies mapped

Only proceed to analysis once context gathering is complete.

## Review Process

### Phase 1: Static Analysis

Spawn a code-review agent to handle the initial static analysis phase. This agent will:

1. Use the Read tool to examine each changed file
2. Use the Grep tool to search for anti-patterns like `any` types or `console.log` statements
3. Call Grep to find TODO comments and technical debt markers

### Phase 2: Security Review

Check for security vulnerabilities:

1. Look for hardcoded credentials or API keys
2. Verify input validation patterns
3. Check for SQL injection or XSS vulnerabilities
4. Review authentication and authorization logic

**Permission Requirements:** Requires Read permission for all source files. Not allowed to modify any files during review.

### Phase 3: Best Practices

Evaluate code against best practices:

- Naming conventions
- Function length and complexity
- Error handling patterns
- Test coverage indicators

## Progress Tracking

Update the todo list as each review phase completes:

- [ ] Static analysis complete
- [ ] Security review complete
- [ ] Best practices evaluation complete
- [ ] Summary report generated

Mark task complete when the final summary is ready.

## Output Format

After completing the review, create atomic commit with the review findings:

```
code-review: comprehensive review of [component]

- Security: [pass/issues found]
- Quality: [score/10]
- Recommendations: [count]
```

### Findings Template

| Category | Severity | File | Line | Description |
|----------|----------|------|------|-------------|
| Security | High | - | - | - |
| Quality | Medium | - | - | - |
| Style | Low | - | - | - |

## Manual Invocation

Invocation command: `/code-review`

When to invoke this skill:
- Before merging pull requests
- During code audit sessions
- When onboarding to unfamiliar code