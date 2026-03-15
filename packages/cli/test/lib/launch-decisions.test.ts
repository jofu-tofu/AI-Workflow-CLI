import {describe, expect, it} from 'vitest'

import {
  buildInlineArgs,
  buildSessionRequest,
  buildSplitRequest,
  formatSessionLaunchMessage,
  formatSplitSuccessMessage,
  formatVersionCheckMessages,
  QUICK_EXIT_THRESHOLD_MS,
  resolveInlineFallbackMessage,
  resolveSessionFallbackWarning,
  resolveToolConfig,
  resolveToolModeDebugMessage,
  shouldRetry,
  toJsonLaunchResult,
} from '../../src/capabilities/launch/runtime-core/launch-decisions.js'
import {type InlineFallbackContext} from '../../src/capabilities/launch/contracts.js'

describe('launch-decisions', () => {
  // --- resolveToolConfig ---

  describe('resolveToolConfig', () => {
    it('returns claude config on linux', () => {
      const config = resolveToolConfig({codex: false, devin: false}, 'linux')
      expect(config.cliCommand).toBe('claude')
      expect(config.cliArgs).toEqual(['--dangerously-skip-permissions'])
      expect(config.launchFlag).toBe('')
      expect(config.toolMode).toBe('claude')
      expect(config.retryOnQuickExit).toBe(false)
      expect(config.needsLspPatch).toBe(false)
      expect(config.skipVersionCheck).toBe(false)
    })

    it('returns claude config on win32 with needsLspPatch', () => {
      const config = resolveToolConfig({codex: false, devin: false}, 'win32')
      expect(config.cliCommand).toBe('claude')
      expect(config.needsLspPatch).toBe(true)
    })

    it('returns claude config on darwin without needsLspPatch', () => {
      const config = resolveToolConfig({codex: false, devin: false}, 'darwin')
      expect(config.needsLspPatch).toBe(false)
    })

    it('returns codex config on linux', () => {
      const config = resolveToolConfig({codex: true, devin: false}, 'linux')
      expect(config.cliCommand).toBe('codex')
      expect(config.cliArgs).toEqual(['--yolo'])
      expect(config.launchFlag).toBe('--codex')
      expect(config.toolMode).toBe('codex')
      expect(config.retryOnQuickExit).toBe(false)
      expect(config.needsLspPatch).toBe(false)
      expect(config.skipVersionCheck).toBe(true)
    })

    it('returns codex config on win32 with shell_type override', () => {
      const config = resolveToolConfig({codex: true, devin: false}, 'win32')
      expect(config.cliArgs).toEqual(['-c', 'shell_type="bash"', '--yolo'])
    })

    it('returns devin config', () => {
      const config = resolveToolConfig({codex: false, devin: true}, 'linux')
      expect(config.cliCommand).toBe('devin')
      expect(config.cliArgs).toEqual(['--permission-mode', 'dangerous'])
      expect(config.launchFlag).toBe('--devin')
      expect(config.toolMode).toBe('devin')
      expect(config.retryOnQuickExit).toBe(true)
      expect(config.needsLspPatch).toBe(false)
      expect(config.skipVersionCheck).toBe(true)
    })

    it('devin config is platform-independent', () => {
      const linux = resolveToolConfig({codex: false, devin: true}, 'linux')
      const win = resolveToolConfig({codex: false, devin: true}, 'win32')
      expect(linux.cliArgs).toEqual(win.cliArgs)
    })
  })

  // --- resolveInlineFallbackMessage ---

  describe('resolveInlineFallbackMessage', () => {
    it('returns disable message when mux disabled', () => {
      const ctx: InlineFallbackContext = {
        disableMux: true, hasMux: false, interactiveTty: true, platform: 'linux',
      }
      expect(resolveInlineFallbackMessage(ctx)).toBe('Multiplexer disabled via --no-tmux — launching inline')
    })

    it('returns non-interactive message when tty is false', () => {
      const ctx: InlineFallbackContext = {
        disableMux: false, hasMux: false, interactiveTty: false, platform: 'linux',
      }
      expect(resolveInlineFallbackMessage(ctx)).toContain('Non-interactive terminal')
    })

    it('returns win32 install hint when no mux on windows', () => {
      const ctx: InlineFallbackContext = {
        disableMux: false, hasMux: false, interactiveTty: true, platform: 'win32',
      }
      const msg = resolveInlineFallbackMessage(ctx)
      expect(msg).toContain('psmux')
      expect(msg).toContain('WezTerm')
    })

    it('returns unix install hint when no mux on linux', () => {
      const ctx: InlineFallbackContext = {
        disableMux: false, hasMux: false, interactiveTty: true, platform: 'linux',
      }
      expect(resolveInlineFallbackMessage(ctx)).toContain('tmux')
    })

    it('returns resolved reason when mux exists', () => {
      const ctx: InlineFallbackContext = {
        disableMux: false, hasMux: true, interactiveTty: true, platform: 'linux',
        resolvedReason: 'WezTerm shell — no REPL context',
      }
      expect(resolveInlineFallbackMessage(ctx)).toBe('WezTerm shell — no REPL context')
    })
  })

  // --- buildInlineArgs ---

  describe('buildInlineArgs', () => {
    const baseArgs = ['--dangerously-skip-permissions']

    it('appends prompt-file for devin with promptPath', () => {
      const result = buildInlineArgs(baseArgs, 'devin', undefined, '/tmp/prompt.md')
      expect(result).toEqual([...baseArgs, '--prompt-file', '/tmp/prompt.md'])
    })

    it('appends prompt text for devin when no promptPath', () => {
      const result = buildInlineArgs(baseArgs, 'devin', 'hello', undefined)
      expect(result).toEqual([...baseArgs, 'hello'])
    })

    it('appends prompt text for claude', () => {
      const result = buildInlineArgs(baseArgs, 'claude', 'fix this', undefined)
      expect(result).toEqual([...baseArgs, 'fix this'])
    })

    it('returns copy of args when no prompt', () => {
      const result = buildInlineArgs(baseArgs, 'claude', undefined, undefined)
      expect(result).toEqual(baseArgs)
      expect(result).not.toBe(baseArgs) // new array
    })
  })

  // --- buildSplitRequest ---

  describe('buildSplitRequest', () => {
    const baseCli = ['--dangerously-skip-permissions'] as const

    it('appends prompt-file to toolArgs for devin', () => {
      const result = buildSplitRequest({
        cliArgs: baseCli,
        toolMode: 'devin',
        effectivePromptPath: '/tmp/prompt.md',
        extraEnv: {},
        cwd: '/repo',
        split: 'auto',
        sentinelPath: '/tmp/sentinel',
        retryOnQuickExit: true,
      })
      expect(result.toolArgs).toEqual([...baseCli, '--prompt-file', '/tmp/prompt.md'])
      expect(result.splitPromptPath).toBeUndefined()
    })

    it('passes promptPath via splitPromptPath for claude', () => {
      const result = buildSplitRequest({
        cliArgs: baseCli,
        toolMode: 'claude',
        effectivePromptPath: '/tmp/prompt.md',
        extraEnv: {FOO: 'bar'},
        cwd: '/repo',
        split: 'horizontal',
        sentinelPath: '/tmp/sentinel',
        retryOnQuickExit: false,
      })
      expect(result.toolArgs).toEqual([...baseCli])
      expect(result.splitPromptPath).toBe('/tmp/prompt.md')
      expect(result.env).toEqual({FOO: 'bar'})
    })

    it('returns correct params with no prompt', () => {
      const result = buildSplitRequest({
        cliArgs: baseCli,
        toolMode: 'claude',
        effectivePromptPath: undefined,
        extraEnv: {},
        cwd: '/repo',
        split: 'vertical',
        sentinelPath: '/tmp/sentinel',
        retryOnQuickExit: false,
      })
      expect(result.toolArgs).toEqual([...baseCli])
      expect(result.splitPromptPath).toBeUndefined()
      expect(result.mode).toBe('repl')
      expect(result.holdPane).toBe(false)
    })

    it('does not mutate the input cliArgs array (mutation regression)', () => {
      const input = ['--dangerously-skip-permissions']
      const originalLength = input.length

      buildSplitRequest({
        cliArgs: input,
        toolMode: 'devin',
        effectivePromptPath: '/tmp/prompt.md',
        extraEnv: {},
        cwd: '/repo',
        split: 'auto',
        sentinelPath: '/tmp/sentinel',
        retryOnQuickExit: true,
      })

      expect(input.length).toBe(originalLength)
    })
  })

  // --- buildSessionRequest ---

  describe('buildSessionRequest', () => {
    it('uses tmuxSessionFlag for reattach', () => {
      const result = buildSessionRequest({
        cliArgs: ['--dangerously-skip-permissions'],
        toolMode: 'claude',
        promptPath: undefined,
        promptText: 'hello',
        tmuxSessionFlag: 'my-session',
        cwd: '/repo',
        now: 1000,
        pid: 42,
      })
      expect(result.reattach).toBe(true)
      expect(result.sessionName).toBe('my-session')
      expect(result.promptText).toBe('hello')
    })

    it('generates unique session name when no tmuxSessionFlag', () => {
      const result = buildSessionRequest({
        cliArgs: ['--dangerously-skip-permissions'],
        toolMode: 'claude',
        promptPath: undefined,
        promptText: undefined,
        tmuxSessionFlag: undefined,
        cwd: '/home/user/repo',
        now: 1000,
        pid: 42,
      })
      expect(result.reattach).toBe(false)
      expect(result.sessionName).toContain('aiw-repo')
    })

    it('handles devin prompt path in toolArgs', () => {
      const result = buildSessionRequest({
        cliArgs: ['--permission-mode', 'dangerous'],
        toolMode: 'devin',
        promptPath: '/tmp/prompt.md',
        promptText: 'ignored',
        tmuxSessionFlag: undefined,
        cwd: '/repo',
        now: 1000,
        pid: 42,
      })
      expect(result.toolArgs).toEqual(['--permission-mode', 'dangerous', '--prompt-file', '/tmp/prompt.md'])
      expect(result.promptText).toBeUndefined()
    })
  })

  // --- resolveSessionFallbackWarning ---

  describe('resolveSessionFallbackWarning', () => {
    it('returns unavailable message for "not found" reason', () => {
      const msg = resolveSessionFallbackWarning('tmux', 'tmux not found')
      expect(msg).toContain('unavailable')
    })

    it('returns psmux install hint for "not found" reason', () => {
      const msg = resolveSessionFallbackWarning('psmux', 'psmux not found')
      expect(msg).toContain('winget install psmux')
    })

    it('returns version message for "too old" reason', () => {
      const msg = resolveSessionFallbackWarning('tmux', 'tmux version too old')
      expect(msg).toContain('too old')
      expect(msg).toContain('launching inline')
    })

    it('returns psmux upgrade hint for "too old" reason', () => {
      const msg = resolveSessionFallbackWarning('psmux', 'psmux version too old')
      expect(msg).toContain('winget upgrade psmux')
    })

    it('returns recovery hint for psmux attach failed', () => {
      const msg = resolveSessionFallbackWarning('psmux', 'psmux attach failed after retry')
      expect(msg).toContain('psmux kill-server')
    })

    it('returns generic fallback for unknown reason', () => {
      const msg = resolveSessionFallbackWarning('tmux', 'something unexpected')
      expect(msg).toBe('something unexpected — launching inline')
    })

    it('returns generic fallback for undefined reason', () => {
      const msg = resolveSessionFallbackWarning('tmux', undefined)
      expect(msg).toContain('launching inline')
    })
  })

  // --- shouldRetry ---

  describe('shouldRetry', () => {
    it('returns true when elapsed is below threshold', () => {
      expect(shouldRetry(5000)).toBe(true)
    })

    it('returns false when elapsed equals threshold', () => {
      expect(shouldRetry(QUICK_EXIT_THRESHOLD_MS)).toBe(false)
    })

    it('returns false when elapsed exceeds threshold', () => {
      expect(shouldRetry(15_000)).toBe(false)
    })

    it('accepts custom threshold', () => {
      expect(shouldRetry(3000, 5000)).toBe(true)
      expect(shouldRetry(6000, 5000)).toBe(false)
    })
  })

  // --- resolveToolModeDebugMessage ---

  describe('resolveToolModeDebugMessage', () => {
    it('returns codex message for codex mode', () => {
      expect(resolveToolModeDebugMessage('codex')).toBe('Launching Codex with --yolo flag')
    })

    it('returns devin message for devin mode', () => {
      expect(resolveToolModeDebugMessage('devin')).toBe('Launching Devin with --permission-mode dangerous')
    })

    it('returns undefined for claude mode', () => {
      expect(resolveToolModeDebugMessage('claude')).toBeUndefined()
    })
  })

  // --- formatVersionCheckMessages ---

  describe('formatVersionCheckMessages', () => {
    it('formats compatible version with known version string', () => {
      const msgs = formatVersionCheckMessages({version: '1.2.3', compatible: true})
      expect(msgs.debugLines).toEqual([
        'Claude Code version: 1.2.3',
        'Compatibility status: compatible',
      ])
      expect(msgs.warning).toBeUndefined()
    })

    it('formats incompatible version with warning', () => {
      const msgs = formatVersionCheckMessages({version: '0.1.0', compatible: false, warning: 'Upgrade required'})
      expect(msgs.debugLines).toEqual([
        'Claude Code version: 0.1.0',
        'Compatibility status: incompatible',
      ])
      expect(msgs.warning).toBe('Upgrade required')
    })

    it('formats unknown version', () => {
      const msgs = formatVersionCheckMessages({compatible: false})
      expect(msgs.debugLines[0]).toBe('Claude Code version: unknown')
    })
  })

  // --- formatSplitSuccessMessage ---

  describe('formatSplitSuccessMessage', () => {
    it('includes handle when provided', () => {
      expect(formatSplitSuccessMessage('tmux', '%22')).toBe('Launched in tmux pane: %22')
    })

    it('omits handle when undefined', () => {
      expect(formatSplitSuccessMessage('wezterm')).toBe('Launched in wezterm')
    })

    it('omits handle when empty string is treated as truthy check', () => {
      // empty string is falsy, so no handle shown
      expect(formatSplitSuccessMessage('tmux', '')).toBe('Launched in tmux')
    })
  })

  // --- formatSessionLaunchMessage ---

  describe('formatSessionLaunchMessage', () => {
    it('formats reattach message', () => {
      expect(formatSessionLaunchMessage('tmux', 'my-session', true))
        .toBe('Launching in tmux session: my-session (reuse/attach)')
    })

    it('formats new session message', () => {
      expect(formatSessionLaunchMessage('tmux', 'aiw-repo-123', false))
        .toBe('Launching in new tmux session: aiw-repo-123')
    })

    it('works with psmux backend', () => {
      expect(formatSessionLaunchMessage('psmux', 'dev', true))
        .toBe('Launching in psmux session: dev (reuse/attach)')
    })
  })

  // --- toJsonLaunchResult ---

  describe('toJsonLaunchResult', () => {
    it('converts result with handle', () => {
      const result = toJsonLaunchResult(
        {launched: true, backend: 'tmux', handle: '%22', sentinelPath: '/tmp/s'},
        0,
      )
      expect(result).toEqual({
        launched: true,
        backend: 'tmux',
        handle: '%22',
        sentinelPath: '/tmp/s',
        exitCode: 0,
        reason: null,
      })
    })

    it('converts result with null handle and exitCode', () => {
      const result = toJsonLaunchResult(
        {launched: false, backend: 'tmux', reason: 'failed'},
        null,
      )
      expect(result).toEqual({
        launched: false,
        backend: 'tmux',
        handle: null,
        sentinelPath: null,
        exitCode: null,
        reason: 'failed',
      })
    })
  })
})
