import {promises as fs} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {IdePathResolver} from './ide-path-resolver.js'
import {pathExists} from './paths.js'
import {copyDir} from './template-installer.js'

/**
 * Install core runtime assets into .aiwcli/_core.
 */
export async function installCoreAssets(targetDir: string, ides: string[]): Promise<string[]> {
  const resolver = new IdePathResolver(targetDir)
  const containerDir = resolver.getAiwcliContainer()
  const coreDir = resolver.getCoreFolder()

  await fs.mkdir(containerDir, {recursive: true})

  const sourceRoot = getCoreAssetSource()
  if (!(await pathExists(sourceRoot))) {
    throw new Error(`Core assets not found at ${sourceRoot}. This indicates a corrupted installation.`)
  }

  // Copy runtime payload into .aiwcli/_core
  await copyDir(sourceRoot, coreDir, true)

  // Copy core IDE content (Codex skills, Windsurf workflows, etc.) from source dot folders.
  for (const ide of ides) {
    const srcIdeDir = join(sourceRoot, `.${ide}`)
    if (!(await pathExists(srcIdeDir))) continue // eslint-disable-line no-await-in-loop
    const dstIdeDir = resolver.getIdeDir(ide)
    await mergeDirectory(srcIdeDir, dstIdeDir) // eslint-disable-line no-await-in-loop
  }

  return ['_core']
}

export function getCoreResolverSourcePath(): string {
  return join(getCoreAssetSource(), 'scripts', 'resolve-run.ts')
}

function getCoreAssetSource(): string {
  const currentFilePath = fileURLToPath(import.meta.url)
  const currentDir = dirname(currentFilePath)
  return join(currentDir, '..', 'templates', 'core')
}

async function mergeDirectory(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, {recursive: true})
  const entries = await fs.readdir(src, {withFileTypes: true})

  const operations = entries.map(async (entry) => {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)

    if (entry.isDirectory()) {
      await mergeDirectory(srcPath, destPath)
      return
    }

    if (!(await pathExists(destPath))) {
      await fs.copyFile(srcPath, destPath)
    }
  })

  await Promise.all(operations)
}
