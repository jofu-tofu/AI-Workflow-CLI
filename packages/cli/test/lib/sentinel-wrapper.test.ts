import {describe, expect, it} from 'vitest'

import {wrapSentinelPowerShell, wrapSentinelSh} from '../../src/lib/sentinel-wrapper.js'

describe('sentinel-wrapper', () => {
  describe('wrapSentinelSh', () => {
    it('builds auto-close shell wrapper with tmux pane kill', () => {
      const result = wrapSentinelSh({
        autoClose: true,
        command: 'claude --print',
        holdMessage: 'hold',
        holdPane: false,
        sentinelPath: '/tmp/sentinel.txt',
      })

      expect(result).toContain("claude --print; code=$?; printf '%s' \"$code\" > '/tmp/sentinel.txt'")
      expect(result).toContain('tmux kill-pane -t "$TMUX_PANE"')
      expect(result).toContain('exit $code')
    })

    it('builds standard shell wrapper when autoClose and holdPane are false', () => {
      const result = wrapSentinelSh({
        autoClose: false,
        command: 'claude',
        holdMessage: 'hold',
        holdPane: false,
        sentinelPath: '/tmp/sentinel.txt',
      })

      expect(result).toContain("claude; code=$?; printf '%s' \"$code\" > '/tmp/sentinel.txt'")
      expect(result).not.toContain('kill-pane')
      expect(result).not.toContain('"$BASH" -li')
      expect(result).toContain('; exit $code')
    })

    it('holds pane open with message when holdPane is true and autoClose is false', () => {
      const result = wrapSentinelSh({
        autoClose: false,
        command: 'claude',
        holdMessage: 'Press q',
        holdPane: true,
        sentinelPath: '/tmp/sentinel.txt',
      })

      expect(result).toContain("; echo; echo 'Press q'; \"$BASH\" -li")
    })

    it('prioritizes autoClose over holdPane', () => {
      const result = wrapSentinelSh({
        autoClose: true,
        command: 'claude',
        holdMessage: 'ignored',
        holdPane: true,
        sentinelPath: '/tmp/sentinel.txt',
      })

      expect(result).toContain('kill-pane')
      expect(result).not.toContain('"$BASH" -li')
    })
  })

  describe('wrapSentinelPowerShell', () => {
    it('holds pane with prompt when holdPane is true and autoClose is false', () => {
      const result = wrapSentinelPowerShell({
        autoClose: false,
        command: '& claude',
        holdMessage: 'Stay open',
        holdPane: true,
        sentinelPath: 'C:/tmp/sentinel.txt',
      })

      expect(result).toContain("$code = $LASTEXITCODE; Set-Content -Path 'C:/tmp/sentinel.txt' -Value $code -NoNewline")
      expect(result).toContain("Write-Host 'Stay open'")
      expect(result).toContain("Read-Host -Prompt 'Press Enter to close' | Out-Null")
    })

    it('always exits with code when autoClose is true', () => {
      const result = wrapSentinelPowerShell({
        autoClose: true,
        command: '& claude',
        holdMessage: 'ignored',
        holdPane: true,
        sentinelPath: 'C:/tmp/sentinel.txt',
      })

      expect(result).toContain('; exit $code')
      expect(result).not.toContain('Read-Host')
    })
  })
})
