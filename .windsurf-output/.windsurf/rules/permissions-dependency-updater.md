---
trigger: glob
globs:
  - ".env"
  - "rm -rf *"
  - "* --force"
description: Security warning for restricted files
---

# SECURITY WARNING - Restricted File Access

You are accessing a file that has ACCESS RESTRICTIONS.

## Restricted Patterns

**FORBIDDEN - Do NOT access these files:**
- `Read(.env)`
- `Bash(rm -rf *)`
- `Bash(* --force)`

## Required Actions

1. **STOP** - Do not read or modify this file
2. **WARN** - Alert the user about the attempted access
3. **ASK** - Request explicit permission if access is truly needed

> **WARNING:** These restrictions are NOT technically enforced.
> Violating them may expose secrets or corrupt critical configurations.
