import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cliRoot = resolve(scriptDir, '..')
const canonicalLib = join(cliRoot, 'src', 'lib')
const templateLib = join(cliRoot, 'src', 'templates', 'core', 'lib-ts')

const mappings = [
  { source: join(canonicalLib, 'runtime'), destination: join(templateLib, 'runtime') },
  { source: join(canonicalLib, 'context'), destination: join(templateLib, 'context') },
  { source: join(canonicalLib, 'hooks'), destination: join(templateLib, 'hooks') },
  { source: join(canonicalLib, 'types.ts'), destination: join(templateLib, 'types.ts') },
]

for (const {source, destination} of mappings) {
  mkdirSync(dirname(destination), {recursive: true})
  const sourceStat = statSync(source)
  if (sourceStat.isDirectory()) {
    copyDirRecursive(source, destination)
  } else {
    copyFileSync(source, destination)
  }
}

console.log('Synced core lib (runtime/context/hooks/types) into templates.')

function copyDirRecursive(sourceDir, destinationDir) {
  mkdirSync(destinationDir, {recursive: true})
  for (const name of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, name)
    const destinationPath = join(destinationDir, name)
    const st = statSync(sourcePath)
    if (st.isDirectory()) {
      copyDirRecursive(sourcePath, destinationPath)
    } else {
      copyFileSync(sourcePath, destinationPath)
    }
  }
}
