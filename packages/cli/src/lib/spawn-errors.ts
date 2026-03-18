import {ProcessSpawnError} from './errors.js'

const INSTALL_INSTRUCTIONS: Record<string, string> = {
  claude: 'Install Claude Code from https://claude.ai/download.',
  codex: 'Install Codex from npm.',
  devin: 'Install Devin from https://cli.devin.ai.',
}

export function getInstallInstruction(command: string): string {
  return INSTALL_INSTRUCTIONS[command] ?? 'Check that the command exists and is executable.'
}

export function formatCommandNotFoundMessage(command: string): string {
  return `Command not found: ${command}. ${getInstallInstruction(command)}`
}

export function formatPathWarning(command: string): string {
  return `${command} not found on PATH (${getInstallInstruction(command).replace(/\.$/, '')})`
}

export function classifySpawnError(
  command: string,
  error: NodeJS.ErrnoException,
): ProcessSpawnError {
  if (error.code === 'ENOENT') {
    return new ProcessSpawnError(formatCommandNotFoundMessage(command), 'ENOENT')
  }

  if (error.code === 'EACCES') {
    return new ProcessSpawnError(`Permission denied: ${command}. Check file permissions.`, 'EACCES')
  }

  return new ProcessSpawnError(
    `Failed to spawn ${command}: ${error.message}. Check that the command exists and is executable.`,
    error.code,
  )
}

export function resolveWindowsSpawnArgs(
  command: string,
  args: string[],
  cmdExists: (commandName: string) => boolean,
): null | {args: string[]; command: string} {
  if (!cmdExists(`${command}.cmd`)) return null
  return {command: 'cmd.exe', args: ['/c', command, ...args]}
}
