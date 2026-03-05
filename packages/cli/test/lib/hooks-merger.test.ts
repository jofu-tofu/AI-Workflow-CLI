import {expect} from 'chai'
import {describe, it} from 'vitest'

import {mergeClaudeSettings} from '../../src/lib/hooks-merger.js'

describe('mergeClaudeSettings', () => {
  it('drops legacy methods metadata from merged settings', () => {
    const merged = mergeClaudeSettings(
      {
        model: 'sonnet',
        methods: {
          'cc-native': {
            ides: ['claude'],
            installedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      } as never,
      {
        permissions: {
          allow: ['Read'],
        },
      },
    )

    expect(merged).to.not.have.property('methods')
    expect(merged.permissions).to.deep.equal({allow: ['Read'], deny: []})
  })
})
