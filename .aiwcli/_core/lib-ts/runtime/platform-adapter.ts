export type TmuxColorMode = 'c256' | 'truecolor'

export function isWindowsPlatform(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
}

export function isNonWindowsPlatform(platform: NodeJS.Platform = process.platform): boolean {
  return !isWindowsPlatform(platform)
}

export function commandLookupBinary(platform: NodeJS.Platform = process.platform): 'where.exe' | 'which' {
  return isWindowsPlatform(platform) ? 'where.exe' : 'which'
}

export function shouldUseShell(platform: NodeJS.Platform = process.platform): boolean {
  return isWindowsPlatform(platform)
}

export function resolveTmuxColorModeForPlatform(
  _platform?: NodeJS.Platform,
): TmuxColorMode {
  // Always truecolor — Windows now uses psmux (native ConPTY) which supports truecolor natively.
  // The c256 degradation was only needed for tmux-via-MSYS2-bash.
  return 'truecolor'
}

export function applyTmuxLaunchEnv(
  envVars: Record<string, string>,
  _platform?: NodeJS.Platform,
): Record<string, string> {
  // Always inject truecolor — psmux on Windows and tmux on Unix both support it.
  return { COLORTERM: 'truecolor', ...envVars }
}
