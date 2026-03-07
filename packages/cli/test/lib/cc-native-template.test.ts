import {execFileSync} from 'node:child_process'
import {cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {expect} from 'chai'
import {afterEach, describe, it} from 'vitest'

function repoRoot(): string {
  const fromFile = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  if (existsSync(join(fromFile, 'packages', 'cli', 'package.json'))) return fromFile

  const cwd = resolve(process.cwd())
  if (existsSync(join(cwd, 'packages', 'cli', 'package.json'))) return cwd

  throw new Error('Unable to resolve repo root for cc-native template tests')
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    output.push(value)
    return output
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output)
    return output
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectStrings(nested, output)
  }

  return output
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, {recursive: true, force: true})
  }
})

describe('cc-native template ownership', () => {
  const root = repoRoot()
  const cliRoot = join(root, 'packages', 'cli')
  const templateRoot = join(cliRoot, 'src', 'templates', 'cc-native')
  const runtimeRoot = join(templateRoot, '_cc-native')

  it('keeps build scripts independent from repo-root .aiwcli/_cc-native', () => {
    const packageJson = readJson(join(cliRoot, 'package.json')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['sync:cc-native']).to.equal(undefined)
    expect(packageJson.scripts?.['build:templates']).to.not.include('sync:cc-native')
  })

  it('contains every _cc-native file referenced by the template settings', () => {
    const settings = readJson(join(templateRoot, '.claude', 'settings.json'))
    const referencedPaths = collectStrings(settings)
      .flatMap((value) => value.match(/\.aiwcli\/_cc-native\/[^\s"']+/g) ?? [])
      .map((value) => value.replace('.aiwcli/_cc-native/', ''))
      .sort()

    expect(referencedPaths.length).to.be.greaterThan(0)

    for (const relativePath of referencedPaths) {
      expect(existsSync(join(runtimeRoot, relativePath)), relativePath).to.equal(true)
    }
  })

  it('can package templates in isolation without a repo-root .aiwcli/_cc-native tree', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'aiwcli-cc-native-template-'))
    tempDirs.push(tempRoot)

    const tempCliRoot = join(tempRoot, 'packages', 'cli')
    mkdirSync(join(tempCliRoot, 'scripts'), {recursive: true})
    mkdirSync(join(tempCliRoot, 'src'), {recursive: true})

    cpSync(join(cliRoot, 'scripts', 'sync-shared-lib.mjs'), join(tempCliRoot, 'scripts', 'sync-shared-lib.mjs'))
    cpSync(join(cliRoot, 'src', 'lib'), join(tempCliRoot, 'src', 'lib'), {recursive: true})
    cpSync(join(cliRoot, 'src', 'templates'), join(tempCliRoot, 'src', 'templates'), {recursive: true})

    expect(existsSync(join(tempRoot, '.aiwcli', '_cc-native'))).to.equal(false)

    execFileSync(process.execPath, ['./scripts/sync-shared-lib.mjs'], {
      cwd: tempCliRoot,
      stdio: 'pipe',
    })

    const distTemplates = join(tempCliRoot, 'dist', 'templates')
    mkdirSync(distTemplates, {recursive: true})
    cpSync(join(tempCliRoot, 'src', 'templates', 'core'), join(distTemplates, 'core'), {recursive: true})
    cpSync(join(tempCliRoot, 'src', 'templates', 'cc-native'), join(distTemplates, 'cc-native'), {recursive: true})
    cpSync(join(tempCliRoot, 'src', 'templates', 'CLAUDE.md'), join(distTemplates, 'CLAUDE.md'))

    expect(existsSync(join(distTemplates, 'cc-native', '_cc-native', 'cc-native.config.json'))).to.equal(true)
    expect(existsSync(join(distTemplates, 'cc-native', '.claude', 'settings.json'))).to.equal(true)
  })
})
