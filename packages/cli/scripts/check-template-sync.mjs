#!/usr/bin/env node

/**
 * Pre-commit sync checker for template and .aiwcli/_core files.
 *
 * Compares:
 *   .aiwcli/_core/lib-ts/{runtime,context,hooks}/*.ts  <->  packages/cli/src/lib/{runtime,context,hooks}/*.ts
 *   .aiwcli/_core/lib-ts/types.ts                      <->  packages/cli/src/lib/types.ts
 *   .aiwcli/_core/lib-ts/schemas.ts                    <->  packages/cli/src/lib/schemas.ts
 *   packages/cli/src/lib/{runtime,context,hooks}/*.ts   <->  packages/cli/src/templates/core/lib-ts/{runtime,context,hooks}/*.ts
 *   packages/cli/src/lib/types.ts                       <->  packages/cli/src/templates/core/lib-ts/types.ts
 *   packages/cli/src/lib/schemas.ts                     <->  packages/cli/src/templates/core/lib-ts/schemas.ts
 *
 * Exit 0 if all synced, exit 1 if drift detected.
 * Pure Node.js ESM, no external dependencies, no build step required.
 */

import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SEGMENTS = ['runtime', 'context', 'hooks']

let driftCount = 0
let warnCount = 0

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

function tsFiles(dir) {
  const full = join(ROOT, dir)
  if (!existsSync(full)) return []
  return readdirSync(full).filter((f) => f.endsWith('.ts'))
}

function comparePair(labelA, pathA, labelB, pathB) {
  if (!existsSync(join(ROOT, pathA))) {
    console.error(`  MISSING  ${pathA}`)
    driftCount++
    return
  }

  if (!existsSync(join(ROOT, pathB))) {
    console.error(`  MISSING  ${pathB}`)
    driftCount++
    return
  }

  const a = read(pathA)
  const b = read(pathB)
  if (a !== b) {
    console.error(`  DRIFT    ${pathA}  !=  ${pathB}`)
    driftCount++
  }
}

// ── .aiwcli/_core/lib-ts  <->  packages/cli/src/lib ─────────────────────────

console.log('\n[.aiwcli/_core/lib-ts] <-> [packages/cli/src/lib]')

for (const seg of SEGMENTS) {
  const aiwcliDir = `.aiwcli/_core/lib-ts/${seg}`
  const canonDir = `packages/cli/src/lib/${seg}`

  const aiwcliFiles = tsFiles(aiwcliDir)
  const canonFiles = tsFiles(canonDir)

  // Every file in .aiwcli must match canonical
  for (const file of aiwcliFiles) {
    comparePair(aiwcliDir, `${aiwcliDir}/${file}`, canonDir, `${canonDir}/${file}`)
  }

  // Warn about files only in canonical (CLI-specific utilities)
  const aiwcliSet = new Set(aiwcliFiles)
  for (const file of canonFiles) {
    if (!aiwcliSet.has(file)) {
      console.warn(`  WARN     ${canonDir}/${file} has no counterpart in ${aiwcliDir}/`)
      warnCount++
    }
  }
}

// Standalone files
comparePair('.aiwcli', '.aiwcli/_core/lib-ts/types.ts', 'lib', 'packages/cli/src/lib/types.ts')
comparePair('.aiwcli', '.aiwcli/_core/lib-ts/schemas.ts', 'lib', 'packages/cli/src/lib/schemas.ts')

// ── packages/cli/src/lib  <->  packages/cli/src/templates/core/lib-ts ────────

console.log('\n[packages/cli/src/lib] <-> [packages/cli/src/templates/core/lib-ts]')

for (const seg of SEGMENTS) {
  const canonDir = `packages/cli/src/lib/${seg}`
  const templateDir = `packages/cli/src/templates/core/lib-ts/${seg}`

  const canonFiles = tsFiles(canonDir)

  for (const file of canonFiles) {
    comparePair(canonDir, `${canonDir}/${file}`, templateDir, `${templateDir}/${file}`)
  }
}

// Standalone files
comparePair('lib', 'packages/cli/src/lib/types.ts', 'template', 'packages/cli/src/templates/core/lib-ts/types.ts')
comparePair('lib', 'packages/cli/src/lib/schemas.ts', 'template', 'packages/cli/src/templates/core/lib-ts/schemas.ts')

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('')
if (driftCount === 0) {
  console.log(`All template files are in sync.${warnCount > 0 ? ` (${warnCount} warning${warnCount === 1 ? '' : 's'})` : ''}`)
  process.exit(0)
} else {
  console.error(`${driftCount} file${driftCount === 1 ? '' : 's'} out of sync.${warnCount > 0 ? ` ${warnCount} warning${warnCount === 1 ? '' : 's'}.` : ''}`)
  process.exit(1)
}
