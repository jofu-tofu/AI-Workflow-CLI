# Windsurf IDE Architecture Research

**Date:** 2026-01-12
**Version:** Based on latest documentation and community analysis

---

## Overview

Windsurf is an AI-first IDE developed by Codeium featuring the Cascade AI assistant. It uses a rules-based architecture with workflows for automation and a sophisticated context awareness system called "memories."

---

## 1. File Structure and Locations

### Workspace Structure
```
project-root/
├── .windsurf/
│   ├── rules/           # Workspace-level rules
│   │   ├── rule1.md
│   │   └── rule2.md
│   └── workflows/       # Workspace-level workflows
│       ├── workflow1.md
│       └── workflow2.md
```

### Global Locations
- **Global Rules:** `~/.codeium/windsurf/memories/global_rules.md`
- **Memories:** `~/.codeium/windsurf/cascade/` (auto-generated)
- **Memories Storage:** `~/.codeium/windsurf/memories/`

### System-Level Locations (Enterprise/IT Managed)
- **macOS:** `/Library/Application Support/Windsurf/rules/`
- **Linux:** `/etc/windsurf/rules/`
- **Windows:** `C:\ProgramData\Windsurf\rules\`

### Discovery Mechanism
Windsurf automatically discovers rules and workflows from:
1. `.windsurf/rules` and `.windsurf/workflows` in current workspace
2. Sub-directories of the workspace
3. Parent directories up to the git root (for git repositories)
4. System directories (OS-specific, highest priority)

---

## 2. Workflow Definition Format

### File Characteristics
- **Format:** Markdown (.md) files
- **Size Limit:** 12,000 characters per file
- **Location:** `.windsurf/workflows/` directory
- **Naming:** Filename becomes command (e.g., `deploy.md` → `/deploy`)

### Workflow Structure

**Components:**
- Title: Name of the workflow
- Description: Brief explanation
- Steps: Sequential instructions for Cascade

**Example Structure (Conceptual):**
```yaml
name: Test & Lint
on:
  manual: true
  push: true
  pull_request: true

jobs:
  setup:
    steps:
      - name: Setup Python 3.11 venv
        run: python3.11 -m venv .venv
  lint:
    needs: setup
    steps:
      - name: Run flake8 linter
  test:
    needs: lint
    steps:
      - name: Run pytest
```

### Invocation
- Slash commands: `/[workflow-name]`
- Auto-generated from filename
- Workflows can call other workflows (nested automation)

---

## 3. Rules System and Cascade Mechanism

### Rules Hierarchy (Priority Order)

1. **System-level rules** (Highest priority)
   - Deployed by IT/organizations
   - Cannot be modified by end users
   - Merge with user rules without overriding

2. **Global rules** (`global_rules.md`)
   - User-wide preferences
   - Apply across all workspaces

3. **Workspace rules** (`.windsurf/rules/`)
   - Project-specific standards
   - Version-controlled and shareable

### Rule Activation Modes

**Four activation types:**

1. **Manual**
   - Activated via @-mention: `@rules:rulename`
   - Explicit user control

2. **Always On**
   - Continuously applied to all interactions
   - Highest impact on AI behavior

3. **Model Decision**
   - AI decides when to apply
   - Based on natural language description
   - Context-aware activation

4. **Glob**
   - Automatically applied to matching files
   - Patterns: `*.js`, `src/**/*.ts`, `*.{tsx,jsx}`
   - File-specific rules

### File Specifications
- **Format:** Markdown (.md) files
- **Size Limit:** 12,000 characters per file
- **Discovery:** Automatic from standard locations
- **Sharing:** Version-controllable with team

---

## 4. Front Matter Patterns

### YAML Front Matter Structure

Based on Cascade Customizations Catalog:

```yaml
---
trigger: always_on | model_decision | glob | manual
globs: ["*.js", "*.tsx", "src/**/*.ts"]
description: Brief description of the customization
labels: comma-separated, tags, for-categorization
author: Creator's name or username
modified: 2026-01-12
alwaysApply: true | false
---
```

### Front Matter Fields

**For Rules:**
- `trigger` - Activation mode (always_on, model_decision, glob, manual)
- `globs` - File patterns for glob-based activation
- `description` - Brief explanation of purpose
- `labels` - Tags for categorization and discovery
- `author` - Creator identification
- `modified` - Last modification date (YYYY-MM-DD)
- `alwaysApply` - Boolean for universal application

**For Workflows:**
- Similar structure but focused on automation triggers
- Can include event-based triggers (push, pull_request, manual)

---

## 5. Command Invocation Patterns

### Keyboard Shortcuts

**Primary Commands:**
- **Cascade:** `Cmd/Ctrl + L` - Opens Cascade AI assistant
- **Inline Commands:** `⌘ + I` (Mac) - Natural language without workflow interruption
- **Command Palette:** `⌘+⇧+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)

