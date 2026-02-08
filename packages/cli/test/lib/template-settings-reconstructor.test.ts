import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'

import {reconstructIdeSettings} from '../../src/lib/template-settings-reconstructor.js'
import {pathExists} from '../helpers/test-utils.js'

/**
 * These tests use a mock template structure to verify reconstruction behavior.
 * Since reconstructIdeSettings() uses getTemplatePath() internally which resolves
 * against the bundled templates directory, we test with templates that exist in
 * the built dist-test/src/templates/ directory.
 */
describe('Template Settings Reconstructor', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `pai-reconstructor-test-${randomUUID()}`)
    await fs.mkdir(testDir, {recursive: true})
    // Create .claude directory
    await fs.mkdir(join(testDir, '.claude'), {recursive: true})
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, {force: true, recursive: true})
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('reconstructIdeSettings', () => {
    it('should create settings.json with _shared settings when no templates active', async () => {
      await reconstructIdeSettings(testDir, [], ['claude'])

      // Should have created a settings file
      expect(await pathExists(join(testDir, '.claude', 'settings.json'))).to.be.true

      const content = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
      const settings = JSON.parse(content)
      expect(settings).to.be.an('object')
    })

    it('should reconstruct with cc-native template settings', async () => {
      await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])

      expect(await pathExists(join(testDir, '.claude', 'settings.json'))).to.be.true

      const content = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
      const settings = JSON.parse(content)

      // cc-native template should contribute hooks
      expect(settings).to.have.property('hooks')
    })

    it('should preserve existing methods tracking in settings', async () => {
      // Write existing settings with methods tracking
      await fs.writeFile(
        join(testDir, '.claude', 'settings.json'),
        JSON.stringify({
          methods: {
            'cc-native': {
              ides: ['claude'],
              installedAt: '2026-01-01T00:00:00.000Z',
            },
          },
        }),
        'utf8',
      )

      await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])

      const content = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
      const settings = JSON.parse(content)

      // Methods tracking should be preserved
      expect(settings).to.have.property('methods')
      expect(settings.methods).to.have.property('cc-native')
      expect(settings.methods['cc-native'].installedAt).to.equal('2026-01-01T00:00:00.000Z')
    })

    it('should produce same result on repeated calls (idempotent)', async () => {
      // Run reconstruction twice
      await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])
      const content1 = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')

      await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])
      const content2 = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')

      // Results should be identical (ignoring the backup file creation)
      expect(JSON.parse(content1)).to.deep.equal(JSON.parse(content2))
    })

    it('should handle non-existent template gracefully', async () => {
      // Should not throw even with a non-existent template name
      await reconstructIdeSettings(testDir, ['nonexistent-template-xyz'], ['claude'])

      expect(await pathExists(join(testDir, '.claude', 'settings.json'))).to.be.true
    })

    it('should not create windsurf hooks when windsurf not in ides list', async () => {
      await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])

      // Windsurf hooks should NOT be created
      expect(await pathExists(join(testDir, '.windsurf', 'hooks.json'))).to.be.false
    })
  })
})
