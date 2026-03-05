import {ProcessSpawnError} from './errors.js'

export function classifySpawnError(
  command: string,
  error: NodeJS.ErrnoException,
): ProcessSpawnError {
  if (error.code === 'ENOENT') {
    return new ProcessSpawnError(
      `Command not found: ${command}. Install Claude Code from https://claude.ai/download.`,
      'ENOENT',
    )
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
