import {vi} from 'vitest'

export function stubPlatform(platform: NodeJS.Platform): () => void {
  const platformStub = vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  return () => {
    platformStub.mockRestore()
  }
}

export function stubEnv(overrides: Record<string, string | undefined>): () => void {
  const previous: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}
