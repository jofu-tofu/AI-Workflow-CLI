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
aiwcli launch

# Initialize BMAD workflow in a project
aiwcli init bmad

# Get help
aiwcli help
```

## Features

- 🚀 **Claude Code Integration** - Seamless integration with Claude Code
- 📋 **BMAD Workflows** - Built-in BMAD (Build, Measure, Analyze, Deploy) templates
- 🔧 **Project Initialization** - Quickly set up AI-powered workflows
- ⚡ **Fast & Efficient** - Built on oclif for optimal performance

## Documentation

- [Migration Guide](./MIGRATION_PLAN.md) - Migrating from PAI CLI
- [Development Guide](./DEVELOPMENT.md) - Development setup and guidelines
- [Claude Instructions](./CLAUDE.md) - Instructions for Claude Code integration

## Environment Variables

- `AIWCLI_HOME` - Main installation directory (default: `~/.aiwcli`)
- `AIWCLI_CONFIG` - Configuration file path (optional)
- `AIWCLI_DIR` - Root directory for hooks and scripts (optional)
- `DA` - Assistant name (optional)

See [.env.example](./.env.example) for a complete list.

## Migration from PAI CLI

If you're migrating from PAI CLI, see the comprehensive [Migration Guide](./MIGRATION_PLAN.md) for detailed instructions.

**Quick migration:**
```bash
npm uninstall -g pai-cli
npm install -g aiwcli
```

Legacy environment variables (`PAI_HOME`, `PAI_DIR`) are still supported with deprecation warnings.

## Status

🚧 **Active Development** - This project is currently in active development following the migration from PAI CLI.

## License

MIT License - see [LICENSE](./LICENSE) for details

## Repository

- **GitHub:** https://github.com/jofu-tofu/AI-Workflow-CLI
- **npm:** https://npmjs.com/package/aiwcli
- **Issues:** https://github.com/jofu-tofu/AI-Workflow-CLI/issues

## Contributing

Contributions are welcome! Please see the contributing guidelines (coming soon).

---

**Note:** AI Workflow CLI is the successor to PAI CLI. For migration assistance, see the [Migration Guide](./MIGRATION_PLAN.md).
