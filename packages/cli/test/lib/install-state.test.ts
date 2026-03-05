import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {
  getInstalledMethods,
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
    expect(state?.ides.claude!.managed).to.equal(true)
    expect(state?.ides.codex!.managed).to.equal(true)
  })

  it('tracks method install/remove lifecycle', async () => {
    await markMethodInstalled(testDir, 'cc-native', ['claude'])
    expect(await getInstalledMethodsFromState(testDir)).to.deep.equal(['cc-native'])

    await markMethodRemoved(testDir, 'cc-native')
    expect(await getInstalledMethodsFromState(testDir)).to.deep.equal([])
  })

  it('discovers legacy methods on disk before install-state exists', async () => {
    await fs.mkdir(join(testDir, '.aiwcli', '_gsd'), {recursive: true})
    await fs.mkdir(join(testDir, '.aiwcli', '_planning-with-files'), {recursive: true})

    expect(await getInstalledMethods(testDir)).to.deep.equal(['gsd', 'planning-with-files'])
  })

  it('backfills legacy methods into state when core is installed later', async () => {
    await fs.mkdir(join(testDir, '.aiwcli', '_gsd'), {recursive: true})

    await markCoreInstalled(testDir, ['claude'])

    expect(await getInstalledMethodsFromState(testDir)).to.deep.equal(['gsd'])
    const state = await readInstallState(testDir)
    expect(state?.core.installed).to.equal(true)
  })
})
