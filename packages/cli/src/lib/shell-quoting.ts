export function quoteForSh(input: string): string {
  return `'${input.replaceAll("'", "'\"'\"'")}'`
}

export function quoteForPowerShell(input: string): string {
  return `'${input.replaceAll("'", "''")}'`
}

/** Wrap a PowerShell command using -EncodedCommand to avoid all quoting issues. */
export function toEncodedPowerShell(command: string): string {
  const encoded = Buffer.from(command, 'utf16le').toString('base64')
  return `powershell.exe -NoProfile -EncodedCommand ${encoded}`
}

export function escapeSingleQuotedPath(path: string, dialect: 'bash' | 'powershell'): string {
  if (dialect === 'powershell') {
    return path.replaceAll("'", "''")
  }

  return path.replaceAll("'", String.raw`'\''`)
}
