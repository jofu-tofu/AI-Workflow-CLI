import {Args, Flags} from '@oclif/core'

import {createBranchCommandDependencies} from '../capabilities/branch/adapters.js'
import {executeBranchCommand} from '../capabilities/branch/control-plane.js'
import BaseCommand from '../lib/base-command.js'

/**
 * Manage git branch operations: launch in main/master or delete branch and worktree.
 *
 * This command supports two modes:
 * 1. --main: Opens a new terminal window with `aiw launch` running in the main/master branch
 * 2. --delete: Deletes a git branch and its worktree folder
 */
export default class BranchCommand extends BaseCommand {
  static override args = {
    branchName: Args.string({
      description: 'Name of the branch for worktree creation or deletion',
      required: false,
    }),
  }
static override description =
    'Manage git branches with worktree support or launch in main/master\n\n' +
    'MODES\n' +
    '  --main/-m: Launch aiw in main/master branch in new terminal\n' +
    '  --launch/-l <branch>: Create/open git worktree in sibling folder\n' +
    '  --delete/-d <branch>: Delete git branch and worktree folder\n' +
    '  --delete --all: Clean up all worktrees (soft delete, safe mode)\n\n' +
    'SOFT DELETE (--delete --all)\n' +
    '  Safely removes worktrees that meet ALL criteria:\n' +
    '  • Not main/master branch\n' +
    '  • No unpushed commits to remote\n' +
    '  • No open pull requests\n' +
    '  • Not the current working directory\n' +
    '  Outputs summary of deleted and preserved worktrees\n\n' +
    'REQUIREMENTS\n' +
    '  • Must be in a git repository\n' +
    '  • For --main: Must be on a branch (not already on main/master)\n' +
    '  • For --main: main or master branch must exist\n' +
    '  • For --delete: Must not be in the branch being deleted\n\n' +
    'EXIT CODES\n' +
    '  0  Success - Operation completed\n' +
    '  1  General error - unexpected runtime failure\n' +
    '  2  Invalid usage - requirements not met\n' +
    '  3  Environment error - git not found or not a git repository'
static override examples = [
    '<%= config.bin %> <%= command.id %> --main',
    '<%= config.bin %> <%= command.id %> --main --debug  # Enable verbose logging',
    '<%= config.bin %> <%= command.id %> --launch feature-name',
    '<%= config.bin %> <%= command.id %> -l fix-bug-123',
    '<%= config.bin %> <%= command.id %> --delete feature-branch',
    '<%= config.bin %> <%= command.id %> -d fix-bug-123',
    '<%= config.bin %> <%= command.id %> --delete --all  # Clean up all safe-to-delete worktrees',
    '<%= config.bin %> <%= command.id %> -d -a  # Same as above, using short flags',
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    main: Flags.boolean({
      char: 'm',
      description: 'Launch aiw in main/master branch in new terminal',
      exclusive: ['launch', 'delete'],
    }),
    launch: Flags.boolean({
      char: 'l',
      description: 'Create git worktree in sibling folder or open if exists',
      exclusive: ['main', 'delete'],
    }),
    delete: Flags.boolean({
      char: 'd',
      description: 'Delete git branch and worktree folder',
      exclusive: ['main', 'launch'],
    }),
    all: Flags.boolean({
      char: 'a',
      description: 'With --delete: clean up all worktrees (soft delete, skips unpushed commits and open PRs)',
      dependsOn: ['delete'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchCommand)

    await executeBranchCommand({
      args: {
        branchName: args.branchName,
      },
      cwd: process.cwd(),
      flags: {
        all: flags.all,
        delete: flags.delete,
        launch: flags.launch,
        main: flags.main,
      },
    }, {
      debug: (...parts) => this.debug(...parts),
      error: (message, options) => {
        if (options?.exit === undefined) {
          return this.error(message)
        }

        return this.error(message, {exit: options.exit})
      },
      log: (message) => this.log(message),
      logInfo: (message) => this.logInfo(message),
      logSuccess: (message) => this.logSuccess(message),
    }, createBranchCommandDependencies())
  }
}
