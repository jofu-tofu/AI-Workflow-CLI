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
  platform: NodeJS.Platform = process.platform,
): TmuxColorMode {
  return isWindowsPlatform(platform) ? 'c256' : 'truecolor'
}

export function applyTmuxLaunchEnv(
  envVars: Record<string, string>,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  if (isNonWindowsPlatform(platform)) {
    return { COLORTERM: 'truecolor', ...envVars }
  }

  const rest = { ...envVars }
  delete rest.COLORTERM
  return rest
}
