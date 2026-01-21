#!/usr/bin/env node
/**
 * Watch templates directory and copy changes to dist.
 * Used for development workflow to auto-sync template changes.
 */

import {copyFile, mkdir} from 'node:fs/promises'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

import {watch} from 'chokidar'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_TEMPLATES = join(__dirname, '..', 'templates')
const DIST_TEMPLATES = join(__dirname, '..', '..', 'dist', 'templates')

/**
 * Copy a file from src/templates to dist/templates preserving structure.
 */
async function copyTemplate(filePath: string): Promise<void> {
  const relativePath = relative(SRC_TEMPLATES, filePath)
  const destPath = join(DIST_TEMPLATES, relativePath)

  try {
    await mkdir(dirname(destPath), {recursive: true})
    await copyFile(filePath, destPath)
    logChange('copied', relativePath)
  } catch (error) {
    logError(`Failed to copy ${relativePath}`, error)
  }
}

/**
 * Log a change with timestamp.
 */
function logChange(action: string, path: string): void {
  const timestamp = new Date().toLocaleTimeString()
  const supportsColor = process.stdout.isTTY
  if (supportsColor) {
    console.log(`\u001B[2m[${timestamp}]\u001B[0m \u001B[32m${action}\u001B[0m ${path}`)
  } else {
    console.log(`[${timestamp}] ${action} ${path}`)
  }
}

/**
 * Log an error.
 */
function logError(message: string, error: unknown): void {
  const timestamp = new Date().toLocaleTimeString()
  console.error(`[${timestamp}] \u001B[31merror\u001B[0m ${message}:`, error)
}

/**
 * Start watching templates directory.
 */
function startWatching(): void {
  console.log('Watching templates for changes...')
  console.log(`  Source: ${SRC_TEMPLATES}`)
  console.log(`  Dest:   ${DIST_TEMPLATES}`)
  console.log('')

  const watcher = watch(SRC_TEMPLATES, {
    ignoreInitial: true,
    persistent: true,
  })

  watcher.on('add', copyTemplate)
  watcher.on('change', copyTemplate)
  watcher.on('error', (error) => logError('Watcher error', error))

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nStopping template watcher...')
    watcher.close().catch(() => {})
  })

  process.on('SIGTERM', () => {
    watcher.close().catch(() => {})
  })
}

// Run if executed directly
startWatching()
