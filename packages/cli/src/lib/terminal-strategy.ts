export interface TerminalConfig {
  cmd: string
  getArgs: (command: string) => string[]
}

export type WindowsShellPreference = 'default' | 'git-bash' | 'mintty'

export type WindowsTerminalStrategy =
  | 'git-bash-in-wt'
  | 'mintty'
  | 'powershell-fallback'
  | 'windows-terminal'

export const LINUX_TERMINALS: TerminalConfig[] = [
  {cmd: 'gnome-terminal', getArgs: (command: string) => ['--', 'bash', '-c', `${command}; exec bash`]},
  {cmd: 'konsole', getArgs: (command: string) => ['-e', `bash -c "${command}; exec bash"`]},
  {cmd: 'xterm', getArgs: (command: string) => ['-e', `bash -c "${command}; exec bash"`]},
  {cmd: 'x-terminal-emulator', getArgs: (command: string) => ['-e', `bash -c "${command}; exec bash"`]},
]

export function resolveWindowsTerminalStrategy(
  preference: WindowsShellPreference,
  gitBashPath: null | string,
  minttyExists: boolean,
  powershellCmd: string,
): WindowsTerminalStrategy[] {
  const strategies: WindowsTerminalStrategy[] = []

  if (preference === 'mintty') {
    if (minttyExists && gitBashPath) {
      strategies.push('mintty')
    }

    if (gitBashPath) {
      strategies.push('git-bash-in-wt')
    } else {
      strategies.push('windows-terminal')
    }
  } else if (preference === 'git-bash') {
    if (gitBashPath) {
      strategies.push('git-bash-in-wt')
    } else {
      strategies.push('windows-terminal')
    }
  } else {
    strategies.push('windows-terminal')
  }

  if (powershellCmd) {
    strategies.push('powershell-fallback')
  }

  return [...new Set(strategies)]
}

export function detectPowerShell(
  isAvailable: (command: string) => boolean,
): string {
  return isAvailable('pwsh') ? 'pwsh' : 'powershell'
}

export function isWSL(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env['WSL_DISTRO_NAME'])
}

export function findAvailableLinuxTerminal(
  isAvailable: (command: string, platform?: NodeJS.Platform) => boolean,
): null | TerminalConfig {
  for (const terminal of LINUX_TERMINALS) {
    if (isAvailable(terminal.cmd, 'linux')) {
      return terminal
    }
  }

  return null
}
