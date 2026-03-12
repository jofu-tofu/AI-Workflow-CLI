import {quoteForPowerShell, quoteForSh} from './shell-quoting.js'

export interface SentinelWrapParams {
  autoClose: boolean
  autoCloseCommand?: string | undefined
  command: string
  holdMessage: string
  holdPane: boolean
  sentinelPath: string
}

export function wrapSentinelSh(params: SentinelWrapParams): string {
  const {command, sentinelPath, autoClose, holdPane, holdMessage} = params
  const quoted = quoteForSh(sentinelPath)
  // Trap HUP/INT/TERM so the sentinel is written even if the pane is killed.
  const trap = `trap 'printf "%s" "130" > ${quoted}; exit 130' HUP INT TERM`
  const base = `${trap}; ${command}; code=$?; printf '%s' "$code" > ${quoted}`

  if (autoClose) {
    const killCmd = params.autoCloseCommand
      ?? 'tmux kill-pane -t "$TMUX_PANE" >/dev/null 2>&1 || true'
    return `${base}; ${killCmd}; exit $code`
  }

  if (holdPane) {
    // Launch an interactive login shell to hold the pane open.
    // Use "$BASH" (current bash) to avoid resolving to WSL's bash.
    // Do NOT use 'exec' — on MSYS2/Windows exec emulates by spawning a new
    // process and exiting the original, which causes WezTerm to close the pane.
    return `${base}; echo; echo ${quoteForSh(holdMessage)}; "$BASH" -li`
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
