import {join} from 'node:path'

/**
 * Centralized IDE and AIW path resolver.
 * Provides consistent path construction for all IDE and AIW folders/files.
 *
 * This utility ensures that path construction is consistent across the codebase
 * and reduces coupling by providing a single source of truth for path patterns.
 *
 * @example
 * ```typescript
 * const resolver = new IdePathResolver('/path/to/project')
 *
 * // Get .claude folder path
 * const claudePath = resolver.getClaudeDir()
 * // Returns: /path/to/project/.claude
 *
 * // Get .claude/settings.json path
 * const settingsPath = resolver.getClaudeSettings()
 * // Returns: /path/to/project/.claude/settings.json
 * ```
 */
export class IdePathResolver {
  private readonly projectRoot: string

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  /**
   * Get the .aiwcli container directory path
   *
   * @returns Absolute path to .aiwcli directory
   */
  getAiwcliContainer(): string {
    return join(this.projectRoot, '.aiwcli')
  }

  /**
   * Get path to a folder within the .aiwcli container
   *
   * @param folderName - Folder name within .aiwcli (e.g., '_shared', '_bmad')
   * @returns Absolute path to the folder
   */
  getAiwcliFolder(folderName: string): string {
    return join(this.getAiwcliContainer(), folderName)
  }

  /**
   * Get path to a file/folder within .claude directory
   *
   * @param relativePath - Relative path within .claude (e.g., 'settings.json', 'commands/bmad')
   * @returns Absolute path to the file/folder
   */
  getClaude(relativePath: string): string {
    return join(this.getClaudeDir(), relativePath)
  }

  /**
   * Get the .claude directory path
   *
   * @returns Absolute path to .claude directory
   */
  getClaudeDir(): string {
    return join(this.projectRoot, '.claude')
  }

  /**
   * Get the .claude/settings.json path
   *
   * @returns Absolute path to Claude settings file
   */
  getClaudeSettings(): string {
    return this.getClaude('settings.json')
  }

  /**
   * Get IDE directory path by IDE name
   *
   * @param ideName - IDE name ('claude', 'windsurf', etc.)
   * @returns Absolute path to IDE directory
   */
  getIdeDir(ideName: string): string {
    return join(this.projectRoot, `.${ideName}`)
  }

  /**
   * Get method-specific folder path within .aiwcli
   * Convention: _{methodName} (e.g., _bmad, _gsd, _cc-native)
   *
   * @param methodName - Method name (e.g., 'bmad', 'gsd')
   * @returns Absolute path to method folder
   */
  getMethodFolder(methodName: string): string {
    return this.getAiwcliFolder(`_${methodName}`)
  }

  /**
   * Get the project root directory
   *
   * @returns Absolute path to project root
   */
  getProjectRoot(): string {
    return this.projectRoot
  }

  /**
   * Get the shared folder path within .aiwcli
   *
   * @returns Absolute path to _shared directory
   */
  getSharedFolder(): string {
    return this.getAiwcliFolder('_shared')
  }

  /**
   * Get path to a file/folder within .windsurf directory
   *
   * @param relativePath - Relative path within .windsurf (e.g., 'hooks.json', 'workflows/bmad')
   * @returns Absolute path to the file/folder
   */
  getWindsurf(relativePath: string): string {
    return join(this.getWindsurfDir(), relativePath)
  }

  /**
   * Get the .windsurf directory path
   *
   * @returns Absolute path to .windsurf directory
   */
  getWindsurfDir(): string {
    return join(this.projectRoot, '.windsurf')
  }

  /**
   * Get the .windsurf/hooks.json path
   *
   * @returns Absolute path to Windsurf hooks file
   */
  getWindsurfHooks(): string {
    return this.getWindsurf('hooks.json')
  }
}
