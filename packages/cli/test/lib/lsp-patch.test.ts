import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const mocks = vi.hoisted(() => ({
  copyFileSync: vi.fn(),
  execSync: vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming\\npm'),
  existsSync: vi.fn(() => true),
  homedir: vi.fn(() => 'C:\\Users\\test'),
  readFileSync: vi.fn(() => ''),
  renameSync: vi.fn(),
  statSync: vi.fn(() => ({size: 500})),
  writeFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execSync: mocks.execSync,
}))

vi.mock('node:fs', () => ({
  copyFileSync: mocks.copyFileSync,
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
  renameSync: mocks.renameSync,
  statSync: mocks.statSync,
  writeFileSync: mocks.writeFileSync,
}))

vi.mock('node:os', () => ({
  homedir: mocks.homedir,
}))

import {ensureLspPatch} from '../../src/lib/lsp-patch.js'

const UNPATCHED_CONTENT =
  'blah{stdio:["pipe","pipe","pipe"],env:X?.env?{...globalThis.process.env,...X.env}:void 0,cwd:X?.cwd,windowsHide:!0}blah'

const PATCHED_CONTENT =
  'blah{stdio:["pipe","pipe","pipe"],env:X?.env?{...globalThis.process.env,...X.env}:void 0,cwd:X?.cwd,windowsHide:!0,shell:process.platform==="win32"}blah'

const makeOptions = () => ({debugLog: vi.fn(), warn: vi.fn()})

