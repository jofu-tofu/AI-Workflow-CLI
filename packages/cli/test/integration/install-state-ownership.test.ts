import {execFile} from 'node:child_process'
import {promises as fs} from 'node:fs'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {expect} from 'chai'
import {afterEach, beforeEach, describe, it, vi} from 'vitest'

import ClearCommand from '../../src/commands/clear.js'
import InitCommand from '../../src/commands/init/index.js'
import {reconstructIdeSettings} from '../../src/lib/template-settings-reconstructor.js'
import {cleanupTestDir, createTestDir, pathExists} from '../helpers/test-utils.js'

const execFileAsync = promisify(execFile)

function quietClear(command: ClearCommand, template?: string): ClearCommand {
  vi.spyOn(command, 'parse').mockResolvedValue({
    flags: {
      debug: false,
      'dry-run': false,
      force: true,
      help: false,
      output: false,
      quiet: true,
      template,
    },
  } as never)
  vi.spyOn(command, 'log').mockImplementation(() => {})
  vi.spyOn(command, 'logInfo').mockImplementation(() => {})
  vi.spyOn(command, 'logSuccess').mockImplementation(() => {})
  vi.spyOn(command, 'logWarning').mockImplementation(() => {})
  return command
}

function quietInit(command: InitCommand, options?: {ides?: string[]; interactive?: boolean; method?: string}): InitCommand {
  vi.spyOn(command, 'parse').mockResolvedValue({
    flags: {
      debug: false,
      help: false,
      ide: options?.ides,
      interactive: options?.interactive ?? false,
      method: options?.method,
      quiet: true,
    },
  } as never)
  vi.spyOn(command as never, 'installGlobalResolver').mockImplementation(async () => {})
  vi.spyOn(command, 'log').mockImplementation(() => {})
  vi.spyOn(command, 'logInfo').mockImplementation(() => {})
  vi.spyOn(command, 'logSuccess').mockImplementation(() => {})
  vi.spyOn(command, 'warn').mockImplementation(() => {})
  return command
}

