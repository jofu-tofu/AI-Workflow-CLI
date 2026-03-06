import {expect} from 'chai'

import {extractResumeSummary} from '../../src/templates/core/skills/codex/lib/codex-watcher.js'

describe('codex watcher resume summary parser', () => {
  it('parses bullet summary from codex stderr output with noise', () => {
    const stderr = [
      'MCP startup: loading servers...',
      'MCP startup: connected.',
      '',
      'codex',
      '- Updated codex summary capture flow to use Spark via codex exec',
      '- Added fast-tier fallback summary generation',
      '- Added resume-output parsing fallback logic',
      'tokens used: 13892',
      '',
    ].join('\n')

    const summary = extractResumeSummary(stderr)
    expect(summary).to.equal(
      [
        '- Updated codex summary capture flow to use Spark via codex exec',
        '- Added fast-tier fallback summary generation',
        '- Added resume-output parsing fallback logic',
      ].join('\n'),
    )
  })

  it('returns empty string when codex marker is missing', () => {
    const text = [
      'MCP startup: loading servers...',
      '- This is not a codex role block',
      '- Should not be parsed',
    ].join('\n')

    expect(extractResumeSummary(text)).to.equal('')
  })

  it('returns empty string when fewer than 2 bullet lines are present', () => {
    const text = [
      'log line',
      '',
      'codex',
      '- Only one bullet',
      'tokens used: 30',
    ].join('\n')

    expect(extractResumeSummary(text)).to.equal('')
  })

  it('stops collecting when non-bullet lines begin', () => {
    const text = [
      'noise',
      '',
      'codex',
      '- First bullet',
      '- Second bullet',
      'tokens used: 999',
      '- Trailing line should be ignored',
    ].join('\n')

    expect(extractResumeSummary(text)).to.equal('- First bullet\n- Second bullet')
  })

  it('returns empty string for empty input', () => {
    expect(extractResumeSummary('')).to.equal('')
  })
})