describe('lsp-patch', () => {
  let platformSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    vi.resetAllMocks()
    // Default: all paths exist, unpatched content
    mocks.existsSync.mockReturnValue(true)
    mocks.readFileSync.mockReturnValue(UNPATCHED_CONTENT)
    mocks.execSync.mockReturnValue('C:\\Users\\test\\AppData\\Roaming\\npm')
    mocks.statSync.mockReturnValue({size: 500})
    mocks.homedir.mockReturnValue('C:\\Users\\test')
  })

  afterEach(() => {
    platformSpy?.mockRestore()
    platformSpy = undefined
  })

  it('returns immediately on non-win32', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(mocks.execSync).not.toHaveBeenCalled()
    expect(opts.warn).not.toHaveBeenCalled()
  })

  it('returns when npm prefix detection fails', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.execSync.mockImplementation(() => {
      throw new Error('npm not found')
    })
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.debugLog).toHaveBeenCalledWith(
      expect.stringContaining('could not determine npm prefix'),
    )
    expect(mocks.readFileSync).not.toHaveBeenCalled()
  })

  it('warns when cli.js does not exist', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.existsSync.mockImplementation((p: string) => !p.includes('cli.js'))
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.warn).toHaveBeenCalledWith(
      expect.stringContaining('npm i -g @anthropic-ai/claude-code'),
    )
  })

  it('warns when claude.cmd shim does not exist', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.existsSync.mockImplementation((p: string) => !p.endsWith('claude.cmd'))
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.warn).toHaveBeenCalledWith(
      expect.stringContaining('claude.cmd shim not found'),
    )
  })

  it('detects already-patched cli.js and skips re-patching', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.readFileSync.mockReturnValue(PATCHED_CONTENT)
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.debugLog).toHaveBeenCalledWith('LSP patch: already applied')
    expect(mocks.writeFileSync).not.toHaveBeenCalled()
  })

  it('applies patch when SPAWN_PATTERN matches', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.readFileSync.mockReturnValue(UNPATCHED_CONTENT)
    // .bak does not exist yet
    mocks.existsSync.mockImplementation((p: string) => !p.endsWith('.bak'))
    const opts = makeOptions()

    await ensureLspPatch(opts)

    // Backup created
    expect(mocks.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining('cli.js'),
      expect.stringContaining('cli.js.bak'),
    )

    // Tmp file written with patched content
    expect(mocks.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('cli.js.tmp'),
      expect.stringContaining('shell:process.platform==="win32"'),
      'utf8',
    )

    // Rename tmp → cli.js
    expect(mocks.renameSync).toHaveBeenCalledWith(
      expect.stringContaining('cli.js.tmp'),
      expect.stringContaining('cli.js'),
    )

    expect(opts.debugLog).toHaveBeenCalledWith('LSP patch: applied successfully')
  })

  it('skips backup when .bak already exists', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.readFileSync.mockReturnValue(UNPATCHED_CONTENT)
    // All paths exist including .bak
    mocks.existsSync.mockReturnValue(true)
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(mocks.copyFileSync).not.toHaveBeenCalled()
    expect(mocks.writeFileSync).toHaveBeenCalled()
  })

  it('handles EACCES write error', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.readFileSync.mockReturnValue(UNPATCHED_CONTENT)
    const err = Object.assign(new Error('EACCES'), {code: 'EACCES'})
    mocks.writeFileSync.mockImplementation(() => {
      throw err
    })
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.warn).toHaveBeenCalledWith(
      expect.stringContaining('permission denied'),
    )
  })

  it('handles EPERM rename error', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.readFileSync.mockReturnValue(UNPATCHED_CONTENT)
    const err = Object.assign(new Error('EPERM'), {code: 'EPERM'})
    mocks.renameSync.mockImplementation(() => {
      throw err
    })
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.warn).toHaveBeenCalledWith(
      expect.stringContaining('permission denied'),
    )
  })

  it('detects upstream fix when content has shell:process.platform but no SPAWN_PATTERN match', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    // Use single-quoted variant so it's NOT caught by the "already applied" check
    // on line 74 (which checks double-quoted), but IS caught by line 84's fallback
    mocks.readFileSync.mockReturnValue(
      "something{stdio:[\"pipe\",\"pipe\",\"pipe\"],restructured:true,shell:process.platform==='win32'}done",
    )
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.debugLog).toHaveBeenCalledWith(
      expect.stringContaining('upstream now includes shell:true'),
    )
    expect(mocks.writeFileSync).not.toHaveBeenCalled()
  })

  it('warns about pattern change when SPAWN_PATTERN does not match and no shell:process.platform found', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    mocks.readFileSync.mockReturnValue(
      'completely different {stdio:["pipe","pipe","pipe"],something_else:true}content',
    )
    const opts = makeOptions()

    await ensureLspPatch(opts)

    expect(opts.warn).toHaveBeenCalledWith(
      expect.stringContaining('spawn pattern changed'),
    )
  })

  it('catches unexpected errors and never throws', async () => {
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    // existsSync throws unexpectedly after prefix detection
    mocks.existsSync.mockImplementation(() => {
      throw new Error('boom')
    })
    const opts = makeOptions()

    // Should not throw
    await ensureLspPatch(opts)

    expect(opts.warn).toHaveBeenCalledWith(
      expect.stringContaining('unexpected error'),
    )
  })

  describe('renamNativeBinary', () => {
    it('renames large native binary', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      // Already patched → triggers renamNativeBinary directly
      mocks.readFileSync.mockReturnValue(PATCHED_CONTENT)
      mocks.statSync.mockReturnValue({size: 250_000_000}) // 250MB native binary
      // claude.exe/claude exist, claude-native targets do NOT
      mocks.existsSync.mockImplementation((p: string) => {
        if (p.includes('claude-native')) return false
        return true
      })
      const opts = makeOptions()

      await ensureLspPatch(opts)

      expect(mocks.renameSync).toHaveBeenCalled()
      expect(opts.debugLog).toHaveBeenCalledWith(
        expect.stringContaining('renamed'),
      )
    })

    it('skips small file (npm shim)', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      mocks.readFileSync.mockReturnValue(PATCHED_CONTENT)
      mocks.statSync.mockReturnValue({size: 500}) // tiny shim
      const opts = makeOptions()

      await ensureLspPatch(opts)

      // renameSync should NOT be called for binary rename
      expect(mocks.renameSync).not.toHaveBeenCalled()
    })

    it('skips when target already exists', async () => {
      platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      mocks.readFileSync.mockReturnValue(PATCHED_CONTENT)
      mocks.statSync.mockReturnValue({size: 250_000_000})
      // Everything exists including the -native target
      mocks.existsSync.mockReturnValue(true)
      const opts = makeOptions()

      await ensureLspPatch(opts)

      expect(opts.debugLog).toHaveBeenCalledWith(
        expect.stringContaining('already exists, skipping rename'),
      )
      expect(mocks.renameSync).not.toHaveBeenCalled()
    })
  })
})
