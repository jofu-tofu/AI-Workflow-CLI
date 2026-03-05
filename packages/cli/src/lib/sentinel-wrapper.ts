import {quoteForPowerShell, quoteForSh} from './shell-quoting.js'

export interface SentinelWrapParams {
  autoClose: boolean
  command: string
  holdMessage: string
  holdPane: boolean
  sentinelPath: string
}

export function wrapSentinelSh(params: SentinelWrapParams): string {
  const {command, sentinelPath, autoClose, holdPane, holdMessage} = params
  const base = `${command}; code=$?; printf '%s' "$code" > ${quoteForSh(sentinelPath)}`

  if (autoClose) {
    return `${base}; tmux kill-pane -t "$TMUX_PANE" >/dev/null 2>&1 || true; exit $code`
  }

  if (holdPane) {
    return `${base}; echo; echo ${quoteForSh(holdMessage)}; exec bash`
  }

  return `${base}; exit $code`
}

export function wrapSentinelPowerShell(params: SentinelWrapParams): string {
  const {command, sentinelPath, autoClose, holdPane, holdMessage} = params
  const base = `${command}; $code = $LASTEXITCODE; Set-Content -Path ${quoteForPowerShell(sentinelPath)} -Value $code -NoNewline`

  if (holdPane && !autoClose) {
    return `${base}; Write-Host ''; Write-Host ${quoteForPowerShell(holdMessage)}; Read-Host -Prompt 'Press Enter to close' | Out-Null`
  }

  return `${base}; exit $code`
}
