# AIW CLI

CLI package for launching and managing Claude Code with AIW hooks and configuration.

## Commands

### `aiw launch`

Launch Claude Code with AIW configuration (sandbox disabled, tmux-first when outside tmux).

```bash
aiw launch
aiw launch --debug        # Enable verbose logging
aiw launch --quiet        # Suppress informational output
aiw launch --no-tmux      # Bypass tmux auto-launch
aiw launch --tmux-session aiw-main  # Reuse a named tmux session
```

Creates a fresh tmux session by default when auto-launching. On Windows (outside tmux), opens a new mintty window first.

Aliases:

```bash
alias codex='aiw launch --codex'
alias devin='aiw launch --devin'
```

### `aiw init`

Initialize AIW templates in a project.

```bash
aiw init --interactive             # Interactive setup wizard
aiw init --method cc-native        # Initialize CC-Native template
aiw init --method cc-native --ide windsurf        # Install for Windsurf
aiw init --method cc-native --ide claude --ide windsurf  # Multiple IDEs
```

### `aiw branch <branchName>`

Create git worktree in sibling folder and auto-launch Claude Code.

```bash
aiw branch feature-name     # Creates ../aiwcli-feature-name worktree
aiw branch fix-bug-123      # Creates ../aiwcli-fix-bug-123 worktree
```

Requirements: must be in a git repo root, target folder/branch must not exist.

### `aiw clean` / `aiw clear`

```bash
aiw clean                    # Remove _output/
aiw clean --method cc-native # One method
aiw clean --all              # Everything
aiw clear                    # Full uninstall (workflow folders, output, IDE config)
```

---

## Requirements

- Claude Code 0.1.0+
- Node.js 18+
- Bun (for TypeScript hooks)
- Git

---

## Troubleshooting

### Windows: Symlink Permission Denied

`aiw init` fails with EPERM:

1. **Developer Mode** (recommended): Settings > Privacy & Security > For developers > Enable
2. **Or** run as Administrator

### Version Compatibility

```bash
aiw launch --debug    # See version info
claude --version      # Check Claude Code version
```

Known incompatible: v0.0.9. Upgrade with `npm install -g @anthropic-ai/claude-code@latest`.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `AIW_DIR` | Custom AIW config directory (default: `~/.aiw`) |
| `NO_COLOR` | Disable colored output |
| `FORCE_COLOR` | Force colors even outside TTY (`1`=basic, `2`=256, `3`=truecolor) |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error (runtime failures) |
| `2` | Invalid usage (bad args/flags) |
| `3` | Environment error (missing prerequisites, permissions) |

---

## Shell Completion

```bash
# Bash -- add to ~/.bashrc
eval "$(aiw autocomplete:script bash)"

# Zsh -- add to ~/.zshrc
eval "$(aiw autocomplete:script zsh)"

# PowerShell
aiw autocomplete powershell

# Refresh cache after updates
aiw autocomplete --refresh-cache
```

---

## Command Development Guide

### Architecture

Uses [Oclif](https://oclif.io). File path = command name: `src/commands/launch.ts` -> `aiw launch`.

### Adding a Command

1. Create file in `src/commands/`:

```typescript
import {Flags} from '@oclif/core'
import BaseCommand from '../lib/base-command.js'

export default class Status extends BaseCommand {
  static override description = 'Show AIW status'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Status)
    this.log('Status output')
  }
}
```

2. Add tests in `test/commands/`.

### Standard Flags

All commands inherit from `BaseCommand`: `--debug` (`-d`), `--help` (`-h`), `--quiet` (`-q`).

### Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Command files | kebab-case | `launch.ts` |
| Command classes | PascalCase | `Launch` |
| Flags | camelCase | `debug`, `aiwDir` |
| Constants | UPPER_SNAKE_CASE | `EXIT_CODES.SUCCESS` |

Import order: Node builtins (with `node:` prefix) > external packages > internal imports > type imports.

### Error Handling

```typescript
import {EXIT_CODES} from '../types/index.js'

this.error(
  'Configuration file not found. Run `aiw init` to initialize.',
  {exit: EXIT_CODES.ENVIRONMENT_ERROR}
)
```

### Rules

**Must:**
- Extend `BaseCommand`, inherit `BaseCommand.baseFlags`
- Use `.js` extension in all imports (ESM)
- Add `node:` prefix for Node builtins
- Use `this.error()` not `process.exit()`
- Provide both short and long flag forms

**Must not:**
- Call `process.exit()` directly
- Create utils in `src/utils/` or `src/helpers/` (use `src/lib/`)
- Use `I` prefix on interfaces
- Skip `.js` extension in imports
- Use Promise chains (use async/await)

### Project Structure

```
packages/cli/
├── src/
│   ├── commands/
│   │   ├── branch.ts
│   │   ├── launch.ts
│   │   └── init/index.ts
│   ├── lib/
│   │   ├── base-command.ts
│   │   ├── config.ts
│   │   ├── debug.ts
│   │   ├── errors.ts
│   │   └── spawn.ts
│   └── types/index.ts
├── test/
│   ├── commands/
│   ├── lib/
│   └── integration/
└── README.md
```