describe('install-state ownership', () => {
  let originalCwd: string
  let testDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    testDir = await createTestDir('aiw-install-state-ownership')
    process.chdir(testDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
    await cleanupTestDir(testDir)
  })

  it('stores method installation only in install-state during init', async () => {
    await quietInit(new InitCommand([], {} as never), {ides: ['claude'], method: 'cc-native'}).run()

    const installState = JSON.parse(await fs.readFile(join(testDir, '.aiwcli', 'state', 'install-state.json'), 'utf8'))
    expect(installState.methods).to.have.property('cc-native')

    const settings = JSON.parse(await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8'))
    expect(settings).to.not.have.property('methods')
  })

  it('does not perform a minimal install when interactive setup is cancelled', async () => {
    const command = quietInit(new InitCommand([], {} as never), {interactive: true})
    const minimalInstall = vi.spyOn(command as never, 'performMinimalInstall').mockImplementation(async () => {})
    vi.spyOn(command as never, 'runInteractiveWizard').mockResolvedValue({confirmed: false} as never)

    await command.run()

    expect(minimalInstall.mock.calls).to.have.length(0)
    expect(await pathExists(join(testDir, '.aiwcli', '_core'))).to.equal(false)
  })

  it('preserves existing method settings during minimal init reruns', async () => {
    await quietInit(new InitCommand([], {} as never), {ides: ['claude'], method: 'cc-native'}).run()

    const settingsPath = join(testDir, '.claude', 'settings.json')
    expect(await fs.readFile(settingsPath, 'utf8')).to.include('mark_questions_asked.ts')

    await quietInit(new InitCommand([], {} as never)).run()

    expect(await fs.readFile(settingsPath, 'utf8')).to.include('mark_questions_asked.ts')
  })

  it('backfills legacy methods during init so existing settings survive', async () => {
    await fs.mkdir(join(testDir, '.aiwcli', '_gsd', 'hooks'), {recursive: true})
    await fs.writeFile(join(testDir, '.aiwcli', '_gsd', 'hooks', 'gsd-unified-review.py'), '# legacy\n', 'utf8')
    await reconstructIdeSettings(testDir, ['gsd'], ['claude'])

    await quietInit(new InitCommand([], {} as never), {ides: ['claude'], method: 'cc-native'}).run()

    const installState = JSON.parse(await fs.readFile(join(testDir, '.aiwcli', 'state', 'install-state.json'), 'utf8'))
    expect(Object.keys(installState.methods).sort()).to.deep.equal(['cc-native', 'gsd'])

    const settings = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
    expect(settings).to.include('gsd-unified-review.py')
    expect(settings).to.include('mark_questions_asked.ts')
  })

  it('clears a legacy install without relying on settings methods metadata', async () => {
    await fs.mkdir(join(testDir, '.aiwcli', '_cc-native'), {recursive: true})
    await fs.mkdir(join(testDir, '.claude', 'commands', 'cc-native'), {recursive: true})
    await fs.writeFile(join(testDir, '.claude', 'commands', 'cc-native', 'placeholder.md'), '# test\n', 'utf8')
    await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])

    await quietClear(new ClearCommand([], {} as never), 'cc-native').run()

    expect(await pathExists(join(testDir, '.aiwcli', '_cc-native'))).to.equal(false)
    expect(await pathExists(join(testDir, '.claude', 'commands', 'cc-native'))).to.equal(false)

    const settings = JSON.parse(await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8'))
    expect(settings).to.not.have.property('methods')
    expect(settings.statusLine.command).to.include('.aiwcli/_core/')
  })

  it('clears method output folders from root _output', async () => {
    await fs.mkdir(join(testDir, '.aiwcli', '_gsd'), {recursive: true})
    await fs.mkdir(join(testDir, '_output', 'gsd'), {recursive: true})
    await fs.writeFile(join(testDir, '_output', 'gsd', 'artifact.md'), '# artifact\n', 'utf8')

    await quietClear(new ClearCommand([], {} as never), 'gsd').run()

    expect(await pathExists(join(testDir, '_output', 'gsd'))).to.equal(false)
    expect(await pathExists(join(testDir, '_output'))).to.equal(false)
  })

  it('full clear removes AIW-owned Claude settings and install-state residue', async () => {
    await quietInit(new InitCommand([], {} as never), {ides: ['claude'], method: 'cc-native'}).run()

    await quietClear(new ClearCommand([], {} as never)).run()

    expect(await pathExists(join(testDir, '.aiwcli'))).to.equal(false)
    expect(await pathExists(join(testDir, '.aiwcli', 'state'))).to.equal(false)

    const settingsPath = join(testDir, '.claude', 'settings.json')
    if (await pathExists(settingsPath)) {
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
      expect(settings).to.not.have.property('hooks')
      expect(settings).to.not.have.property('statusLine')
      expect(settings).to.not.have.property('fileSuggestion')
      expect(settings).to.not.have.property('methods')
      expect(settings).to.not.have.property('permissions')
      expect(settings.env ?? {}).to.not.have.property('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS')
    }
  })

  it('prunes stale git exclude entries after full clear removes IDE folders', async () => {
    await execFileAsync('git', ['init'], {cwd: testDir})
    await quietInit(new InitCommand([], {} as never), {ides: ['claude'], method: 'cc-native'}).run()

    const excludePath = join(testDir, '.git', 'info', 'exclude')
    expect(await fs.readFile(excludePath, 'utf8')).to.include('.claude/')

    await quietClear(new ClearCommand([], {} as never)).run()

    const exclude = await fs.readFile(excludePath, 'utf8')
    expect(exclude).to.not.include('.aiwcli/')
    expect(exclude).to.not.include('.claude/')
    expect(exclude).to.not.include('.codex/')
    expect(exclude).to.not.include('.windsurf/')
  })
})
