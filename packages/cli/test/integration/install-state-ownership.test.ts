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

// Mock inquirer prompts at the module boundary (used by the interactive wizard)
vi.mock('@inquirer/select', () => ({default: vi.fn()}))
vi.mock('@inquirer/checkbox', () => ({default: vi.fn()}))
vi.mock('@inquirer/input', () => ({default: vi.fn()}))
vi.mock('@inquirer/confirm', () => ({default: vi.fn()}))

interface QuietClearOptions {
  template?: string
}

interface QuietInitOptions {
  ides?: string[]
  interactive?: boolean
  method?: string
}

function silenceCommand<T extends ClearCommand | InitCommand>(command: T): T {
  vi.spyOn(command, 'log').mockImplementation(() => {})
  vi.spyOn(command, 'logInfo').mockImplementation(() => {})
  vi.spyOn(command, 'logSuccess').mockImplementation(() => {})
  if ('logWarning' in command) vi.spyOn(command as ClearCommand, 'logWarning').mockImplementation(() => {})
  if ('warn' in command) vi.spyOn(command as InitCommand, 'warn').mockImplementation(() => {})
  return command
}

function quietClear(command: ClearCommand, options?: QuietClearOptions): ClearCommand {
  vi.spyOn(command, 'parse').mockResolvedValue({
    flags: {
      debug: false,
      'dry-run': false,
      force: true,
      help: false,
      output: false,
      quiet: true,
      template: options?.template,
    },
  } as never)
  return silenceCommand(command)
}

function quietInit(command: InitCommand, options?: QuietInitOptions): InitCommand {
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
  return silenceCommand(command)
}

describe('install-state ownership', () => {
  let originalCwd: string
  let originalHome: string | undefined
  let testDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    originalHome = process.env.HOME
    testDir = await createTestDir('aiw-install-state-ownership')
    // Redirect HOME so installGlobalResolver writes into the temp dir
    // instead of polluting the real ~/.aiwcli/bin/
    process.env.HOME = testDir
    process.chdir(testDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }

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

  it('does not install anything when interactive setup is cancelled', async () => {
    // Mock inquirer prompts at the module boundary: the wizard calls select,
    // checkbox, input (x2), then confirm. Return plausible answers for the
    // first four and `false` for the confirmation to trigger cancellation.
    const {default: mockSelect} = await import('@inquirer/select')
    const {default: mockCheckbox} = await import('@inquirer/checkbox')
    const {default: mockInput} = await import('@inquirer/input')
    const {default: mockConfirm} = await import('@inquirer/confirm')

    vi.mocked(mockSelect).mockResolvedValue('cc-native')
    vi.mocked(mockCheckbox).mockResolvedValue(['claude'])
    vi.mocked(mockInput).mockResolvedValue('test-user')
    vi.mocked(mockConfirm).mockResolvedValue(false)

    const command = quietInit(new InitCommand([], {} as never), {interactive: true})
    const logSpy = vi.mocked(command.log)

    await command.run()

    // Observable output: cancellation message was logged
    const loggedMessages = logSpy.mock.calls.map((args) => args[0]).join('\n')
    expect(loggedMessages).to.include('cancelled')

    // Observable state: no core directory was created
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
    await fs.mkdir(join(testDir, '.aiwcli', '_planning-with-files'), {recursive: true})
    await fs.writeFile(join(testDir, '.aiwcli', '_planning-with-files', 'placeholder.md'), '# legacy\n', 'utf8')
    await reconstructIdeSettings(testDir, ['planning-with-files'], ['claude'])

    await quietInit(new InitCommand([], {} as never), {ides: ['claude'], method: 'cc-native'}).run()

    const installState = JSON.parse(await fs.readFile(join(testDir, '.aiwcli', 'state', 'install-state.json'), 'utf8'))
    expect(Object.keys(installState.methods).sort()).to.deep.equal(['cc-native', 'planning-with-files'])

    const settings = await fs.readFile(join(testDir, '.claude', 'settings.json'), 'utf8')
    expect(settings).to.include('init-session.sh')
    expect(settings).to.include('mark_questions_asked.ts')
  })

  it('clears a legacy install without relying on settings methods metadata', async () => {
    await fs.mkdir(join(testDir, '.aiwcli', '_cc-native'), {recursive: true})
    await fs.mkdir(join(testDir, '.claude', 'commands', 'cc-native'), {recursive: true})
    await fs.writeFile(join(testDir, '.claude', 'commands', 'cc-native', 'placeholder.md'), '# test\n', 'utf8')
    await reconstructIdeSettings(testDir, ['cc-native'], ['claude'])

    await quietClear(new ClearCommand([], {} as never), {template: 'cc-native'}).run()

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

    await quietClear(new ClearCommand([], {} as never), {template: 'gsd'}).run()

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
    const initialExclude = await fs.readFile(excludePath, 'utf8')
    expect(initialExclude).to.include('.claude/')
    expect(initialExclude).to.include('.cognition/')

    await quietClear(new ClearCommand([], {} as never)).run()

    const exclude = await fs.readFile(excludePath, 'utf8')
    expect(exclude).to.not.include('.aiwcli/')
    expect(exclude).to.not.include('.claude/')
    expect(exclude).to.not.include('.cognition/')
    expect(exclude).to.not.include('.codex/')
    expect(exclude).to.not.include('.windsurf/')
  })
})
