import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {
  getInstalledMethodsFromState,
  markCoreInstalled,
  markMethodInstalled,
  markMethodRemoved,
  readInstallState,
} from '../../src/lib/install-state.js'

describe('install-state', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `pai-install-state-test-${randomUUID()}`)
    await fs.mkdir(testDir, {recursive: true})
  })

  afterEach(async () => {
    await fs.rm(testDir, {recursive: true, force: true})
  })

  it('tracks core installation', async () => {
    await markCoreInstalled(testDir, ['claude', 'codex'])
    const state = await readInstallState(testDir)
    expect(state).to.exist
    expect(state?.core.installed).to.equal(true)
    expect(state?.ides.claude.managed).to.equal(true)
    expect(state?.ides.codex.managed).to.equal(true)
  })

  it('tracks method install/remove lifecycle', async () => {
    await markMethodInstalled(testDir, 'cc-native', ['claude'])
    expect(await getInstalledMethodsFromState(testDir)).to.deep.equal(['cc-native'])

    await markMethodRemoved(testDir, 'cc-native')
    expect(await getInstalledMethodsFromState(testDir)).to.deep.equal([])
  })
})
