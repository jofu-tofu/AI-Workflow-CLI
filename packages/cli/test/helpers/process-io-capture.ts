interface CapturedStream {
  getOutput(): string
  restore(): void
}

function captureStream(
  stream: NodeJS.WriteStream,
): CapturedStream {
  const output: string[] = []
  const target = stream as NodeJS.WriteStream & {write: (...args: unknown[]) => boolean}
  const originalWrite = target.write.bind(target)

  target.write = ((chunk: unknown, ...args: unknown[]) => {
    if (typeof chunk === 'string') {
      output.push(chunk)
    } else if (chunk instanceof Uint8Array) {
      output.push(Buffer.from(chunk).toString('utf8'))
    } else {
      output.push(String(chunk))
    }

    const callback = args.find((arg): arg is (error?: Error | null) => void => typeof arg === 'function')
    if (callback) callback(null)
    return true
  }) as typeof target.write

  return {
    getOutput(): string {
      return output.join('')
    },
    restore(): void {
      target.write = originalWrite as typeof target.write
    },
  }
}

export function captureStdout(): CapturedStream {
  return captureStream(process.stdout)
}

export function captureStderr(): CapturedStream {
  return captureStream(process.stderr)
}
