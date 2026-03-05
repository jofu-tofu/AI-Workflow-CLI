import {execSync} from 'node:child_process'
import {copyFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync} from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

// Temporary workaround until upstream LSP spawn bug is fixed.
// Tracks: https://github.com/anthropics/claude-code/issues/17136
//         https://github.com/anthropics/claude-code/issues/19658

/**
 * Regex matching the LSP spawn options in Claude Code's bundled cli.js.
 * The single-letter variable name changes across versions (X in v2.1.63, D in v2.1.69),
 * so we capture the variable name dynamically.
 */
const SPAWN_PATTERN =
  /\{stdio:\["pipe","pipe","pipe"\],env:([A-Za-z_$][\w$]*)\?\.env\?\{\.\.\.globalThis\.process\.env,\.\.\.\1\.env\}:void 0,cwd:\1\?\.cwd,windowsHide:!0\}/

/** Build the replacement string with the captured variable name and shell:true. */
function buildReplacement(varName: string): string {
  return `{stdio:["pipe","pipe","pipe"],env:${varName}?.env?{...globalThis.process.env,...${varName}.env}:void 0,cwd:${varName}?.cwd,windowsHide:!0,shell:process.platform==="win32"}`
}

/**
 * Patches the npm-installed Claude Code cli.js to add `shell: true` on Windows
 * for LSP subprocess spawning, then renames the native binary so the npm shim
 * takes precedence on PATH.
 *
 * Safe ordering: locate → backup → patch → verify → rename.
 * Never throws. On unknown failure, emits a warning and returns.
 */
export async function ensureLspPatch(options: {
  debugLog: (msg: string) => void
  warn: (msg: string) => void
}): Promise<void> {
  const {debugLog, warn} = options

  try {
    // Step 1 — Guard: only applies on Windows
    if (process.platform !== 'win32') return

    // Step 2 — Locate npm cli.js
    let npmPrefix: string
    try {
      npmPrefix = execSync('npm config get prefix', {timeout: 3000, encoding: 'utf8'}).trim()
    } catch {
      debugLog('LSP patch: could not determine npm prefix, skipping')
      return
    }

    const cliJsPath = path.join(
      npmPrefix, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js',
    )
    if (!existsSync(cliJsPath)) {
      warn('Windows LSP fix requires: npm i -g @anthropic-ai/claude-code')
      return
    }

    // Step 3 — Locate npm shim
    const shimPath = path.join(npmPrefix, 'claude.cmd')
    if (!existsSync(shimPath)) {
      warn('npm claude.cmd shim not found, skipping LSP patch')
      return
    }

    // Step 4 — Read cli.js and check patch status
    let content: string
    try {
      content = readFileSync(cliJsPath, 'utf8')
    } catch {
      warn('LSP patch: cannot read cli.js, skipping')
      return
    }

    if (content.includes('shell:process.platform==="win32"')) {
      debugLog('LSP patch: already applied')
      renamNativeBinary(debugLog, warn)
      return
    }

    // Step 5 — Patch cli.js (with diagnostic detection)
    const match = SPAWN_PATTERN.exec(content)
    if (!match) {
      // Distinguish: upstream fixed vs pattern restructured
      if (content.includes('shell:process.platform==="win32"') || content.includes("shell:process.platform==='win32'")) {
        // Upstream added shell:true natively — patch is obsolete
        debugLog('LSP patch: upstream now includes shell:true — patch no longer needed!')
        renamNativeBinary(debugLog, warn)
        return
      }

      // Pattern restructured — needs manual update
      const spawnSnippet = content.match(/\{stdio:\["pipe","pipe","pipe"\][^}]{0,200}\}/)?.[0] ?? '(spawn pattern not found)'
      warn(
        `LSP patch: spawn pattern changed in new Claude Code version — manual update needed.\n` +
        `  Current pattern: ${spawnSnippet}\n` +
        `  Update SPAWN_PATTERN in: packages/cli/src/lib/lsp-patch.ts`,
      )
      return
    }

    const patched = content.replace(SPAWN_PATTERN, buildReplacement(match[1]!))

    // Backup original (only if .bak doesn't already exist)
    const bakPath = cliJsPath + '.bak'
    if (!existsSync(bakPath)) {
      try {
        copyFileSync(cliJsPath, bakPath)
        debugLog(`LSP patch: backed up cli.js to ${bakPath}`)
      } catch {
        // Non-fatal — continue with patch
        debugLog('LSP patch: could not create backup, continuing')
      }
    }

    // Atomic write: write to tmp, then rename over original
    const tmpPath = cliJsPath + '.tmp'
    try {
      writeFileSync(tmpPath, patched, 'utf8')
      renameSync(tmpPath, cliJsPath)
      debugLog('LSP patch: applied successfully')
    } catch (error: unknown) {
      const {code} = (error as NodeJS.ErrnoException)
      if (code === 'EACCES' || code === 'EPERM') {
        warn('LSP patch: permission denied writing cli.js')
      } else {
        warn(`LSP patch: write failed — ${code ?? error}`)
      }

      return
    }

    // Step 6 — Rename native binary
    renamNativeBinary(debugLog, warn)
  } catch (error) {
    // Catch-all: never let this function throw
    warn(`LSP patch: unexpected error — ${error}`)
  }
}

/**
 * Renames the native Claude binary in ~/.local/bin/ so the npm shim
 * (which points to the patched cli.js) takes precedence on PATH.
 */
function renamNativeBinary(
  debugLog: (msg: string) => void,
  warn: (msg: string) => void,
): void {
  const localBin = path.join(os.homedir(), '.local', 'bin')

  for (const name of ['claude.exe', 'claude']) {
    const src = path.join(localBin, name)
    if (!existsSync(src)) continue

    try {
      const stat = statSync(src)
      // Native Bun binary is ~242MB; npm shim is tiny
      if (stat.size <= 1_000_000) continue

      const ext = path.extname(name)
      const base = path.basename(name, ext)
      const target = path.join(localBin, `${base}-native${ext}`)

      if (existsSync(target)) {
        debugLog(`LSP patch: ${target} already exists, skipping rename`)
        continue
      }

      renameSync(src, target)
      debugLog(`LSP patch: renamed ${src} → ${target}`)
    } catch (error: unknown) {
      const {code} = (error as NodeJS.ErrnoException)
      if (code === 'EACCES' || code === 'EPERM') {
        warn(`Cannot rename ${src} — rename manually to ${src.replace(name, name.replace('claude', 'claude-native'))}`)
      } else {
        debugLog(`LSP patch: rename failed for ${src} — ${code ?? error}`)
      }
    }
  }
}


