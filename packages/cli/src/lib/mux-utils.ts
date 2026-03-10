import {type ChildProcess, spawn} from 'node:child_process'

import type {LaunchResult} from './multiplexer.js'

const CELL_ASPECT_RATIO = 2

export function getLastLine(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.at(-1) ?? ''
}

export function spawnAttached(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv | undefined,
  backendLabel: string,
): Promise<LaunchResult> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(command, args, {stdio: 'inherit', env: env ?? process.env})
    } catch (error) {
      resolve({launched: false, exitCode: -1, backend: backendLabel, reason: error instanceof Error ? error.message : String(error)})
      return
    }

    child.on('error', (error) => {
      resolve({launched: false, exitCode: -1, backend: backendLabel, reason: error.message})
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({launched: true, exitCode: 0, backend: backendLabel})
      } else {
        resolve({launched: false, exitCode: code ?? 1, backend: backendLabel, reason: `${backendLabel} exited with code ${code ?? 1}`})
      }
    })
  })
}

export function splitFlagFromDimensions(width: number, height: number): '-h' | '-v' {
  return width >= height * CELL_ASPECT_RATIO ? '-h' : '-v'
}
