# GitHub Copilot & OpenAI Codex Architecture Research

**Date:** 2026-01-12
**Version:** Based on latest documentation and 2026 features

---

## Overview

GitHub Copilot is an AI-powered code completion and assistance tool that operates as IDE extensions, while OpenAI Codex is the underlying AI model that powers autonomous software engineering tasks. This research covers both the real-time assistant (Copilot) and the autonomous agent (Codex) aspects.

---

## 1. File Structure and Locations

### GitHub Copilot File Organization

**Custom Instructions:**
- **`.github/copilot-instructions.md`** - Repository-wide instructions
- **`.github/instructions/NAME.instructions.md`** - Path-specific instructions
- **`.github/prompts/*.prompt.md`** - Reusable prompt files
- **`.github/chatmodes/`** - Custom chat mode configurations

**Model-Specific Files:**
- `AGENTS.md` - Agent-specific instructions
- `CLAUDE.md` - Claude model instructions
- `GEMINI.md` - Gemini model instructions

### Configuration Structure

**Frontmatter Example:**
```yaml
---
applyTo: "**/*.ts,**/*.tsx"
excludeAgent: "code-review"
description: "TypeScript coding standards"
---

# TypeScript Coding Standards

[Instructions in natural language markdown]
```

**Supported Glob Patterns:**
```yaml
applyTo: "*"                    # Current directory only
applyTo: "**"                   # All files recursively
applyTo: "*.py"                 # Python files in current directory
applyTo: "**/subdir/**/*.py"    # Python in any subdir at any depth
applyTo: "**/*.ts,**/*.tsx"     # Multiple patterns (comma-separated)
```

**Exclude Agent Options:**
- `"code-review"` - Exclude from code review agent
- `"coding-agent"` - Exclude from coding agent

### Workspace Configuration

**VS Code Settings:**
- Per-workspace settings override global settings
- Different projects can have different Copilot behavior
- No global setting changes required

**Installation Paths:**
- IDE-specific extension directories
- No centralized ~/.copilot/ directory
- Configuration lives in `.github/` when version-controlled

---

## 2. Custom Instruction System

### Repository-Wide Instructions

**File:** `.github/copilot-instructions.md`

**Characteristics:**
- Natural language Markdown format
- Flexible whitespace handling (single paragraph, one per line, or blank-line separated)
- Automatically applied to all requests within repository context
- Activates immediately upon saving
- Appears in References list in Copilot Chat when utilized

**Priority Hierarchy:**
```
Personal instructions (highest)
  ↓
Repository instructions
  ↓
Organization instructions (lowest)
```

### Path-Specific Instructions

**File Pattern:** `.github/instructions/*.instructions.md`

**Purpose:** Apply guidance to specific file types or directories

**Example:**
```yaml
---
applyTo: "**/*.test.ts"
description: "Testing standards for TypeScript test files"
---

# Test File Standards

- Use Jest framework
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Aim for 80%+ coverage
```

### Reusable Prompts

**Directory:** `.github/prompts/`

**Format:** `*.prompt.md` files

**Invocation:** Type `#prompt:name` in Copilot Chat

**Example:**
```markdown
# .github/prompts/code-review.prompt.md

Review this code for:
1. Security vulnerabilities
2. Performance issues
3. Best practice violations
4. Code smell patterns

Provide specific line-by-line feedback with severity ratings.
```

**Note:** As of early 2026, there's an open feature request (Issue #618) to make these automatically available as slash commands in Copilot CLI.

### Best Practices for Instructions

Per GitHub's official guidance:
1. Be specific and detailed
2. Use clear, unambiguous language
3. Include examples where helpful
4. Focus on "why" rather than just "what"
5. Test instructions to ensure they work as expected

---

## 3. Slash Commands

### Built-in Commands

**Invocation:** Type `/` in chat prompt box followed by command name

**Purpose:** Shortcuts to specific functionality without complex prompts

**Common Scenarios:**
- Fixing issues
- Generating tests
- Explaining code
- Refactoring patterns

### Custom Slash Commands

**Status:** Feature requested but not yet implemented