### Command Syntax

**Workflows:**
- `/[workflow-name]` - Execute workflow
- Example: `/deploy-service`, `/test-and-lint`

**Rules:**
- `@rules:[rulename]` - Manual activation
- Example: `@rules:python-style`, `@rules:security`

**Terminal Commands:**
- Plain English commands
- Examples:
  - "run tests in affected packages"
  - "start the dev server"
  - "deploy to staging"

---

## 6. Cascade Memories System

### Memory Types

**Auto-Generated Memories:**
- Stored in `~/.codeium/windsurf/cascade/`
- Cascade learns patterns from interactions
- Context awareness across sessions

**Memory Storage:**
- Location: `~/.codeium/windsurf/memories/`
- Persistent across workspace sessions
- Can retain outdated patterns (noted limitation)

### Memory Features
- Multi-file context awareness (Windsurf's strength)
- Pattern learning from refactors
- Historical interaction tracking

---

## 7. Known Limitations

### Performance Issues

**Resource Usage:**
- Heavy CPU usage (70-90%) on large projects
- Struggles with files >300-500 lines
- Problems with enterprise codebases

**Stability:**
- Crashes during long-running agent sequences
- Instability during Turbo Mode execution
- Background indexing disruptions

**Memory Constraints:**
- Optimal: Medium codebases (10K-100K lines)
- Struggles: Large monorepos (500K+ lines)
- Memory can retain outdated patterns after refactors

### Feature Limitations

**Autocomplete:**
- Inconsistent triggering
- Occasional lag in real-time assistance
- Less reliable than Cursor's inline completions

**Context Awareness:**
- Strong: Multi-file context (Windsurf's advantage)
- Weak: No official docs on memory limits for massive codebases

**No Agent Spawning:**
- Unlike Claude Code, cannot spawn parallel subagents
- All work runs in single Cascade context
- Cannot delegate to specialized agents

### Control and Transparency

**User Experience:**
- Cascade works independently (faster but less control)
- Less visibility into what AI is doing step-by-step
- Simpler UI but less granular control
- No approve/reject for individual changes

### Pricing Constraints

**Free Tier:**
- 25 credits burn in ~3 days of normal development
- Insufficient for sustained daily usage
- Pro plan required: $15/month for 500 credits

### Reliability Concerns

**User Feedback:**
- Trustpilot: Mostly 1-star reviews
- Common complaints: Wasted credits, unstable performance
- Reddit: Praise vision, criticize execution
- Inconsistent AI output on free tier (lower-tier models)

### Technical Issues

**Common Problems:**
- Rate limiting on premium models
- Terminal sessions appearing stuck
- Blank Cascade panel issues
- Platform-specific launch crashes (Linux)
- macOS security false positives
- Windows update failures when running as Administrator

**Network Requirements:**
Must whitelist domains:
- `*.codeium.com`
- `*.windsurf.com`
- `*.codeiumdata.com`

---

## 8. Best Practices

### Rule Writing
- Use bullet points, numbered lists, markdown formatting
- Be specific and explicit rather than vague
- Short, targeted instructions work better than long paragraphs
- Version control and share workspace rules with teams

### Workflow Design
- Keep workflows under 12,000 character limit
- Break complex automations into smaller workflows
- Use descriptive filenames (becomes command name)
- Document workflow purpose in description

### File Organization
- Separate concerns (rules vs workflows)
- Use subdirectories for organization
- Version control `.windsurf/` directory
- Share team standards via repository

---

## 9. Integration Features

### MCP (Model Context Protocol)
- Integrated MCP support
- Context protocol compatibility
- Resource management

### Cascade Conversations
- Multiple simultaneous Cascade conversations
- Independent context per conversation
- Parallel work streams

---

## 10. Comparison to Cursor

| Feature | Windsurf | Cursor |
|---------|----------|--------|
| **Pricing** | $15/month (500 credits) | $20/month |
| **Inline Speed** | Slower | Faster |
| **Multi-file Context** | Excellent | Good |
| **Control** | Less (autonomous) | More (step-by-step) |
| **Stability** | Issues reported | More stable |
| **Large Files** | Struggles >300 lines | Better handling |
| **File Size Handling** | Problems with large files | Superior |

### Windsurf Advantages
- More affordable ($15 vs $20)
- Superior multi-file context awareness
- Autonomous agent capabilities (Cascade)
- Integrated workflows and rules system
- MCP integration
- Multiple simultaneous conversations

### Cursor Advantages
- Faster inline completions
- Better stability
- More granular control (approve/reject changes)
- Better handling of large files
- More mature IDE integration

---

## 11. Terminology

**Windsurf Terms:**
- **Cascade** - The AI assistant (analogous to Claude in Claude Code)
- **Workflow** - Automation sequence (analogous to Claude Code skill)
- **Rule** - Context/instruction for AI behavior (analogous to CLAUDE.md)
- **Memory** - Learned patterns (no direct Claude Code equivalent)
- **Glob** - File pattern matching for rule activation
- **Trigger** - Activation mode for rules

**Unique Concepts:**
- **Always On** - Continuous rule application
- **Model Decision** - AI-driven rule activation
- **Cascade Conversations** - Multiple parallel AI sessions

---

## 12. Extension Mechanisms

### Adding Capabilities

**Via Rules:**
- Create `.md` files in `.windsurf/rules/`
- Choose appropriate trigger mode
- Use front matter for metadata

**Via Workflows:**
- Create `.md` files in `.windsurf/workflows/`
- Define automation steps
- Invoke with `/workflow-name`

**Via Global Rules:**
- Edit `~/.codeium/windsurf/memories/global_rules.md`
- Apply preferences across all workspaces

### Sharing with Team
- Version control `.windsurf/` directory
- Document in project README
- Share configurations via repository

---

## 13. Character Limits

**Critical Constraint:**
- **Rules:** 12,000 characters maximum
- **Workflows:** 12,000 characters maximum
- **Workaround:** Split into multiple files
- **Impact:** Limits complexity of single rule/workflow

---

## 14. Enterprise Deployment

### System-Level Rules
- IT can deploy organization-wide rules
- Users cannot modify system rules
- System rules merge with (don't override) user rules
- OS-specific deployment paths

### Network Requirements
Firewall must allow:
- `*.codeium.com`
- `*.windsurf.com`
- `*.codeiumdata.com`

---

## Sources

- [Workflows - Windsurf Docs](https://docs.windsurf.com/windsurf/cascade/workflows)
- [Cascade Memories - Windsurf Docs](https://docs.windsurf.com/windsurf/cascade/memories)
- [Common Windsurf Issues - Windsurf Docs](https://docs.windsurf.com/troubleshooting/windsurf-common-issues)
- [Introduction to Rules, Memories, & Workflows](https://windsurf.com/university/general-education/intro-rules-memories)
- [Wave 8: Cascade Customization Features](https://windsurf.com/blog/windsurf-wave-8-cascade-customization-features)
- [Windsurf Rules Directory](https://windsurf.com/editor/directory)
- [Windsurf vs Cursor Comparison](https://windsurf.com/compare/windsurf-vs-cursor)
- [Cascade Customizations Catalog - GitHub](https://github.com/Windsurf-Samples/cascade-customizations-catalog)
- [Using Windsurf Rules, Workflows, and Memories](https://www.paulmduvall.com/using-windsurf-rules-workflows-and-memories/)
- [Windsurf vs Cursor: Which AI IDE Is Best for Developers in 2026](https://zoer.ai/posts/zoer/windsurf-vs-cursor-ai-ide-comparison-2026)
- [Windsurf Editor Review 2026: The Definitive Guide](https://aitoolsinsights.com/tools/windsurf-editor-review-2026)
