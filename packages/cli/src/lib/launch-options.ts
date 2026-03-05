export function parseExtraEnv(raw: string | undefined): Record<string, string> {
  if (!raw) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('--env must be a valid JSON object string')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--env must be a valid JSON object string')
  }

  return parsed as Record<string, string>
}

export function resolvePromptText(
  promptFlag: string | undefined,
  promptFileFlag: string | undefined,
  readFile: (filePath: string) => string | undefined,
): string | undefined {
  const promptText = promptFlag?.trim()
  if (promptText) return promptText

  const promptFilePath = promptFileFlag?.trim()
  if (!promptFilePath) return undefined

  try {
    const fromFile = readFile(promptFilePath)?.trim()
    return fromFile || undefined
  } catch {
    return undefined
  }
}

export interface BuildSpawnedWindowArgsParams {
  disableTmux: boolean
  promptFilePath?: string | undefined
  promptPath?: string | undefined
  rawEnvJson?: string | undefined
  tmuxSessionFlag?: string | undefined
  useCodex: boolean
  useDevin?: boolean
}

export function buildSpawnedWindowArgs(params: BuildSpawnedWindowArgsParams): string[] {
  const {useCodex, useDevin, disableTmux, promptFilePath, promptPath, rawEnvJson, tmuxSessionFlag} = params
  const parts = ['aiw', 'launch', '--spawned-window']

  if (useDevin) parts.push('--devin')
  else if (useCodex) parts.push('--codex')
  if (disableTmux) parts.push('--no-tmux')

  const tmuxSession = tmuxSessionFlag?.trim()
  if (tmuxSession) {
    parts.push('--tmux-session', tmuxSession)
  }

  const envJson = rawEnvJson?.trim()
  if (envJson) {
    parts.push('--env', envJson)
  }

  if (promptPath) {
    parts.push('--prompt-path', promptPath)
  } else if (promptFilePath) {
    parts.push('--prompt-file', promptFilePath)
  }

  return parts
}

export function sanitizeSessionName(input: string): string {
  const trimmed = input.trim().toLowerCase()
  const safe = trimmed
    .replaceAll(/[^a-z0-9_-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^[-_]+|[-_]+$/g, '')
  return safe || 'aiw'
}

export function buildUniqueSessionName(
  base: string,
  now: number = Date.now(),
  pid: number = process.pid,
): string {
  const safeBase = sanitizeSessionName(base)
  const timestamp = now.toString(36)
  const pidPart = pid.toString(36)
  return sanitizeSessionName(`${safeBase}-${timestamp}-${pidPart}`)
}
