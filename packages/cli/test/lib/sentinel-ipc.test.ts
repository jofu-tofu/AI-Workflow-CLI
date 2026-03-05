import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  buildShellCaptureScript,
  cleanupSentinelIpc,
  cleanupSentinelPath,
  createSentinelIpcPaths,
  readSentinelExitCode,
  readTextIfExists,
  waitForSentinelFile,
} from '../../src/lib/runtime/sentinel-ipc.js'

const tempDirs = new Set<string>()

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, {recursive: true, force: true})
  }

  tempDirs.clear()
})

describe('runtime/sentinel-ipc', () => {
  it('creates IPC paths in a sanitized temp directory', () => {
    const paths = createSentinelIpcPaths('aiw prefix!*')
    tempDirs.add(paths.tmpDir)

    expect(fs.existsSync(paths.tmpDir)).toBe(true)
    expect(path.basename(paths.tmpDir)).toContain('aiw-prefix')
    expect(paths.inputPath).toBe(path.join(paths.tmpDir, 'input.txt'))
    expect(paths.stdoutPath).toBe(path.join(paths.tmpDir, 'stdout.txt'))
    expect(paths.stderrPath).toBe(path.join(paths.tmpDir, 'stderr.txt'))
    expect(paths.sentinelPath).toBe(path.join(paths.tmpDir, 'sentinel.txt'))
  })

  it('builds shell capture script with quoted I/O paths', () => {
    const script = buildShellCaptureScript(
      'claude --print',
      {
        inputPath: '/tmp/in file',
        stdoutPath: '/tmp/out file',
        stderrPath: '/tmp/err file',
        sentinelPath: '/tmp/sentinel file',
      },
      (value) => `'${value}'`,
    )

    expect(script).toBe(
      "claude --print < '/tmp/in file' > '/tmp/out file' 2> '/tmp/err file' ; echo $? > '/tmp/sentinel file'",
    )
  })

  it('waits for sentinel file and resolves true when file appears in time', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-ipc-test-'))
    tempDirs.add(dir)
    const sentinelPath = path.join(dir, 'sentinel.txt')

    setTimeout(() => {
      fs.writeFileSync(sentinelPath, '0')
    }, 30)

    const found = await waitForSentinelFile(sentinelPath, 500, 10)
    expect(found).toBe(true)
  })

  it('returns false when sentinel file does not appear before timeout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-ipc-test-'))
    tempDirs.add(dir)
    const sentinelPath = path.join(dir, 'missing.txt')

    const found = await waitForSentinelFile(sentinelPath, 60, 10)
    expect(found).toBe(false)
  })

  it('reads valid exit code and falls back for missing/invalid content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-ipc-test-'))
    tempDirs.add(dir)
    const valid = path.join(dir, 'valid.txt')
    const invalid = path.join(dir, 'invalid.txt')
    const missing = path.join(dir, 'missing.txt')

    fs.writeFileSync(valid, ' 42 \n')
    fs.writeFileSync(invalid, 'not-a-number')

    expect(readSentinelExitCode(valid, 1)).toBe(42)
    expect(readSentinelExitCode(invalid, 7)).toBe(7)
    expect(readSentinelExitCode(missing, 9)).toBe(9)
  })

  it('reads text only when file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-ipc-test-'))
    tempDirs.add(dir)
    const existing = path.join(dir, 'stdout.txt')
    const missing = path.join(dir, 'missing.txt')

    fs.writeFileSync(existing, 'hello')

    expect(readTextIfExists(existing)).toBe('hello')
    expect(readTextIfExists(missing)).toBe('')
  })

  it('removes temporary directories with cleanupSentinelIpc', () => {
    const paths = createSentinelIpcPaths('cleanup-test')
    const {tmpDir} = paths

    expect(fs.existsSync(tmpDir)).toBe(true)
    cleanupSentinelIpc(paths)
    expect(fs.existsSync(tmpDir)).toBe(false)
  })

  it('removes sentinel parent directory with cleanupSentinelPath', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-ipc-test-'))
    const sentinelPath = path.join(dir, 'sentinel.txt')
    fs.writeFileSync(sentinelPath, '0')

    expect(fs.existsSync(dir)).toBe(true)
    cleanupSentinelPath(sentinelPath)
    expect(fs.existsSync(dir)).toBe(false)
  })
})
