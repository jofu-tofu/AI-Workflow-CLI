import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {expect} from 'chai'

function repoRoot(): string {
  const fromFile = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  if (existsSync(join(fromFile, 'packages', 'cli', 'src', 'lib', 'runtime', 'subprocess-utils.ts'))) return fromFile

  const cwd = resolve(process.cwd())
  if (existsSync(join(cwd, 'packages', 'cli', 'src', 'lib', 'runtime', 'subprocess-utils.ts'))) return cwd

  throw new Error('Unable to resolve repo root for core lib sync tests')
}

function read(pathParts: string[]): string {
  return readFileSync(join(repoRoot(), ...pathParts), 'utf8')
}

describe('core lib sync', () => {
  const segments = ['runtime', 'context', 'hooks'] as const

  for (const segment of segments) {
    it(`keeps ${segment} files synced between canonical lib and template copy`, () => {
      const canonicalDir = join(repoRoot(), 'packages', 'cli', 'src', 'lib', segment)

      const files = readdirSync(canonicalDir).filter((name) => name.endsWith('.ts'))
      expect(files.length).to.be.greaterThan(0)

      for (const file of files) {
        const canonical = read(['packages', 'cli', 'src', 'lib', segment, file])
        const template = read(['packages', 'cli', 'src', 'templates', 'core', 'lib-ts', segment, file])
        expect(template).to.equal(canonical)
      }
    })
  }

  it('keeps core types synced between canonical lib and template copy', () => {
    const canonical = read(['packages', 'cli', 'src', 'lib', 'types.ts'])
    const template = read(['packages', 'cli', 'src', 'templates', 'core', 'lib-ts', 'types.ts'])
    expect(template).to.equal(canonical)
  })
})
