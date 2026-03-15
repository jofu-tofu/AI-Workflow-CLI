import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {IdePathResolver} from './ide-path-resolver.js'
import {pathExists} from './paths.js'
import {copyDir, mergeDirectory} from './template-installer.js'
import {getTemplatePath} from './template-resolver.js'

/**
 * Install core runtime assets into .aiwcli/_core.
 */
export async function installCoreAssets(targetDir: string, ides: string[]): Promise<string[]> {
  const resolver = new IdePathResolver(targetDir)
  const containerDir = resolver.getAiwcliContainer()
  const coreDir = resolver.getCoreFolder()

  await fs.mkdir(containerDir, {recursive: true})

  const sourceRoot = await getTemplatePath('core')
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

export async function getCoreResolverSourcePath(): Promise<string> {
  return join(await getTemplatePath('core'), 'scripts', 'resolve-run.ts')
}
