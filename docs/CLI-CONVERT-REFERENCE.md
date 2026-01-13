# AIW Convert Command Reference

**Command:** `aiw convert`
**Version:** 1.0.0
**Purpose:** Convert templates between AI assistant platform formats

---

## Table of Contents

1. [Command Overview](#1-command-overview)
2. [Usage Examples](#2-usage-examples)
3. [Platform-Specific Behavior](#3-platform-specific-behavior)
4. [Semantic Transformation](#4-semantic-transformation)
5. [Troubleshooting](#5-troubleshooting)
6. [Integration](#6-integration)

---

## 1. Command Overview

### Purpose

The `aiw convert` command transforms templates written in the standard superset format into platform-specific formats for different AI assistants. This enables writing a single template that works across multiple platforms while respecting each platform's native capabilities and constraints.

### Synopsis

```
aiw convert <source> --to <platform> [options]
```

### Arguments

| Argument | Description | Required |
|----------|-------------|----------|
| `source` | Path to template file to convert | Yes |

### Flags

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--to` | `-t` | Target platform(s): claude-code, windsurf | Required |
| `--output` | `-o` | Output directory | `.` (current directory) |
| `--dry-run` | | Show what would be generated without writing files | `false` |
| `--strict` | | Fail on any incompatibility instead of generating warnings | `false` |
| `--debug` | `-d` | Enable verbose debug output | `false` |
| `--quiet` | `-q` | Suppress informational output | `false` |
| `--help` | `-h` | Show command help | |

### Supported Platforms

| Platform | Output Directory | Status |
|----------|------------------|--------|
| `claude-code` | `.claude/` | Fully supported |
| `windsurf` | `.windsurf/` | Fully supported |
| `github-copilot` | `.github/` | Planned |

---

## 2. Usage Examples

### Basic Conversion (Single Platform)

Convert a template to Claude Code format:

```bash
aiw convert template.md --to claude-code
```

Convert a template to Windsurf format:

```bash
aiw convert template.md --to windsurf
```

### Multi-Platform Conversion

Convert to multiple platforms simultaneously:

```bash
aiw convert template.md --to claude-code --to windsurf
```

### Output Directory Specification

Generate output in a specific directory:

```bash
aiw convert template.md --to claude-code --output ./output
aiw convert template.md -t windsurf -o /path/to/project
```

### Dry Run Mode

Preview what files would be generated without writing them:

```bash
aiw convert template.md --to claude-code --dry-run
```

Output:
```
Would generate files for claude-code:
  .claude/skills/my-skill/SKILL.md
  .claude/settings.json
```

### Strict Mode

Fail immediately on any incompatibility:

```bash
aiw convert template.md --to windsurf --strict
```

### Debug Mode

Enable verbose output for troubleshooting:

```bash
aiw convert template.md --to claude-code --debug
```

Debug output includes:
- Parsed template metadata
- Field mappings applied
- Transformation decisions
- File paths generated

### Quiet Mode for Scripts

Suppress informational output while preserving errors:

```bash
aiw convert template.md --to claude-code --quiet
```

---

## 3. Platform-Specific Behavior

### 3.1 Claude Code Output Structure

Claude Code is the most feature-complete platform. The adapter primarily maps fields directly and generates the appropriate directory structure.

**Output Structure:**

```
.claude/
+-- skills/
|   +-- {skill-name}/
|       +-- SKILL.md              # Main skill file with frontmatter
|       +-- assets/               # Optional supporting files
|       +-- CHUNKS/               # Optional chunked content
|
+-- agents/
|   +-- {agent-name}.md           # Custom agent definitions (if referenced)
|
+-- settings.json                 # Permission grants (merged)
```

**Field Mapping:**

| Superset Field | Claude Code Field | Transformation |
|----------------|-------------------|----------------|
| `name` | `name` | Direct copy |
| `description` | `description` | Direct copy |
| `version` | `version` | Direct copy |
| `allowed-tools` | `allowed-tools` | Direct copy as array |
| `model` | `model` | Direct copy |
| `context` | `context` | Direct copy (`inherit` or `fork`) |
| `agent` | `agent` | Direct copy (reference to agent file) |
| `permissions.allow` | Merged to settings.json | Array of patterns |
| `permissions.deny` | Merged to settings.json | Array of patterns |
| `trigger` | *(dropped)* | Windsurf-only field |
| `globs` | *(dropped)* | Windsurf-only field |
| `labels` | *(dropped)* | Windsurf-only field |

**Settings Merge Behavior:**

When permissions are specified in template frontmatter, they are merged into the project's `.claude/settings.json`:

- If `settings.json` exists, new permissions are appended (no duplicates)
- Permissions are PROJECT-SCOPED, not skill-scoped
- `deny` patterns take precedence over `allow` patterns at runtime

### 3.2 Windsurf Output Structure

Windsurf has fewer native features than Claude Code, so the adapter uses emulation patterns extensively.

**Output Structure:**

```
.windsurf/
+-- workflows/
|   +-- {name}.md                 # Main workflow file
|   +-- {name}-part-2.md          # Continuation (if chunked)
|
+-- rules/
|   +-- agent-{agent-name}.md     # Emulated agent persona (if agent: used)
|   +-- permissions-{name}.md     # Emulated permissions (if permissions: used)
```

**Field Mapping:**

| Superset Field | Windsurf Field | Transformation |
|----------------|----------------|----------------|
| `name` | *(filename)* | Filename becomes identifier |
| `description` | `description` | Direct copy |
| `version` | HTML comment | `<!-- Version: X.X.X -->` |
| `allowed-tools` | *(emulated)* | Advisory instructions in body |
| `context` | *(emulated)* | Sequential workflow markers |
| `agent` | *(emulated)* | Companion rule file created |
| `permissions` | *(emulated)* | Advisory rules with warnings |
| `trigger` | `trigger` | Direct copy |
| `globs` | `globs` | Direct copy |
| `labels` | `labels` | Direct copy as array |
| `alwaysApply` | `alwaysApply` | Direct copy |
| `author` | `author` | Direct copy |

**Emulation Patterns:**

1. **Tool Restrictions** - Converted to advisory instructions:
   ```markdown
   ## Tool Restrictions (Advisory)

   > **NOTE:** These restrictions rely on AI compliance and are NOT enforced.

   **Allowed Operations:**
   - Read files
   - Search file contents
   ```

2. **Context Fork** - Simulated with markers:
   ```markdown
   [CONTEXT: Isolated Execution - Treat as fresh session]
   {content}
   [END CONTEXT: Return to normal session]
   ```

3. **Agent References** - Generate companion rule file:
   - Main workflow references `@rules:agent-{name}`
   - Separate rule file contains persona definition

**Character Limit Handling:**

Windsurf has a 12,000 character limit per file. If content exceeds this:
- Content is split at markdown heading boundaries
- Each chunk links to the next: "Continue with `/workflow {name}-part-2`"

### 3.3 GitHub Copilot Output Structure (Planned)

**Output Structure:**

```
.github/
+-- prompts/
|   +-- {name}.prompt.md          # Main prompt file
|
+-- instructions/
|   +-- {name}.instructions.md    # Path-specific instructions
|
+-- copilot-instructions.md       # Always-on instructions
```

**Key Differences:**
- 10-file working set limit
- ~6,000 character context window
- No agent spawning capability
- Batch processing guidance injected for large operations

### 3.4 Warning Categories

The convert command generates warnings when features cannot be directly mapped:

| Category | Meaning | Action Required |
|----------|---------|-----------------|
| `UNSUPPORTED` | Feature doesn't exist on target | Review emulation or remove feature |
| `EMULATED` | Feature is approximated | Understand limitations |
| `LIMIT` | Platform constraint exceeded | Consider splitting content |
| `SECURITY` | Advisory-only restriction | Do not rely on for security |
| `DEGRADED` | Reduced functionality | Test on target platform |

**Example Warning Output:**

```
[EMULATED] Tool restrictions converted to advisory instructions (field: allowed-tools)
    Windsurf does not enforce tool restrictions. AI compliance required.

[UNSUPPORTED] Subagent spawning not available (field: context)
    Execute sequentially instead of parallel.
```

---

## 4. Semantic Transformation

### 4.1 What Content Gets Transformed

The convert command transforms both frontmatter metadata and markdown body content:

**Frontmatter:**
- Field mapping (see platform-specific sections above)
- Field dropping (platform-specific fields removed)
- Value normalization (strings to arrays, etc.)

**Body Content:**
- Platform-specific syntax (tool names, invocation commands)
- Emulation markers and advisory notes
- Context isolation instructions

### 4.2 Agent Spawning Transformation

Claude Code's native subagent spawning transforms to sequential execution on other platforms:

**Claude Code (Source):**
```yaml
context: fork
agent: security-reviewer
```

**Windsurf (Output):**
```markdown
## Agent Persona

This workflow uses the **security-reviewer** agent.
Activate with: `@rules:agent-security-reviewer` before running.

## Execution Context

[CONTEXT: Isolated Execution - Treat as fresh session]
{content}
[END CONTEXT]
```

**GitHub Copilot (Output):**
```markdown
## Agent Persona: Security Reviewer

For this task, adopt the following persona:
{inline persona content}

## Batch Execution Protocol

Process in batches due to working set limits.
```

### 4.3 Tool Calls Transformation

Explicit tool references are transformed to platform-appropriate syntax:

| Source | Claude Code | Windsurf | GitHub Copilot |
|--------|-------------|----------|----------------|
| `Use Glob to find files` | Keep as-is | "Search for files matching..." | "Search for files" |
| `Bash(npm test)` | Keep as-is | "Run: `npm test`" | "Execute: `npm test`" |
| `allowed-tools: [Read]` | Keep in frontmatter | Advisory section | Operational constraints |

### 4.4 Context Switches

Context management transforms based on platform capabilities:

| Context Type | Claude Code | Windsurf | GitHub Copilot |
|--------------|-------------|----------|----------------|
| `context: fork` | Native isolation | Emulated markers | Batch notes |
| `context: inherit` | Shared session | Normal Cascade | Normal session |
| Subagent spawn | Task tool | Sequential steps | Sequential steps |

### 4.5 Semantic Constructs Reference

The following 18 semantic constructs are detected and transformed:

1. **agent-spawn** - Subagent creation references
2. **tool-call** - Explicit tool invocations
3. **context-switch** - Context management (fork/inherit)
4. **permission-reference** - Tool restrictions and permissions
5. **model-decision-trigger** - AI-driven activation patterns
6. **glob-pattern** - Multi-file context patterns
7. **persona-rule** - Custom agent personas
8. **skill-chaining** - Cross-skill/prompt invocations
9. **context-gathering-protocol** - Step 0 patterns
10. **activation-instruction** - Manual invocation guidance
11. **working-set-limit** - File count constraints
12. **checkpoint-commit** - Intermediate commit instructions
13. **progress-tracking** - Multi-part progress documentation
14. **workspace-command** - @workspace references
15. **test-command** - Test execution commands
16. **advisory-warning** - Platform limitation notices
17. **version-comment** - HTML version tracking
18. **execution-flow-section** - Step-by-step documentation

---

## 5. Troubleshooting

### 5.1 Common Errors

#### "Invalid YAML frontmatter"

**Error:** `Failed to parse template: Invalid YAML frontmatter`

**Causes:**
- Missing `---` delimiters around frontmatter
- Invalid YAML syntax (bad indentation, unquoted strings with colons)
- Non-UTF8 encoding

**Solutions:**
1. Verify frontmatter has opening and closing `---` lines
2. Check YAML syntax with a validator
3. Quote strings containing special characters: `description: "Use WHEN: something"`
4. Ensure file is UTF-8 encoded

**Example valid frontmatter:**
```yaml
---
name: my-skill
description: "USE WHEN doing something specific"
version: "1.0.0"
---
```

#### "Unsupported platform"

**Error:** `Unsupported platform: github-copilot`

**Cause:** The specified platform is not yet implemented.

**Solution:** Use a supported platform:
```bash
aiw convert template.md --to claude-code
aiw convert template.md --to windsurf
```

**Currently Supported:**
- `claude-code`
- `windsurf`

#### "File not found"

**Error:** `ENOENT: no such file or directory`

**Causes:**
- Source file path is incorrect
- Path contains unescaped special characters
- File was moved or deleted

**Solutions:**
1. Verify the file exists: `ls path/to/template.md`
2. Use absolute paths or verify relative path from current directory
3. Quote paths with spaces: `aiw convert "path with spaces/template.md" --to claude-code`

#### "Permission denied"

**Error:** `Permission denied: Cannot write to .claude/skills/...`

**Causes:**
- Insufficient filesystem permissions
- Output directory is read-only
- File is locked by another process

**Solutions:**
1. Check directory permissions: `ls -la .claude/`
2. Use a different output directory: `--output ./writable-dir`
3. Close other programs that may have the file open
4. On Windows, run as Administrator if needed

#### "Disk full"

**Error:** `ENOSPC: no space left on device`

**Solution:** Free up disk space and retry.

### 5.2 Warning Interpretation Guide

#### `[EMULATED]` Warnings

**Meaning:** A feature is approximated but not fully replicated.

**Example:**
```
[EMULATED] Tool restrictions converted to advisory instructions (field: allowed-tools)
```

**Implications:**
- Feature works but behavior differs from source platform
- Review emulated output to ensure it meets requirements
- Test on target platform to verify behavior

**Common Emulated Features:**
- `allowed-tools` on Windsurf (advisory only, not enforced)
- `context: fork` on Windsurf (markers, not true isolation)
- `agent:` references on Windsurf (companion rule files)

#### `[UNSUPPORTED]` Warnings

**Meaning:** A feature cannot be replicated on the target platform.

**Example:**
```
[UNSUPPORTED] Subagent parallel execution not available
```

**Implications:**
- Feature is omitted from output
- May need to restructure workflow for target platform
- Consider platform-specific variants

#### `[SECURITY]` Warnings

**Meaning:** A security-related feature is advisory-only.

**Example:**
```
[SECURITY] Permission restrictions are not enforced by Windsurf
```

**Implications:**
- DO NOT rely on this for actual security
- Use platform-native security features
- Consider defense in depth strategies

#### `[LIMIT]` Warnings

**Meaning:** Content exceeds platform constraints.

**Example:**
```
[LIMIT] Content exceeds 12,000 character limit, splitting into chunks
```

**Implications:**
- Content may be split or truncated
- Review generated output for completeness
- Consider simplifying complex templates

### 5.3 Debug Mode Usage

Enable debug mode to troubleshoot conversion issues:

```bash
aiw convert template.md --to claude-code --debug
```

**Debug Output Includes:**
- Parsed template name and metadata
- Field mappings being applied
- Warnings with full context
- Generated file paths

**Example Debug Output:**
```
DEBUG: Parsed template: security-review
DEBUG: Description: USE WHEN reviewing code for security vulnerabilities
DEBUG: Applying Claude Code adapter
DEBUG: Mapping field: name -> name
DEBUG: Mapping field: allowed-tools -> allowed-tools
DEBUG: Dropping Windsurf field: trigger
DEBUG: Generating settings.json with permissions
DEBUG: Wrote: .claude/skills/security-review/SKILL.md
DEBUG: Wrote: .claude/settings.json
```

---

## 6. Integration

### 6.1 CI/CD Pipeline Examples

#### GitHub Actions

```yaml
name: Convert Templates

on:
  push:
    paths:
      - 'templates/**/*.md'

jobs:
  convert:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install AIW CLI
        run: npm install -g aiwcli

      - name: Convert templates
        run: |
          for file in templates/*.md; do
            aiw convert "$file" --to claude-code --to windsurf --quiet
          done

      - name: Commit generated files
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .claude/ .windsurf/
          git diff --staged --quiet || git commit -m "chore: regenerate platform-specific templates"
          git push
```

#### GitLab CI

```yaml
convert-templates:
  stage: build
  image: node:20
  script:
    - npm install -g aiwcli
    - |
      for file in templates/*.md; do
        aiw convert "$file" --to claude-code --to windsurf
      done
  artifacts:
    paths:
      - .claude/
      - .windsurf/
  only:
    changes:
      - templates/**/*.md
```

#### Jenkins

```groovy
pipeline {
    agent any
    stages {
        stage('Convert Templates') {
            steps {
                sh '''
                    npm install -g aiwcli
                    for file in templates/*.md; do
                        aiw convert "$file" --to claude-code --to windsurf
                    done
                '''
            }
        }
    }
}
```

### 6.2 Git Hooks Integration

#### Pre-commit Hook

Create `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Convert modified templates before commit
MODIFIED_TEMPLATES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.md$' | grep 'templates/')

if [ -n "$MODIFIED_TEMPLATES" ]; then
    echo "Converting modified templates..."

    for file in $MODIFIED_TEMPLATES; do
        aiw convert "$file" --to claude-code --to windsurf --quiet

        if [ $? -ne 0 ]; then
            echo "Failed to convert $file"
            exit 1
        fi
    done

    # Stage generated files
    git add .claude/ .windsurf/

    echo "Templates converted successfully"
fi

exit 0
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

#### Using Husky (npm project)

Install husky:
```bash
npm install husky --save-dev
npx husky init
```

Create `.husky/pre-commit`:
```bash
#!/bin/bash

# Convert templates on commit
npx aiw convert templates/*.md --to claude-code --to windsurf --quiet
git add .claude/ .windsurf/
```

### 6.3 Batch Processing Scripts

#### Bash Script

```bash
#!/bin/bash
# convert-all.sh - Convert all templates in a directory

set -e

SOURCE_DIR="${1:-./templates}"
OUTPUT_DIR="${2:-.}"
PLATFORMS="${3:-claude-code windsurf}"

echo "Converting templates from $SOURCE_DIR"
echo "Output directory: $OUTPUT_DIR"
echo "Target platforms: $PLATFORMS"

# Build platform flags
PLATFORM_FLAGS=""
for platform in $PLATFORMS; do
    PLATFORM_FLAGS="$PLATFORM_FLAGS --to $platform"
done

# Convert each template
CONVERTED=0
FAILED=0

for file in "$SOURCE_DIR"/*.md; do
    if [ -f "$file" ]; then
        echo "Converting: $file"

        if aiw convert "$file" $PLATFORM_FLAGS --output "$OUTPUT_DIR" --quiet; then
            ((CONVERTED++))
        else
            echo "  FAILED: $file"
            ((FAILED++))
        fi
    fi
done

echo ""
echo "Conversion complete:"
echo "  Converted: $CONVERTED"
echo "  Failed: $FAILED"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
```

#### PowerShell Script

```powershell
# convert-all.ps1 - Convert all templates in a directory

param(
    [string]$SourceDir = "./templates",
    [string]$OutputDir = ".",
    [string[]]$Platforms = @("claude-code", "windsurf")
)

Write-Host "Converting templates from $SourceDir"
Write-Host "Output directory: $OutputDir"
Write-Host "Target platforms: $($Platforms -join ', ')"

$platformFlags = $Platforms | ForEach-Object { "--to", $_ }

$converted = 0
$failed = 0

Get-ChildItem -Path $SourceDir -Filter "*.md" | ForEach-Object {
    Write-Host "Converting: $($_.FullName)"

    & aiw convert $_.FullName @platformFlags --output $OutputDir --quiet

    if ($LASTEXITCODE -eq 0) {
        $converted++
    } else {
        Write-Host "  FAILED: $($_.Name)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "Conversion complete:"
Write-Host "  Converted: $converted"
Write-Host "  Failed: $failed"

if ($failed -gt 0) {
    exit 1
}
```

### 6.4 Exit Codes Reference

The `aiw convert` command uses standardized exit codes for reliable automation:

| Code | Constant | Meaning | When It Occurs |
|------|----------|---------|----------------|
| `0` | `SUCCESS` | Success | Conversion completed without errors |
| `1` | `GENERAL_ERROR` | General Error | Runtime failures, file write errors, unexpected exceptions |
| `2` | `INVALID_USAGE` | Invalid Usage | Unknown platform, invalid arguments, YAML parse errors |
| `3` | `ENVIRONMENT_ERROR` | Environment Error | Missing prerequisites, permission denied |

#### Using Exit Codes in Scripts

**Bash:**
```bash
aiw convert template.md --to claude-code
EXIT_CODE=$?

case $EXIT_CODE in
    0)
        echo "Conversion successful"
        ;;
    1)
        echo "General error during conversion"
        ;;
    2)
        echo "Invalid usage - check arguments"
        ;;
    3)
        echo "Environment error - check permissions"
        ;;
esac
```

**PowerShell:**
```powershell
aiw convert template.md --to claude-code

switch ($LASTEXITCODE) {
    0 { Write-Host "Conversion successful" }
    1 { Write-Host "General error during conversion" }
    2 { Write-Host "Invalid usage - check arguments" }
    3 { Write-Host "Environment error - check permissions" }
}
```

### 6.5 Combining with Other AIW Commands

The convert command works well with other AIW CLI commands:

```bash
# Initialize AIW, then convert templates
aiw init && aiw convert templates/*.md --to claude-code

# Convert and then launch with the new templates
aiw convert skill.md --to claude-code && aiw launch
```

---

## See Also

- [PLATFORM-ADAPTERS.md](../PLATFORM-ADAPTERS.md) - Detailed transformation rules
- [CONTENT-SCHEMA.md](../CONTENT-SCHEMA.md) - Semantic construct definitions
- [packages/cli/README.md](../packages/cli/README.md) - CLI installation and general usage
- [STANDARD-SCHEMA.md](../STANDARD-SCHEMA.md) - Template format specification

---

## Appendix: Quick Reference Card

```
SYNOPSIS
    aiw convert <source> --to <platform> [options]

PLATFORMS
    claude-code     Full feature support
    windsurf        Emulation patterns applied

OPTIONS
    -t, --to        Target platform (required, repeatable)
    -o, --output    Output directory (default: .)
    --dry-run       Preview without writing files
    --strict        Fail on any incompatibility
    -d, --debug     Verbose output
    -q, --quiet     Suppress informational messages
    -h, --help      Show help

EXIT CODES
    0   Success
    1   General error
    2   Invalid usage
    3   Environment error

EXAMPLES
    aiw convert template.md --to claude-code
    aiw convert template.md --to windsurf --to claude-code
    aiw convert template.md --to claude-code --output ./out --dry-run
    aiw convert template.md --to windsurf --debug
```
