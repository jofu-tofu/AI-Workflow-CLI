import {promises as fs} from 'node:fs'
import {join} from 'node:path'

import {pathExists} from './paths.js'

/**
 * Read a JSON file and parse it as type T.
 * Returns undefined if the file doesn't exist or can't be parsed.
 */
export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch {
    return undefined
  }
}

/**
 * Write data as JSON to a file, optionally creating a backup of the existing file.
 * Creates parent directories if needed.
 */
export async function writeJsonFile<T>(filePath: string, data: T, options?: {backup?: boolean}): Promise<void> {
  const dir = join(filePath, '..')
  await fs.mkdir(dir, {recursive: true})
  if (options?.backup && await pathExists(filePath)) {
    const backupPath = `${filePath}.backup`
    await fs.copyFile(filePath, backupPath)
  }
  const content = JSON.stringify(data, null, 2)
  await fs.writeFile(filePath, content, 'utf8')
}
