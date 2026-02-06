# CC-Native Plan Review Agents

Agent persona definitions for single-turn plan review.

## System Prompt vs Agent Flag

**Decision:** Use `--system-prompt` with markdown body content instead of `--agent <name>`

**Rationale:**
- Claude Code's `--agent` flag invokes built-in agents designed for multi-turn agentic workflows with tool access
- Plan review needs single-turn text analysis: read plan, output structured JSON
- The `--agent` flag ignores our custom markdown content entirely - it loads Claude Code's built-in agent definitions
- Using `--system-prompt` lets us inject the full persona (expertise, review approach, output requirements) directly
- Result: faster execution, no tool overhead, and our rich agent descriptions actually get used

**Constraint:** If you switch back to `--agent`, the elaborate persona content in these markdown files will be ignored. The reviews will use Claude Code's generic agent behavior instead of our specialized reviewers.

## File Structure

Each agent file has:
- **Frontmatter (YAML):** name, model, focus, categories, enabled
- **Body (Markdown):** Full persona content → becomes `system_prompt` for `--system-prompt` flag

The `aggregate_agents.py` script (`_cc-native/scripts/aggregate_agents.py`) extracts both parts. The body becomes `AgentConfig.system_prompt`.

## --setting-sources "" Requirement

**Decision:** Use `--setting-sources ""` to disable user/project settings loading

**Rationale:**
- Without this flag, Claude Code loads user settings (~43k cached tokens of PAI context)
- The PAI Algorithm instructions override the agent's system prompt behavior
- Model tries to follow PAI format instead of calling StructuredOutput directly
- Result: 6+ turns, 30+ seconds, often no structured output

**Constraint:** If you remove `--setting-sources ""`, agent reviews will be slow and unreliable due to PAI context interference.

## --max-turns 3 Requirement

**Decision:** Use `--max-turns 3` with agent invocations

**Rationale:**
- `--max-turns 1` is too restrictive - the model needs turn 1 to call StructuredOutput, turn 2 for the tool result
- `--max-turns 2` works but leaves no buffer for edge cases
- `--max-turns 3` gives safety margin while still preventing runaway multi-turn behavior
- With these settings, reviews complete in ~5-10 seconds

**Constraint:** The agent markdown files MUST contain clear instructions to "call StructuredOutput IMMEDIATELY" and "do NOT use any other tools". Without these instructions, the model will try to use its turns for file operations instead of outputting the review.

## enabled: false Convention

**Decision:** Set `enabled: false` in frontmatter for all plan review agents

**Rationale:** The `enabled` field controls Claude Code's auto-suggestion feature (showing agents in command palette). For plan review agents, we don't want them appearing as general-purpose agents - they're invoked programmatically by the hook. Setting `enabled: false` hides them from auto-suggestion while still allowing the hook to use them.

**Constraint:** Don't set `enabled: true` unless you want the agent to appear in Claude Code's agent picker for general use.