**Requested Functionality:**
- Auto-recognize `.github/prompts/*.prompt.md` as slash commands
- Invoke with `/prompt-name` instead of `#prompt:name`
- Copilot CLI integration

**Current Workaround:** Use `#prompt:name` syntax

---

## 4. Agent Architecture

### GitHub Copilot Agent Mode

**Capabilities:**
- Multi-file context awareness
- Autonomous subtask identification
- Self-iteration and error correction
- Terminal command execution
- Runtime error analysis and self-healing

**Available Workspace Tools:**
1. **read_file** - Retrieves file contents with line ranges
2. **Workspace search** - Locates relevant code
3. **Terminal execution** - Runs commands and captures output
4. **Error detection** - Accesses compiler and linting feedback
5. **Apply proposed changes** - Directly modifies files

**Workflow:**
```
1. Analyze codebase context
   ↓
2. Create execution plan
   ↓
3. Read necessary files
   ↓
4. Propose changes across multiple files
   ↓
5. Execute terminal commands (tests, builds, lints)
   ↓
6. Monitor output and errors
   ↓
7. Self-correct in loops until completion
```

**Performance Characteristics:**
- Slower than standard edits mode (multiple requests per prompt)
- Quickly consumes free tier quotas
- Best for complex, open-ended tasks
- Not recommended for well-defined simple tasks

### Copilot Edits Mode

**Capabilities:**
- Inline changes across multiple files
- Faster than agent mode
- Direct file modifications

**Limitations:**
- **10 files maximum** per working set
- **~6,000 lines per file** maximum
- Quality degrades on files >500-5,000 lines

### Copilot Workspace (Enterprise)

**Features:**
- Brainstorm to code in minutes
- Issue-to-implementation automation
- Multi-file simultaneous editing
- Enterprise Managed Users only

**Performance (2026):**
- 40% reduction in time-to-first-commit on enterprise projects (1M+ lines)

### OpenAI Codex Agent

**Model:** GPT-5.2-Codex (2026)

**Execution Environment:**
- Isolated cloud containers
- No internet access during execution
- Pre-installed dependencies only
- Asynchronous operation (minutes to hours)

**Capabilities:**
- Complete task ownership from start to finish
- Writes code, runs tests, iterates until complete
- No human intervention required during execution
- Parallel task execution support

**Key Difference from Copilot:**
- **Codex:** Virtual software engineer assigned complete tasks
- **Copilot:** Real-time coding assistant during active coding

---

## 5. Context Management

### Context Window

**Constraints:**
- **6,000 characters** processed at a time for fast models
- Pulls **60 most relevant lines** from each open file
- Maximum **20 different files** for context
- Only knows about current file + open tabs

**Limitations:**
- Blind to unopened files
- Cannot browse folders/repositories unless explicitly opened
- No automatic awareness of related files
- Limited by transformer architecture

### Working Set Limits

**Copilot Edits:**
- **10 files maximum**
- **~6,000 lines per file**
- User reports indicate this is restrictive for larger projects

**File Size Issues:**
- Quality degrades on larger files
- Problems reported on files as small as 782 lines
- Significant issues on files >5,000 lines
- Copilot may cut files in half when editing

### Search Constraints

- Context window limits searches
- **10-file limit on search results** in Copilot Chat
- No official settings to increase files searched per query

---

## 6. Model Context Protocol (MCP) Integration

### Overview

MCP is an open standard defining how applications share context with LLMs. GitHub has deeply integrated MCP support across Copilot in 2025-2026.

### IDE Support

**Local MCP Servers:**
- VS Code
- JetBrains IDEs
- Xcode
- Eclipse
- Cursor

**Remote MCP Servers:**
- VS Code, Visual Studio, JetBrains IDEs, Xcode, Eclipse, Cursor (OAuth or PAT)
- Windsurf (PAT only)

### GitHub MCP Server

