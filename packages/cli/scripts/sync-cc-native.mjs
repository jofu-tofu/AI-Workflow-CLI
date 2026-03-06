import {mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {dirname, join, relative, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cliRoot = resolve(scriptDir, '..')
const repoRoot = resolve(cliRoot, '..', '..')
const sourceRoot = join(repoRoot, '.aiwcli', '_cc-native')
const destinationRoot = join(cliRoot, 'src', 'templates', 'cc-native', '_cc-native')

// Reserved for install-path rewrites if cc-native mirror files gain runtime-only literals.
const CONTENT_REWRITES = []

rmSync(destinationRoot, {recursive: true, force: true})
copyDirRecursive(sourceRoot, destinationRoot)

console.log('Synced cc-native template mirror from .aiwcli/_cc-native.')

function copyDirRecursive(sourceDir, destinationDir) {
  mkdirSync(destinationDir, {recursive: true})

  for (const name of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, name)
    const destinationPath = join(destinationDir, name)
    const stat = statSync(sourcePath)

    if (stat.isDirectory()) {
      copyDirRecursive(sourcePath, destinationPath)
      continue
    }

    mkdirSync(dirname(destinationPath), {recursive: true})

    const relativePath = relative(sourceRoot, sourcePath).replaceAll('\\', '/')
    const contents = readFileSync(sourcePath, 'utf8')
    writeFileSync(destinationPath, rewriteContents(relativePath, contents))
  }
}

function rewriteContents(_relativePath, contents) {
  let result = contents
  for (const {from, to} of CONTENT_REWRITES) {
    result = result.replaceAll(from, to)
  }

  return result
}
