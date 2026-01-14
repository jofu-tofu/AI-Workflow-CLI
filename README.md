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

# Get help
aiw help
```

## Features

- **Claude Code Integration** - Seamless integration with Claude Code
- **BMAD Workflows** - Built-in BMAD (Build, Measure, Analyze, Deploy) templates
- **Project Initialization** - Quickly set up AI-powered workflows
- **Fast & Efficient** - Built on oclif for optimal performance

## Documentation

- [Project Overview](./PROJECT.md) - Project vision and goals
- [Development Roadmap](./ROADMAP.md) - Current progress and planned phases
- [Development Guide](./DEVELOPMENT.md) - Development setup and guidelines
- [Claude Instructions](./CLAUDE.md) - Instructions for Claude Code integration

## Environment Variables

- `AIW_DIR` - Main installation directory (default: `~/.aiw`)
- `AIW_CONFIG` - Configuration file path (optional)
- `DA` - Assistant name (optional)

See [.env.example](./.env.example) for a complete list.

## Status

Version 0.0.0 - Initial release.

## License

MIT License

## Repository

- **GitHub:** https://github.com/jofu-tofu/AI-Workflow-CLI
- **npm:** https://npmjs.com/package/aiwcli
- **Issues:** https://github.com/jofu-tofu/AI-Workflow-CLI/issues

## Contributing

Contributions are welcome! Please see the contributing guidelines (coming soon).
