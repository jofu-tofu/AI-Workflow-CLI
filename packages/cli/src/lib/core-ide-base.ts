import type {ClaudeSettings} from './claude-settings-types.js'
import type {WindsurfHooks} from './windsurf-hooks-types.js'

const RESOLVER = 'bun .aiwcli/_core/scripts/resolve-run.ts'
const CORE_ROOT = '.aiwcli/_core'

function cmd(relativePath: string): string {
  return `${RESOLVER} ${CORE_ROOT}/${relativePath}`
}

export function getCoreClaudeSettingsBase(): ClaudeSettings {
  return {
    statusLine: {
      type: 'command',
      command: cmd('scripts/status_line.ts'),
    },
    fileSuggestion: {
      type: 'command',
      command: cmd('hooks-ts/file-suggestion.ts'),
    },
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '*',
          hooks: [{type: 'command', command: cmd('hooks-ts/user_prompt_submit.ts'), timeout: 10 * 1000}],
        },
        {
          hooks: [{type: 'command', command: cmd('hooks-ts/codex_explorer.ts'), timeout: 55 * 1000}],
        },
      ],
      PostToolUse: [
        {
          matcher: '*',
          hooks: [{type: 'command', command: cmd('hooks-ts/context_monitor.ts'), timeout: 5000}],
        },
        {
          matcher: 'TaskCreate',
          hooks: [{type: 'command', command: cmd('hooks-ts/task_create_capture.ts'), timeout: 3000}],
        },
        {
          matcher: 'TaskUpdate',
          hooks: [{type: 'command', command: cmd('hooks-ts/task_update_capture.ts'), timeout: 3000}],
        },
        {
          matcher: 'ExitPlanMode',
          hooks: [{type: 'command', command: cmd('hooks-ts/archive_plan.ts'), timeout: 5000}],
        },
        {
          matcher: 'Write|Edit',
          hooks: [{type: 'command', command: cmd('hooks-ts/lint_after_edit.ts'), timeout: 10 * 1000}],
        },
      ],
      SessionStart: [
        {
          matcher: '*',
          hooks: [{type: 'command', command: cmd('hooks-ts/session_start.ts'), timeout: 5000}],
        },
      ],
      SessionEnd: [
        {
          matcher: '*',
          hooks: [{type: 'command', command: cmd('hooks-ts/session_end.ts'), timeout: 5000}],
        },
      ],
      PreCompact: [
        {
          matcher: '*',
          hooks: [{type: 'command', command: cmd('hooks-ts/pre_compact.ts'), timeout: 5000}],
        },
      ],
      PermissionRequest: [
        {
          matcher: 'ExitPlanMode',
          hooks: [{type: 'command', command: cmd('hooks-ts/archive_plan.ts'), timeout: 5000}],
        },
      ],
    },
  }
}

export function getCoreWindsurfHooksBase(): WindsurfHooks {
  return {hooks: {}}
}
