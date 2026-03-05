import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {expect} from 'chai'

function repoRoot(): string {
  const fromFile = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  if (existsSync(join(fromFile, '.aiwcli', '_cc-native', 'cc-native.config.json'))) return fromFile

  const cwd = resolve(process.cwd())
  if (existsSync(join(cwd, '.aiwcli', '_cc-native', 'cc-native.config.json'))) return cwd

  throw new Error('Unable to resolve repo root for cc-native sync tests')
}

function listRelativeFiles(rootDir: string): string[] {
  const results: string[] = []

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
        continue
      }

      results.push(fullPath.slice(rootDir.length + 1).replaceAll('\\', '/'))
    }
  }

  walk(rootDir)
  return results.sort()
}

describe('cc-native sync', () => {
  const root = repoRoot()
  const sourceRoot = join(root, '.aiwcli', '_cc-native')
  const templateRoot = join(root, 'packages', 'cli', 'src', 'templates', 'cc-native', '_cc-native')

  it('keeps the cc-native template mirror synced with the runtime source tree', () => {
    const sourceFiles = listRelativeFiles(sourceRoot)
    const templateFiles = listRelativeFiles(templateRoot)

    expect(templateFiles).to.deep.equal(sourceFiles)

    for (const relativePath of sourceFiles) {
      const source = readFileSync(join(sourceRoot, relativePath), 'utf8')
      const template = readFileSync(join(templateRoot, relativePath), 'utf8')
      expect(template, relativePath).to.equal(source)
    }
  })

  it('uses plan-review/agents as the only authoritative agent tree', () => {
    expect(existsSync(join(sourceRoot, 'agents'))).to.equal(false)
    expect(existsSync(join(templateRoot, 'agents'))).to.equal(false)
    expect(existsSync(join(sourceRoot, 'plan-review', 'agents', 'PLAN-ORCHESTRATOR.md'))).to.equal(true)
  })
})
