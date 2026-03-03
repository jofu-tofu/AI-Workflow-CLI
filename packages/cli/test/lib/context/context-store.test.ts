import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'

import {
  bindSession,
  createContext,
  determineArtifactType,
  getContext,
  getContextBySessionId,
  updateMode,
} from '../../../src/lib/context/context-store.js'

describe('context-store', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aiwcli-context-'))
  })

  afterEach(() => {
    rmSync(projectRoot, {recursive: true, force: true})
  })

  it('creates and loads context state under a custom project root', () => {
    const context = createContext('ctx-test', 'Refactor context layer', {
      method: 'cc-native',
      projectRoot,
      tags: ['refactor'],
    })
    const loaded = getContext(context.id, projectRoot)

    expect(loaded).to.not.equal(null)
    expect(loaded?.id).to.equal('ctx-test')
    expect(loaded?.summary).to.equal('Refactor context layer')
    expect(loaded?.mode).to.equal('idle')
  })

  it('binds session IDs and resolves context by session ID', () => {
    const context = createContext('ctx-session', 'Session binding', {
      method: 'cc-native',
      projectRoot,
    })
    const sessionId = 'session-123'

    const didBind = bindSession(context.id, sessionId, projectRoot)
    const resolved = getContextBySessionId(sessionId, projectRoot)

    expect(didBind).to.equal(true)
    expect(resolved?.id).to.equal(context.id)
    expect(resolved?.sessionIds).to.include(sessionId)
  })

  it('uses explicit nextArtifactType when determining staged artifact type', () => {
    const context = createContext('ctx-artifact', 'Artifact type', {
      method: 'cc-native',
      projectRoot,
    })
    updateMode(context.id, 'hasStagedWork', projectRoot, {planPath: '/tmp/plan.md', planHash: 'abc'})
    const loaded = getContext(context.id, projectRoot)

    expect(loaded).to.not.equal(null)
    if (!loaded) return

    loaded.nextArtifactType = 'handoff'
    expect(determineArtifactType(loaded)).to.equal('handoff')
  })
})


