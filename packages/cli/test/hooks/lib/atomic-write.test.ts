import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {atomicAppend, atomicWrite} from '../../../src/templates/core/lib-ts/runtime/atomic-write.js'

describe('atomic-write', () => {
  const dirs: string[] = []

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop()
      if (!dir) continue
      rmSync(dir, {force: true, recursive: true})
    }
  })

  it('atomicWrite writes a new file successfully', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiwcli-phase5-atomic-write-'))
    dirs.push(dir)
    const filePath = join(dir, 'state.json')

    const [ok, err] = atomicWrite(filePath, '{"phase":5}')
    expect(ok).toBe(true)
    expect(err).toBeNull()
    expect(readFileSync(filePath, 'utf8')).toBe('{"phase":5}')
  })

  it('atomicWrite creates missing parent directories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiwcli-phase5-atomic-write-'))
    dirs.push(dir)
    const filePath = join(dir, 'nested', 'deep', 'state.json')

    const [ok, err] = atomicWrite(filePath, 'content')
    expect(ok).toBe(true)
    expect(err).toBeNull()
    expect(readFileSync(filePath, 'utf8')).toBe('content')
  })

  it('atomicWrite leaves no temp files behind on success', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiwcli-phase5-atomic-write-'))
    dirs.push(dir)
    const filePath = join(dir, 'index.json')

    const [ok] = atomicWrite(filePath, '{"ok":true}')
    expect(ok).toBe(true)

    const leftovers = readdirSync(dir).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('atomicAppend appends to an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiwcli-phase5-atomic-write-'))
    dirs.push(dir)
    const filePath = join(dir, 'events.jsonl')
    atomicWrite(filePath, 'line-1\n')

    const [ok, err] = atomicAppend(filePath, 'line-2\n')
    expect(ok).toBe(true)
    expect(err).toBeNull()
    expect(readFileSync(filePath, 'utf8')).toBe('line-1\nline-2\n')
  })

  it('atomicAppend creates file when it does not already exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiwcli-phase5-atomic-write-'))
    dirs.push(dir)
    const filePath = join(dir, 'new-events.jsonl')

    const [ok, err] = atomicAppend(filePath, 'first\n')
    expect(ok).toBe(true)
    expect(err).toBeNull()
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf8')).toBe('first\n')
  })
})
