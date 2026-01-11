PAI CLI - Personal AI Infrastructure CLI
=========================================

Command-line interface for launching and managing Claude Code with Personal AI Infrastructure (PAI) configuration. Provides seamless integration with PAI hooks, automatic sandbox permissions, and scriptable automation support.


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/pai-cli.svg)](https://npmjs.org/package/pai-cli)
[![Downloads/week](https://img.shields.io/npm/dw/pai-cli.svg)](https://npmjs.org/package/pai-cli)

## Installation

### Install Globally (Recommended)

```bash
# Navigate to the pai-cli directory
cd ~/.pai/pai-cli  # or C:\Users\YOUR_USERNAME\.pai\pai-cli on Windows

# Install dependencies
npm install

# Build the CLI
npm run build

# Install globally
npm install -g .
```

**Verify installation:**

```bash
pai --version
pai --help
```

### Run Without Global Install

If you prefer not to install globally, you can run commands directly from the pai-cli directory:

```bash
cd ~/.pai/pai-cli
./bin/run.js <command>   # Unix/Mac
.\bin\run.cmd <command>  # Windows
```

**Example:**

```bash
./bin/run.js launch      # Unix/Mac
.\bin\run.cmd launch     # Windows
```

## Requirements

**Minimum Claude Code Version:** 0.1.0 or later

PAI CLI automatically detects your Claude Code version and warns if incompatibilities are detected. The CLI will continue to launch even with version warnings (graceful degradation).

### Known Incompatible Versions

- **0.0.9** - Has known issues with PAI CLI integration

If you encounter version compatibility warnings, upgrade Claude Code to the latest version:

```bash
# Upgrade Claude Code to latest version
npm install -g @anthropic-ai/claude-code@latest
```

## Troubleshooting

### Windows Setup: Symlink Permission Denied

**Symptom:** `pai init` fails with "Permission denied creating symlink" or "EPERM: operation not permitted"

**Solution (choose one):**

**Option 1: Enable Developer Mode (Recommended)**
1. Open Windows Settings
2. Go to "Privacy & Security" → "For developers"
3. Enable "Developer Mode"
4. Run `pai init` again

**Option 2: Run as Administrator**
1. Open PowerShell or Command Prompt as Administrator
2. Run `pai init`

Developer Mode is recommended as it allows symlink creation without elevated privileges for all future operations.

### Version Compatibility Issues

**Symptom:** Warning message about Claude Code version incompatibility

**Solution:**
1. Check your current Claude Code version: `claude --version`
2. Upgrade to version 0.1.0 or later (see above)
3. If version cannot be detected, ensure Claude Code is installed and in your PATH

**Debug Mode:**

Use `--debug` flag to see detailed version information:

```bash
pai launch --debug
```

Debug output includes:
- Resolved PAI_DIR path
- Claude Code version detection
- Compatibility check results
- Spawn arguments and configuration

### Version Check Failed

If `claude --version` fails or hangs:
- Verify Claude Code is installed: `which claude` (Unix) or `where claude` (Windows)
- Check PATH includes Claude Code installation directory
- Reinstall Claude Code if necessary

PAI CLI assumes compatibility if version cannot be determined and will proceed with launch.

## Environment Variables

PAI CLI respects standard environment variables for controlling output behavior:

### NO_COLOR

Disables colored output. Useful for scripts or when colors interfere with output processing.

```bash
# Disable all colors
NO_COLOR=1 pai launch
```

### FORCE_COLOR

Forces colored output even when not in a TTY (terminal). Useful for CI environments that support colors.

```bash
# Force colors (level 1 = basic 16 colors)
FORCE_COLOR=1 pai launch | less -R

# Force 256 colors
FORCE_COLOR=2 pai launch

# Force truecolor (16 million colors)
FORCE_COLOR=3 pai launch
```

### PAI_DIR

Customize the PAI configuration directory (default: `~/.pai`):

```bash
PAI_DIR=/custom/path pai launch
```

## Output Behavior

PAI CLI automatically adapts its output based on the execution context:

### Interactive Terminal (TTY)
- Colors enabled
- Progress spinners shown
- Rich formatting

### Piped or Redirected Output
- Colors automatically disabled
- Spinners suppressed
- Clean, parseable text output

```bash
# Example: Piping to other commands
pai launch --help | grep "OPTIONS"

# Example: Redirecting to file
pai launch --help > help.txt

# Example: Processing with tools
pai launch 2>&1 | tee output.log
```

This automatic behavior ensures PAI CLI works seamlessly in both interactive use and automation scripts without requiring manual configuration.

### Quiet Mode

For scripting and automation where you want minimal output, use the `--quiet` (or `-q`) flag to suppress informational messages while preserving errors:

```bash
# Suppress informational output
pai launch --quiet

# Short form
pai launch -q
```

**What Gets Suppressed:**
- Informational messages (`logInfo`)
- Success messages (`logSuccess`)
- Warning messages (`logWarning`)
- Progress spinners

**What's Always Shown:**
- Error messages (stderr) - critical for debugging failures
- Essential data output (stdout) - for parsing in scripts

**Example Usage:**

```bash
# Silent execution in scripts
pai launch --quiet
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "Launch failed with code $EXIT_CODE"
fi

# Combine with piping
pai launch --quiet 2>&1 | tee log.txt

# CI/CD pipelines
pai launch --quiet || exit 1
```

**Quiet Mode vs. Piping:**
- **Piping**: Automatically disables colors and spinners
- **Quiet Mode**: Explicitly suppresses informational text
- **Combined**: Minimal clean output for scripting

## Command Chaining

PAI CLI is designed for seamless integration into command chains and pipelines, enabling complex automation workflows.

### Chaining with && (Success Chains)

Commands can be chained using `&&` to execute multiple operations sequentially, stopping at the first failure:

```bash
# Execute multiple commands - stops if any fails
pai launch --help && pai init --help

# Chain with other tools
pai launch --help && echo "Launch command is available"

# Complex chains
pai init && pai launch --quiet && echo "Setup and launch complete"
```

**How It Works:**
- Exit code `0` (success) → chain continues to next command
- Exit code `1/2/3` (error) → chain stops, subsequent commands don't run
- Errors always output to stderr for visibility

### Piping Output

PAI CLI produces clean stdout that works seamlessly with standard Unix tools:

```bash
# Pipe to grep, awk, jq, etc.
pai launch --help | grep "Launch"

# Combine quiet mode for cleanest output
pai launch --help --quiet | wc -l

# Multi-stage pipelines
pai launch --help | grep "flags" | sort
```

**Output Separation:**
- **stdout**: Data only (help text, command output)
- **stderr**: Errors and warnings only
- **Status messages**: Automatically suppressed when piped

### Cross-Platform Compatibility

**Windows PowerShell:**
```powershell
# && chains work in PowerShell 7+
pai launch --help && echo "Success"

# Pipes work universally
pai launch --help | Select-String "Launch"

# Legacy CMD/PowerShell 5.1 uses semicolon for sequential execution
pai launch --help; echo "Runs regardless of success"
```

**Unix/macOS (Bash/Zsh):**
```bash
# Standard && chaining
pai launch --help && echo "Success"

# Standard piping
pai launch --help | grep "Launch"

# Complex pipelines
pai launch --help | grep "flags" | awk '{print $1}'
```

### Practical Examples

**CI/CD Pipelines:**
```bash
# Stop pipeline on first failure
pai init && pai launch --quiet && other-command || exit 1
```

**Scripting with Error Handling:**
```bash
#!/bin/bash
if pai launch --quiet; then
  echo "Launch succeeded"
else
  echo "Launch failed with code $?" >&2
  exit 1
fi
```

**Data Processing:**
```bash
# Extract and process help text
pai launch --help --quiet | grep -E "^  -" | sort
```

## Exit Codes

PAI CLI uses standardized exit codes to enable reliable error handling in scripts and automation pipelines.

### Exit Code Reference

| Code | Meaning | When It Occurs |
|------|---------|----------------|
| `0` | Success | Command completed successfully without errors |
| `1` | General Error | Unexpected runtime failures, system errors, unhandled exceptions |
| `2` | Invalid Usage | Invalid arguments, unknown flags, missing required parameters |
| `3` | Environment Error | Missing prerequisites (Claude Code not installed, PAI_DIR not found, permission denied) |

### Checking Exit Codes

**Bash / Zsh (Unix, macOS, Linux, Git Bash, WSL):**

```bash
# Check last command's exit code
pai launch
echo $?  # 0 = success, non-zero = error

# Conditional execution with &&
pai launch && echo "Success!"

# Fallback with ||
pai launch || echo "Failed with code $?"

# Store and check exit code
pai launch
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "Launch succeeded"
elif [ $EXIT_CODE -eq 3 ]; then
  echo "Environment error - run 'pai init' or install Claude Code"
else
  echo "Command failed with exit code $EXIT_CODE"
fi

# Chain commands (stops on first failure)
pai init && pai launch && echo "All commands succeeded"
```

**PowerShell (Windows):**

```powershell
# Check last command's exit code
pai launch
echo $LASTEXITCODE  # 0 = success, non-zero = error

# Conditional execution
pai launch
if ($LASTEXITCODE -eq 0) {
    Write-Host "Success!"
} elseif ($LASTEXITCODE -eq 3) {
    Write-Host "Environment error - run 'pai init' or install Claude Code"
} else {
    Write-Host "Failed with exit code $LASTEXITCODE"
}

# Throw on error
$ErrorActionPreference = "Stop"
pai launch  # Will throw exception if exit code is non-zero

# Continue on error but check result
$ErrorActionPreference = "Continue"
pai launch
if ($LASTEXITCODE -ne 0) {
    Write-Error "Launch failed"
    exit $LASTEXITCODE
}
```

**CMD (Windows):**

```cmd
REM Check exit code with %ERRORLEVEL%
pai launch
echo %ERRORLEVEL%

REM Conditional execution with &&
pai init && pai launch && echo Success!

REM Check exit code in batch script
pai launch
if %ERRORLEVEL% EQU 0 (
    echo Success
) else if %ERRORLEVEL% EQU 3 (
    echo Environment error
) else (
    echo Failed with code %ERRORLEVEL%
)
```

### Common Exit Code Scenarios

**Success (0):**
- Help displayed: `pai launch --help`
- Setup completed successfully: `pai init`
- Claude Code launched and exited normally: `pai launch`

**General Error (1):**
- Unexpected runtime failures
- Network errors during operation
- File system errors (other than missing prerequisites)
- Unknown/unhandled exceptions

**Invalid Usage (2):**
- Unknown flag: `pai launch --invalid-flag`
- Unknown command: `pai invalid-command`
- Missing required argument: `pai hello` (without PERSON arg)
- Conflicting options

**Environment Error (3):**
- Claude Code not installed: `pai launch` (when `claude` not in PATH)
- PAI_DIR not found: `pai init` (when ~/.pai doesn't exist and PAI_DIR not set)
- Permission denied: `pai init` (on Windows without Developer Mode or admin rights)
- Version incompatibility blocking operation

### Exit Codes in CI/CD

Exit codes enable reliable automation in continuous integration and deployment pipelines:

```yaml
# GitHub Actions example
- name: Launch PAI
  run: pai launch
  # Automatically fails workflow on non-zero exit

# With custom error handling
- name: Launch PAI with fallback
  run: |
    pai launch || {
      EXIT_CODE=$?
      if [ $EXIT_CODE -eq 3 ]; then
        echo "Environment setup needed"
        exit 1
      fi
      exit $EXIT_CODE
    }
```

### Getting Help on Exit Codes

Every command documents its exit codes in help text:

```bash
pai launch --help  # See EXIT CODES section
pai init --help   # See EXIT CODES section
```

## Shell Completion

PAI CLI supports tab completion for commands, subcommands, and flags in Bash, Zsh, and PowerShell.

### Installation

**Bash**

Add to your `~/.bashrc`:

```bash
eval "$(pai autocomplete:script bash)"
```

Or run this one-liner:

```bash
printf "eval \"\$(pai autocomplete:script bash)\"" >> ~/.bashrc && source ~/.bashrc
```

**Note:** If your terminal starts as a login shell, modify `~/.bash_profile` or `~/.profile` instead:

```bash
printf "eval \"\$(pai autocomplete:script bash)\"" >> ~/.bash_profile && source ~/.bash_profile
```

**Zsh**

Add to your `~/.zshrc`:

```bash
eval "$(pai autocomplete:script zsh)"
```

Or run this one-liner:

```bash
printf "eval \"\$(pai autocomplete:script zsh)\"" >> ~/.zshrc && source ~/.zshrc
```

**PowerShell**

Run the autocomplete command and follow the instructions:

```powershell
pai autocomplete powershell
```

The command will provide platform-specific setup instructions. Typically:

```powershell
# Create profile directory if it doesn't exist
New-Item -Type Directory -Path (Split-Path -Parent $PROFILE) -ErrorAction SilentlyContinue

# Add autocomplete to profile and reload
Add-Content -Path $PROFILE -Value (Invoke-Expression -Command "pai autocomplete script powershell"); .$PROFILE
```

**Optional**: Enable menu-style completion in PowerShell:

```powershell
Set-PSReadlineKeyHandler -Key Tab -Function MenuComplete
```

### Usage

After installation, you can use tab completion:

```bash
# Command completion
pai la<TAB>        # Completes to "pai launch"

# Subcommand completion (when available)
pai init <TAB>     # Shows available subcommands

# Flag completion
pai launch --<TAB> # Shows available flags

# Command listing
pai <TAB>          # Shows all available commands
```

### Troubleshooting

**Bash**

If completion doesn't work:
- Check if `~/.bashrc` is sourced (may need `~/.bash_profile` for login shells)
- Verify completion script loaded: `type _pai_completion`
- Restart your shell: `exec bash`

**Zsh**

If completion doesn't work:
- Check permissions: `compaudit -D`
- Rebuild completion cache: `rm ~/.zcompdump* && compinit`
- Restart your shell: `exec zsh`

**PowerShell**

If completion doesn't work:
- Check execution policy: `Get-ExecutionPolicy`
- May need: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
- Restart PowerShell

**Refresh Completion Cache**

If commands or flags change after updates:

```bash
pai autocomplete --refresh-cache
```

Or use the short form:

```bash
pai autocomplete -r
```

## Scripting Examples

PAI CLI is designed for seamless integration into automation scripts, shell pipelines, and CI/CD workflows. All examples work on Windows (PowerShell/CMD/Git Bash), macOS, and Linux.

### Basic Piping

Pipe PAI CLI output to standard Unix tools for filtering and processing:

```bash
# Search help for specific command
pai --help | grep "launch"

# Find all available flags
pai launch --help | grep -E "^  -"

# Extract version number
pai --version | cut -d' ' -f2

# Count lines of output
pai --help | wc -l
```

**PowerShell equivalent:**
```powershell
# Search help
pai --help | Select-String "launch"

# Find flags
pai launch --help | Select-String "^  -"
```

### Command Chaining

Chain multiple commands together with proper error handling:

**Bash/Zsh (Unix, macOS, Linux, Git Bash):**
```bash
# Sequential execution - stops on first failure
pai init && pai launch

# Multiple commands
pai --version && pai init && pai launch

# Continue on error
pai init || echo "Setup failed"

# Error handling with exit codes
if pai launch; then
  echo "Launch succeeded"
else
  EXIT_CODE=$?
  echo "Launch failed with exit code $EXIT_CODE"
fi
```

**PowerShell (Windows):**
```powershell
# Sequential execution (PowerShell 7+)
pai init && pai launch

# Error handling
pai launch
if ($LASTEXITCODE -eq 0) {
    Write-Host "Success"
} else {
    Write-Host "Failed with exit code $LASTEXITCODE"
}
```

**CMD (Windows):**
```cmd
REM Sequential execution
pai init && pai launch && echo Success

REM Error handling
pai launch
if %ERRORLEVEL% EQU 0 (
    echo Success
) else (
    echo Failed with code %ERRORLEVEL%
)
```

### Quiet Mode for Scripts

Suppress informational output while preserving errors:

```bash
# Silent execution in automation
pai launch --quiet

# Short form
pai launch -q

# Capture exit code
pai launch --quiet
EXIT_CODE=$?

# Only errors shown (goes to stderr)
pai launch --quiet 2>errors.log

# Combine with piping for cleanest output
pai launch --help --quiet | wc -l
```

**Use cases for `--quiet`:**
- CI/CD pipelines where minimal output is desired
- Automated scripts that parse command output
- Reducing noise in log files
- Background processes

### Exit Code Handling

PAI CLI uses standardized exit codes for reliable automation:

| Code | Meaning | Example Scenarios |
|------|---------|-------------------|
| `0` | Success | Command completed, help displayed, setup successful |
| `1` | General Error | Runtime failures, unexpected errors |
| `2` | Invalid Usage | Unknown flags, invalid arguments |
| `3` | Environment Error | Claude Code not installed, permissions denied |

**Bash/Zsh examples:**
```bash
# Basic exit code check
pai launch
if [ $? -eq 0 ]; then
  echo "Success"
fi

# Handle specific exit codes
pai launch
EXIT_CODE=$?
case $EXIT_CODE in
  0)
    echo "Launch successful"
    ;;
  2)
    echo "Invalid usage - check arguments"
    ;;
  3)
    echo "Environment issue - is Claude Code installed?"
    pai init  # Try setup
    ;;
  *)
    echo "Unexpected error: $EXIT_CODE"
    ;;
esac

# Use exit codes in pipelines
pai init && pai launch || {
  echo "Failed at exit code $?"
  exit 1
}
```

**PowerShell examples:**
```powershell
# Check last exit code
pai launch
if ($LASTEXITCODE -eq 0) {
    Write-Host "Success"
}

# Handle specific codes
pai launch
switch ($LASTEXITCODE) {
    0 { Write-Host "Success" }
    2 { Write-Host "Invalid usage" }
    3 { Write-Host "Environment issue"; pai init }
    default { Write-Host "Error: $LASTEXITCODE" }
}

# Fail on error
$ErrorActionPreference = "Stop"
pai launch  # Will throw if non-zero exit code
```

### Shell Completion Usage

After installing shell completion (see [Shell Completion](#shell-completion) section):

```bash
# Command completion
pai la<TAB>        # Completes to "pai launch"

# Show all commands
pai <TAB>          # Lists: autocomplete, hello, help, launch, setup

# Flag completion
pai launch --<TAB> # Shows: --debug, --help, --quiet

# Short flag completion
pai launch -<TAB>  # Shows: -d, -h, -q
```

**Benefits:**
- Faster command entry
- Discover available commands without `--help`
- Reduce typos
- Learn flag names interactively

### CI/CD Pipeline Examples

**GitHub Actions:**
```yaml
name: Deploy with PAI

on: [push]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup PAI
        run: |
          npm install -g pai-cli
          pai init

      - name: Launch Claude Code
        run: pai launch --quiet || exit $?

      - name: Check exit code
        if: failure()
        run: |
          echo "PAI launch failed"
          echo "Exit code: $?"
```

**GitLab CI:**
```yaml
deploy:
  script:
    - pai init
    - pai launch --quiet
  only:
    - main
```

**Jenkins:**
```groovy
pipeline {
    agent any
    stages {
        stage('Setup') {
            steps {
                sh 'pai init'
            }
        }
        stage('Launch') {
            steps {
                sh 'pai launch --quiet || exit $?'
            }
        }
    }
}
```

### Automation Script Examples

**Deployment script (Bash):**
```bash
#!/bin/bash
set -e  # Exit on error

echo "Starting deployment..."

# Setup PAI if not configured
if ! pai --version > /dev/null 2>&1; then
  echo "PAI CLI not found"
  exit 3
fi

# Run setup
pai init || {
  echo "Setup failed with code $?"
  exit 1
}

# Launch with quiet mode
pai launch --quiet

echo "Deployment complete"
```

**Monitoring script (Bash):**
```bash
#!/bin/bash

# Check PAI status every 5 minutes
while true; do
  if pai --version --quiet; then
    echo "[$(date)] PAI CLI operational"
  else
    echo "[$(date)] PAI CLI check failed: exit code $?"
  fi
  sleep 300
done
```

**Batch processing (PowerShell):**
```powershell
# Process multiple operations with PAI
$operations = @("setup", "launch")

foreach ($op in $operations) {
    Write-Host "Running: pai $op"

    & pai $op --quiet

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Operation $op failed with code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

Write-Host "All operations completed successfully"
```

### Tips for Scripting

**1. Always use `--quiet` in scripts:**
```bash
# Good: Clean output
pai launch --quiet

# Avoid: Verbose output pollutes logs
pai launch
```

**2. Check exit codes explicitly:**
```bash
# Good: Explicit error handling
pai launch
if [ $? -ne 0 ]; then
  handle_error
fi

# Risky: Assumes success
pai launch
continue_anyway
```

**3. Pipe stderr to log files:**
```bash
# Capture errors for debugging
pai launch 2>errors.log

# Capture both stdout and stderr
pai launch >output.log 2>&1
```

**4. Use timeout for long operations:**
```bash
# Bash: timeout after 60 seconds
timeout 60 pai launch || echo "Timeout or error"

# PowerShell: timeout after 60 seconds
Start-Process -Wait -Timeout 60 -NoNewWindow pai -ArgumentList "launch"
```

**5. Combine with other CLI tools:**
```bash
# Log with timestamp
pai launch --quiet 2>&1 | while read line; do
  echo "$(date -Is) $line"
done

# Notify on completion (Linux/macOS)
pai launch --quiet && notify-send "PAI launch complete"

# Email on failure (with sendmail)
pai launch --quiet || echo "PAI launch failed" | mail -s "Alert" admin@example.com
```

## Command Development Guide

This section explains how to add new commands to PAI CLI following Oclif best practices and our established patterns.

### Command Architecture

PAI CLI uses [Oclif](https://oclif.io) which provides automatic command registration based on file structure:

- **File path = Command name**: `src/commands/launch.ts` → `pai launch`
- **Subdirectories = Topics**: `src/commands/init/bmad.ts` → `pai init bmad`
- **Class names**: PascalCase version of command name (`Launch`, `InitBmad`)

### Adding a New Top-Level Command

1. **Create the command file** in `src/commands/`:
   ```bash
   # Example: Adding a "status" command
   touch src/commands/status.ts
   ```

2. **Implement the command**:
   ```typescript
   import BaseCommand from './base.js'
   import {Flags} from '@oclif/core'

   export default class Status extends BaseCommand {
     static override description = 'Show PAI status'

     static override examples = [
       '<%= config.bin %> <%= command.id %>',
       '<%= config.bin %> <%= command.id %> --debug',
     ]

     static override flags = {
       ...BaseCommand.baseFlags,  // Inherit global flags
       // Add command-specific flags here
     }

     async run(): Promise<void> {
       const {flags} = await this.parse(Status)
       // Implementation here
       this.log('Status output')
     }
   }
   ```

3. **Add tests** in `test/commands/`:
   ```typescript
   // test/commands/status.test.ts
   import {expect, test} from '@oclif/test'

   describe('status', () => {
     test
       .stdout()
       .command(['status'])
       .it('shows status', ctx => {
         expect(ctx.stdout).to.contain('Status output')
       })
   })
   ```

### Adding a Topic (Command Group)

Topics organize related commands under a common namespace:

1. **Create directory** in `src/commands/`:
   ```bash
   mkdir src/commands/config
   ```

2. **Add topic commands**:
   ```typescript
   // src/commands/config/show.ts → pai config show
   // src/commands/config/edit.ts → pai config edit
   ```

### Standard Flag Patterns

All commands should inherit base flags from `BaseCommand`:

| Flag | Long Form | Short Form | Purpose |
|------|-----------|------------|---------|
| Debug | `--debug` | `-d` | Enable verbose logging |
| Help | `--help` | `-h` | Show command help |
| Quiet | `--quiet` | `-q` | Suppress informational output (errors still shown) |

**Pattern:**
```typescript
static override flags = {
  ...BaseCommand.baseFlags,  // Always inherit base flags
  myFlag: Flags.string({
    char: 'm',  // Short form
    description: 'My flag description',
    required: false,
  }),
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Command files | kebab-case | `launch.ts`, `init/bmad.ts` |
| Command classes | PascalCase | `Launch`, `InitBmad` |
| Flags | camelCase | `debug`, `paiDir`, `quiet` |
| Constants | UPPER_SNAKE_CASE | `EXIT_CODES.SUCCESS` |

### Import Organization

Follow strict import order (enforced by ESLint):

```typescript
// 1. Node builtins (with node: prefix)
import {spawn} from 'node:child_process'

// 2. External packages
import {Flags} from '@oclif/core'

// 3. Internal absolute imports
import BaseCommand from './base.js'
import {getPaiHome} from '../lib/config.js'

// 4. Type imports
import type {LaunchOptions} from '../types/index.js'
```

### Error Handling

Use categorized exit codes and actionable error messages:

```typescript
import {EXIT_CODES} from '../types/index.js'

// Actionable error format: {what_wrong}. {how_to_fix}
this.error(
  'Configuration file not found. Run `pai init` to initialize.',
  {exit: EXIT_CODES.ENVIRONMENT_ERROR}
)
```

**Exit codes:**
- `EXIT_CODES.SUCCESS` (0) - Successful execution
- `EXIT_CODES.GENERAL_ERROR` (1) - General error
- `EXIT_CODES.INVALID_USAGE` (2) - Invalid arguments
- `EXIT_CODES.ENVIRONMENT_ERROR` (3) - Environment/prerequisite error

### Help System

Oclif provides built-in help:

- `pai <command> --help` - Show command help
- `pai help <command>` - Alternative help format (same output)
- `pai help` - List all commands

Help is automatically generated from command metadata (description, examples, flags).

### Testing Commands

1. **Unit tests** (`test/commands/<command>.test.ts`):
   - Test command logic in isolation
   - Mock external dependencies

2. **Integration tests** (`test/integration/<feature>.test.ts`):
   - Test actual CLI invocation
   - Use `execSync()` to run commands
   - Cross-platform compatibility

**Example:**
```typescript
import {execSync} from 'node:child_process'
import {platform} from 'node:os'

const bin = platform() === 'win32' ? String.raw`.\bin\dev.cmd` : './bin/dev.js'

it('executes command', () => {
  const result = execSync(`${bin} status`, {encoding: 'utf8'})
  expect(result).to.include('expected output')
})
```

### Project Structure

```
pai-cli/
├── src/
│   ├── commands/
│   │   ├── base.ts           # BaseCommand (extend this)
│   │   ├── launch.ts         # pai launch
│   │   ├── setup.ts          # pai init
│   │   └── init/             # Topic: pai init
│   │       └── bmad.ts       # pai init bmad
│   ├── lib/                  # Internal libraries
│   │   ├── config.ts
│   │   ├── debug.ts
│   │   ├── errors.ts
│   │   └── spawn.ts
│   └── types/                # Type definitions
│       └── index.ts
├── test/
│   ├── commands/             # Unit tests
│   └── integration/          # Integration tests
└── README.md
```

### Critical Rules

**MUST:**
- Extend `BaseCommand` for all commands
- Inherit `BaseCommand.baseFlags` in flag definitions
- Use `.js` extension in all imports (ESM requirement)
- Add `node:` prefix for Node builtins
- Use `this.error()` instead of `process.exit()`
- Provide both short (`-f`) and long (`--flag`) flag forms
- Follow kebab-case for command file names

**MUST NOT:**
- Call `process.exit()` directly
- Create utilities in `src/utils/` or `src/helpers/` (use `src/lib/`)
- Use `I` prefix on interfaces (`Config` not `IConfig`)
- Skip the `.js` extension in imports
- Use Promise chains (use async/await)

### Resources

- [Oclif Documentation](https://oclif.io/docs)
- [Oclif Commands](https://oclif.io/docs/commands)
- [Oclif Flags](https://oclif.io/docs/flags)
- [Oclif Topics](https://oclif.io/docs/topics)
