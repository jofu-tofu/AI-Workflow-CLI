import type {ContextFixture} from '../fixtures/context-fixture.js'

/**
 * Build environment variables for running a hook subprocess.
 */
export function hookEnv(
  fixture: ContextFixture,
  sessionId: string,
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    CLAUDE_PROJECT_DIR: fixture.projectRoot,
    CLAUDE_SESSION_ID: sessionId,
    ...overrides,
  }
}