**Repository:** [github/github-mcp-server](https://github.com/github/github-mcp-server)

**Capabilities:**
- Official MCP server by GitHub
- Repository integration
- GitHub API access
- Context-aware AI assistance

### Setup Methods

**OAuth Setup (Recommended):**
- No additional software installation
- Direct setup in JetBrains IDEs or VS Code
- Smoother authentication flow

**Personal Access Token (PAT):**
- Manual token creation required
- Supported across all compatible IDEs

### Permission System

**Enterprise Controls:**
- "MCP servers in Copilot" policy must be enabled for Business/Enterprise
- Policy disabled by default
- Enterprises can enable/disable for members

**Tool-Level Permissions:**
- Tools disabled by default
- Manual enablement required
- Copilot requests confirmation before running tools
- Can grant session-wide approval or folder-specific trust
- Additional permission prompts for sensitive actions

### Integration Capabilities

Through MCP, Copilot connects to:
- GitHub repositories and APIs
- Slack
- Stripe
- Figma
- Databases
- Internal APIs
- Custom MCP-compatible servers

---

## 7. Session Management

### Session Lifecycle

**Tracking:**
- Each session maintains conversation history
- Tool execution records logged
- Usage statistics tracked
- Contextual state preserved
- Sessions persist across CLI launches
- Pause and resume capabilities

**Available Through:**
- Agents panel or page
- Visual Studio Code
- JetBrains IDEs
- Eclipse
- GitHub CLI
- Raycast
- Session logs

**Monitoring:**
- Agent progress tracking
- Token usage statistics
- Session count
- Session length

### MCP Server Lifecycle

**2026 Update:**
- MCP servers shut down after subagent execution completes
- Automatic cleanup

### Execution Timeouts

**Limitations:**
- No custom configuration for command execution timeouts during coding phase
- `timeout-minutes` setting only applies to setup and environment initialization
- Internal timeouts used for active session commands/scripts

### Lifecycle Events

**Important Note:** Custom lifecycle hooks for "before/after execution" are **not directly exposed** as configurable hooks.

**Internal Lifecycle Management:**
- Session persistence
- MCP server lifecycle (startup/shutdown)
- Automatic context gathering on task start
- Automatic cleanup after completion

**No Hook System:**
No documented before/after execution hooks or event handlers available for customization as of early 2026.

---

## 8. GitHub Copilot CLI

### Installation

```bash
npm install -g @github/copilot
```

**Requirements:**
- Node.js 22+
- npm 10+
- Copilot Pro/Business/Enterprise subscription

### Operating Modes

**Interactive Mode:**
- Conversational back-and-forth
- Task refinement through dialogue

**Programmatic Mode:**
- Single prompts via `-p` or `--prompt` flags
- Non-interactive execution

### Key Commands

- `/login` - Authentication flow
- Script generation for bash/shell operations
- Command explanation and approval workflows
- Folder-specific trust management

### Safety Features

- Requires confirmation before file operations
- Session management for conversation contexts
- Command execution with approval

### Primary Use Cases

- Automating repetitive tasks
- Documentation generation
- Learning unfamiliar tools
- System diagnostics
- Git command assistance
- Environment setup and project prototyping

---

## 9. Custom Agents

### Agent Profiles

**Definition:** Specialized versions of Copilot coding agent

**Components:**
- Markdown files (agent profiles)
- Specify prompts
- Define tools
- Configure MCP servers
- Tailor to unique workflows and coding conventions

**Example Structure:**
```yaml
---
name: security-reviewer
description: Security-focused code review agent
excludeAgent: "coding-agent"
tools:
  - security-scanner
  - dependency-checker
mcp-servers:
  - github-security-advisory
---

# Security Review Agent

Perform comprehensive security reviews focusing on:
- OWASP Top 10 vulnerabilities
- Dependency vulnerabilities
- Authentication/authorization issues
- Input validation
- SQL injection risks
```

---

## 10. Limitations and Constraints

### File and Working Set Limitations

**Copilot Edits:**
- **10 files maximum** per working set
- **~6,000 lines per file** limit
- Highly restrictive for larger projects

**Context Window:**
- **6,000 characters** at a time for fast models
- Only **60 most relevant lines** per file
- Maximum **20 files** for context

**File Size Issues:**
- Quality degrades on larger files
- Issues on files as small as 782 lines
- Significant problems on files >5,000 lines
- May cut large files in half

### Codebase Scope Limitations

**Visibility:**
- Only knows current file + open tabs
- Blind to unopened files
- Cannot browse folders/repositories
- No automatic related-file discovery

**Search:**
- Context window limits searches
- **10-file limit** on search results
- No settings to increase search scope

### Performance Issues

**Agent Mode:**
- Slower than standard edits (multiple requests)
- Quickly consumes free tier quotas
- Not optimal for simple tasks

**Enterprise Scale:**
- Performance degradation on projects >1M lines
- 2026 improvements show 40% time-to-first-commit reduction

### Feature Gaps

**Multi-Repository:**
- Agent can only modify single repository per task
- Cannot make changes across multiple repositories
- Opens exactly one PR per task

**Context Awareness:**
- No automatic awareness of related but unopened files
- Requires manual file opening for inclusion

### Rate Limits

- Free tier has strict limits
- Premium requests consume quota faster in agent mode
- Overage charges: $0.04 per premium request beyond limit
- Documented at: [docs.github.com/en/copilot/concepts/rate-limits](https://docs.github.com/en/copilot/concepts/rate-limits)

### Community Feedback (Late 2025/Early 2026)

**User Complaints:**
- Limits too strict for production work
- Some considering alternatives like Cursor
- Quality issues on larger codebases
- Working set restrictions problematic

---

## 11. OpenAI Codex Specific Features

### Cloud Execution Environment

**Architecture:**
- GPT-5.2-Codex model (2026)
- Isolated cloud containers per task
- No internet access during execution
- Pre-installed dependencies only

**Execution Model:**
- Asynchronous long-running tasks
- Minutes to hours per task
- Parallel task processing support
- Background execution

### Task Lifecycle

**Workflow:**
```
Task submission
   ↓
Background execution
   ↓
Parallel task processing
   ↓
Completion notification
   ↓
Result retrieval
```

**Characteristics:**
- Complete task ownership
- No human intervention during execution
- Automatic cleanup after completion
- No persistent session state across tasks

### API Access

**Availability:**
- Responses API only
- Chat Completions API integration
- Beta endpoints for specialized tasks

**Pricing (codex-mini-latest):**
- **Input:** $1.50 per 1M tokens
- **Output:** $6 per 1M tokens
- **Prompt Caching Discount:** 75%

### Limitations

**Network Isolation:**
- No internet access during execution
- Limited to pre-installed dependencies
- Cannot fetch external resources dynamically

**Repository Scope:**
- Works with explicitly provided GitHub repositories
- Cannot autonomously discover related repositories

**Execution Time:**
- Tasks can take minutes to hours
- Not suitable for real-time assistance
- Asynchronous-only operation

---

## 12. Pricing (2026)

### Five Tiers

**1. Copilot Free - $0/month**
- 2,000 code completions per month
- 50 premium requests per month
- Individual use only
- Limited feature access

**2. Copilot Pro - $10/month ($100/year)**
- **Unlimited standard code completions**
- **300 premium requests per month**
- Boilerplate code, simple logic, syntax auto-fill
- **Free for:**
  - Verified students
  - Teachers
  - Maintainers of popular open source projects

**3. Copilot Pro+ - $39/month ($390/year)**
- **1,500 premium requests per month**
- **Access to all AI models:**
  - Claude Opus 4
  - OpenAI o3
  - GPT-4o
  - Gemini 1.5 Pro
  - Claude 3.5 Sonnet
- Full model selection capability
- Highest level for individual developers

**4. Copilot Business - $19/user/month**
- For organizations on GitHub Free or GitHub Team
- For enterprises on GitHub Enterprise Cloud
- Copilot coding agent included
- Centralized management
- Copilot policy control

**5. Copilot Enterprise - $39/user/month**
- Requires GitHub Enterprise Cloud
- All Copilot Business features
- Copilot Workspace for Enterprise Managed Users
- Advanced security features
- Organization-wide customization
- Priority support

### Additional Costs

**Overage:**
- $0.04 USD per premium request beyond plan limit

**Separate from GitHub Hosting:**
- GitHub Pro: $4/month (does not include Copilot)
- GitHub Enterprise: $21/month (does not include Copilot)
- Copilot requires separate subscription

### Premium Requests

**Definition:** Use more advanced models and capabilities

**Examples:**
- Agent mode operations
- Complex multi-file edits
- Advanced code generation
- Deep codebase analysis

---

## 13. Terminology

**GitHub Copilot Terms:**
- **Agent Mode** - Autonomous multi-step execution
- **Edits Mode** - Direct inline file modifications
- **Working Set** - Collection of files being edited (max 10)
- **Slash Commands** - Built-in command shortcuts (`/fix`, `/test`)
- **Prompt Files** - Reusable `.prompt.md` templates
- **Custom Instructions** - Project-specific AI guidance
- **MCP Server** - Model Context Protocol integration point
- **Session** - Conversation context with history

**OpenAI Codex Terms:**
- **Cloud Task** - Asynchronous execution environment
- **Code Review Endpoint** - Beta API for reviews
- **Responses API** - Primary API for Codex access

**Comparison to Other Platforms:**
- **Agent Mode** ≈ Claude Code subagent ≈ Windsurf Cascade
- **Custom Instructions** ≈ CLAUDE.md ≈ Windsurf Always-On Rules
- **Prompt Files** ≈ Claude Code skills ≈ Windsurf workflows
- **MCP Server** = MCP Server (same protocol)

---

## 14. Community Resources

**Official Repositories:**
- [github/awesome-copilot](https://github.com/github/awesome-copilot) - Community instructions and configurations
- [github/github-mcp-server](https://github.com/github/github-mcp-server) - Official MCP server
- [SebastienDegodez/copilot-instructions](https://github.com/SebastienDegodez/copilot-instructions) - Best practices codebase

**Examples and Patterns:**
- DDD (Domain-Driven Design) instructions
- Clean Architecture guidelines
- Testing conventions
- Commit message standards
- Language-specific best practices

---

## Sources

### GitHub Documentation
- [GitHub Copilot Chat cheat sheet](https://docs.github.com/en/copilot/reference/cheat-sheet)
- [Adding repository custom instructions](https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot)
- [About GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)
- [GitHub Copilot features](https://docs.github.com/en/copilot/get-started/features)
- [Using GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- [Tracking GitHub Copilot's sessions](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions)
- [Plans for GitHub Copilot](https://docs.github.com/en/copilot/get-started/plans)
- [Rate limits for GitHub Copilot](https://docs.github.com/en/copilot/concepts/rate-limits)

### MCP Integration
- [Setting up the GitHub MCP Server](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/set-up-the-github-mcp-server)
- [Extending Copilot Chat with MCP servers](https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp)
- [About Model Context Protocol](https://docs.github.com/en/copilot/concepts/context/mcp)

### GitHub Blog & Announcements
- [GitHub Copilot CLI 101](https://github.blog/ai-and-ml/github-copilot-cli-101-how-to-use-github-copilot-from-the-command-line/)
- [Unlocking Copilot code review](https://github.blog/ai-and-ml/unlocking-the-full-power-of-copilot-code-review-master-your-instructions-files/)
- [5 tips for better custom instructions](https://github.blog/ai-and-ml/github-copilot/5-tips-for-writing-better-custom-instructions-for-copilot/)
- [GitHub Copilot Introduces Agent Mode](https://github.com/newsroom/press-releases/agent-mode)

### OpenAI Resources
- [Codex | OpenAI](https://openai.com/codex/)
- [OpenAI for Developers in 2025](https://developers.openai.com/blog/openai-for-developers-2025/)
- [GPT-5-Codex Model](https://platform.openai.com/docs/models/gpt-5-codex)

### VS Code Integration
- [Use custom instructions in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
- [Introducing GitHub Copilot agent mode](https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode)
- [GitHub Copilot in VS Code cheat sheet](https://code.visualstudio.com/docs/copilot/reference/copilot-vscode-features)
