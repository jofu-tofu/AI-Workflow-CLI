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

  it('keeps schemas synced between canonical lib and template copy', () => {
    const canonical = read(['packages', 'cli', 'src', 'lib', 'schemas.ts'])
    const template = read(['packages', 'cli', 'src', 'templates', 'core', 'lib-ts', 'schemas.ts'])
    expect(template).to.equal(canonical)
  })

  it('keeps .aiwcli/_core/lib-ts/ files synced with packages/cli/src/lib/', () => {
    const root = repoRoot()

    for (const segment of segments) {
      const aiwcliDir = join(root, '.aiwcli', '_core', 'lib-ts', segment)
      const canonicalDir = join(root, 'packages', 'cli', 'src', 'lib', segment)

      if (!existsSync(aiwcliDir)) {
        throw new Error(`.aiwcli/_core/lib-ts/${segment}/ does not exist`)
      }

      const aiwcliFiles = readdirSync(aiwcliDir).filter((name) => name.endsWith('.ts'))
      const canonicalFiles = readdirSync(canonicalDir).filter((name) => name.endsWith('.ts'))

      expect(aiwcliFiles.length).to.be.greaterThan(0)

      // Files in .aiwcli must match packages/cli/src/lib exactly
      for (const file of aiwcliFiles) {
        const aiwcliContent = read(['.aiwcli', '_core', 'lib-ts', segment, file])
        const canonicalContent = read(['packages', 'cli', 'src', 'lib', segment, file])
        expect(aiwcliContent, `.aiwcli/_core/lib-ts/${segment}/${file} differs from packages/cli/src/lib/${segment}/${file}`).to.equal(canonicalContent)
      }

      // Warn about files only in packages/cli/src/lib/ (CLI-specific utilities)
      const aiwcliSet = new Set(aiwcliFiles)
      for (const file of canonicalFiles) {
        if (!aiwcliSet.has(file)) {
          console.warn(`  [warn] packages/cli/src/lib/${segment}/${file} has no counterpart in .aiwcli/_core/lib-ts/${segment}/`)
        }
      }
    }
  })

  it('keeps .aiwcli/_core/lib-ts/types.ts synced with packages/cli/src/lib/types.ts', () => {
    const aiwcliTypes = read(['.aiwcli', '_core', 'lib-ts', 'types.ts'])
    const canonicalTypes = read(['packages', 'cli', 'src', 'lib', 'types.ts'])
    expect(aiwcliTypes).to.equal(canonicalTypes)
  })

  it('keeps .aiwcli/_core/lib-ts/schemas.ts synced with packages/cli/src/lib/schemas.ts', () => {
    const aiwcliSchemas = read(['.aiwcli', '_core', 'lib-ts', 'schemas.ts'])
    const canonicalSchemas = read(['packages', 'cli', 'src', 'lib', 'schemas.ts'])
    expect(aiwcliSchemas).to.equal(canonicalSchemas)
  })
})
