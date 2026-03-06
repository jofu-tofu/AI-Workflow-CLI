import {randomUUID} from 'node:crypto'
import {promises as fs} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {expect} from 'chai'
import {type SinonStub, stub} from 'sinon'
import {afterEach, beforeEach, describe, it} from 'vitest'

import {normalizeTemplateSettingsPaths, reconstructIdeSettings} from '../../src/lib/template-settings-reconstructor.js'
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

  describe('normalizeTemplateSettingsPaths', () => {
    it('normalizes command hooks and preserves prompt hooks', () => {
      const source = {
        hooks: {
          PreToolUse: [
            {
              matcher: '^TaskCreate$',
              hooks: [
                {
                  type: 'prompt',
                  prompt: 'Validate task prompt',
                },
                {
                  type: 'command',
                  command: 'bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/hooks-ts/session_start.ts',
                  timeout: 5000,
                },
              ],
            },
          ],
        },
      }

      const normalized = normalizeTemplateSettingsPaths(source)

      expect(
        normalized.hooks?.PreToolUse?.[0]?.hooks.find((hook) => hook.type === 'command'),
      ).to.deep.include({
        command: 'bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/hooks-ts/session_start.ts',
      })

      const promptHook = normalized.hooks?.PreToolUse?.[0]?.hooks.find((hook) => hook.type === 'prompt')
      expect(promptHook).to.deep.include({
        type: 'prompt',
        prompt: 'Validate task prompt',
      })
      expect(promptHook).to.not.have.property('command')

      // Ensure we did not mutate caller input.
      expect(
        source.hooks.PreToolUse[0].hooks.find((hook) => hook.type === 'command'),
      ).to.deep.include({
        command: 'bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/hooks-ts/session_start.ts',
      })
    })
  })

  describe('reconstructIdeSettings', () => {
    it('should create settings.json with _core base settings when no templates active', async () => {
      await reconstructIdeSettings(testDir, [], ['claude'])

      // Should have created a settings file
      expect(await pathExists(join(testDir, '.claude', 'settings.json'))).to.be.true

      const content = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
      const settings = JSON.parse(content)
      expect(settings).to.be.an('object')
      expect(settings.statusLine.command).to.include('.aiwcli/_core/')
    })

    it('should reconstruct with cc-native template settings including method-specific hooks', async () => {
      await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])

      expect(await pathExists(join(testDir, '.claude', 'settings.json'))).to.be.true

      const content = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
      const settings = JSON.parse(content)

      expect(settings).to.have.property('hooks')
      expect(settings.hooks).to.have.property('PreToolUse')
      expect(settings.hooks.PreToolUse).to.be.an('array').that.is.not.empty
      expect(settings.hooks.PostToolUse).to.be.an('array').that.is.not.empty
      expect(settings.hooks.UserPromptSubmit).to.be.an('array').that.is.not.empty

      const preToolUseHooks = settings.hooks.PreToolUse.flatMap((matcher: {hooks: unknown[]}) => matcher.hooks)
      expect(preToolUseHooks.some((hook: {type: string}) => hook.type === 'prompt')).to.equal(true)

      const postToolUseHooks = settings.hooks.PostToolUse.flatMap((matcher: {hooks: unknown[]}) => matcher.hooks)
      const postToolCommands = postToolUseHooks
        .filter((hook: {type: string}) => hook.type === 'command')
        .map((hook: {command: string}) => hook.command)

      expect(postToolCommands.some((command: string) => command.includes('mark_questions_asked.ts'))).to.equal(true)
      expect(postToolCommands.some((command: string) => command.includes('enhance_plan_post_write.ts'))).to.equal(true)
      expect(postToolCommands.some((command: string) => command.includes('enhance_plan_post_subagent.ts'))).to.equal(true)

      const userPromptSubmitHooks = settings.hooks.UserPromptSubmit.flatMap(
        (matcher: {hooks: unknown[]}) => matcher.hooks,
      )
      const userPromptCommands = userPromptSubmitHooks
        .filter((hook: {type: string}) => hook.type === 'command')
        .map((hook: {command: string}) => hook.command)

      const sharedUserPromptSubmitCount = userPromptCommands.filter((command: string) =>
        command.includes('user_prompt_submit.ts'),
      ).length
      expect(sharedUserPromptSubmitCount).to.equal(1)

      expect(userPromptCommands.some((command: string) => command.includes('plan_questions_early.ts'))).to.equal(true)

      expect(settings).to.have.property('permissions')
      expect(settings.permissions).to.deep.equal({allow: [], deny: []})
      expect(settings).to.have.property('env')
      expect(settings.env).to.have.property('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', '1')
    })

    it('adapts command hooks for Windows while preserving prompt hooks', async () => {
      let platformStub: SinonStub | undefined
      try {
        platformStub = stub(process, 'platform').value('win32')
        await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])

        const content = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
        const settings = JSON.parse(content)

        expect(settings.statusLine.command).to.match(/bun "\.aiwcli\/_core\/scripts\/resolve-run\.ts"/)
        expect(settings.fileSuggestion.command).to.match(/bun "\.aiwcli\/_core\/scripts\/resolve-run\.ts"/)

        const promptHook = settings.hooks.PreToolUse
          .flatMap((matcher: {hooks: unknown[]}) => matcher.hooks)
          .find((hook: {type: string}) => hook.type === 'prompt')
        expect(promptHook).to.exist
        expect(promptHook).to.have.property('prompt').that.is.a('string')
        expect(promptHook).to.not.have.property('command')
      } finally {
        platformStub?.restore()
      }
    })

    it('removes legacy methods tracking from reconstructed settings', async () => {
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

      expect(settings).to.not.have.property('methods')
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
