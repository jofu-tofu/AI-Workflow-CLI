# AI Workflow CLI

AI Workflow CLI - A command-line interface for AI-powered workflows.

## Overview

AI Workflow CLI is a powerful command-line tool that integrates with Claude Code to provide enhanced AI-assisted development capabilities. It provides commands for launching Claude Code sessions, initializing project workflows, and managing AI-powered development tasks.

## Installation

```bash
npm install -g aiwcli
```

## Quick Start

```bash
# Launch Claude Code with AI Workflow CLI context
aiw launch

# Initialize BMAD workflow in a project
aiw init --method bmad

# Initialize with specific IDE (e.g., Windsurf)
aiw init --method bmad --ide windsurf

# Initialize with multiple IDEs
aiw init --method bmad --ide claude --ide windsurf

# Create a new git worktree and auto-launch Claude Code
aiw branch feature-name

# Get help
aiw help
```

## Features

- **Claude Code Integration** - Seamless integration with Claude Code
- **Template System** - Cross-platform AI assistant templates with universal format
- **Multi-IDE Support** - Works with Claude Code, Windsurf, and more
- **BMAD Workflows** - Built-in BMAD (Build, Measure, Analyze, Deploy) templates
- **Project Initialization** - Quickly set up AI-powered workflows
- **Fast & Efficient** - Built on oclif for optimal performance

## Documentation

- [Development Guide](./DEVELOPMENT.md) - Development setup and guidelines
- [Claude Instructions](./CLAUDE.md) - Instructions for Claude Code integration
- [Template User Guide](./docs/TEMPLATE-USER-GUIDE.md) - How to create and use templates
- [Best Practices](./docs/BEST-PRACTICES.md) - Best practices and tutorials

## Environment Variables

- `AIW_DIR` - Main installation directory (default: `~/.aiw`)
- `AIW_CONFIG` - Configuration file path (optional)
- `DA` - Assistant name (optional)

See [.env.example](./.env.example) for a complete list.

## Commands

- `aiw launch` - Launch Claude Code with AIW configuration (sandbox disabled)
- `aiw init` - Initialize AIW tools and integrations with template methods (BMAD, etc.)
- `aiw branch <branchName>` - Create git worktree in sibling folder and auto-launch Claude Code
- `aiw help` - Get help with available commands

## Status

Version 1.0.0 - Complete cross-platform template system with CLI conversion tools.

## License

MIT License

## Repository

- **GitHub:** https://github.com/jofu-tofu/AI-Workflow-CLI
- **npm:** https://npmjs.com/package/aiwcli
- **Issues:** https://github.com/jofu-tofu/AI-Workflow-CLI/issues

## Contributing

Contributions are welcome! Please see the contributing guidelines (coming soon).
