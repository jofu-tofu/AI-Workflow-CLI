---
description: Implements Manus-style file-based planning for complex tasks. Creates task_plan.md, findings.md, and progress.md in _output/planning-with-files/. Use when starting complex multi-step tasks, research projects, or any task requiring >5 tool calls.
auto_execution_mode: 1
---

IT IS CRITICAL THAT YOU FOLLOW THESE STEPS:

<steps CRITICAL="TRUE">
1. Always LOAD the FULL @.claude/skills/planning-with-files/SKILL.md
2. READ its entire contents - this contains the complete Planning with Files methodology and instructions
3. Follow all rules and workflows EXACTLY as written in the skill file
4. Create planning files in the `_output/planning-with-files/` directory (NOT in the skill directory)
5. Use the templates from `.claude/skills/planning-with-files/templates/` as reference
</steps>

## Quick Start Reminder

Before ANY complex task:

1. **Create `_output/planning-with-files/task_plan.md`** - Track phases and progress
2. **Create `_output/planning-with-files/findings.md`** - Store research and discoveries
3. **Create `_output/planning-with-files/progress.md`** - Session log and test results

You can run `.claude/skills/planning-with-files/scripts/init-session.sh` to create all three files automatically.

## The 4 Key Rules

1. **Create Plan First** - Never start without task_plan.md
2. **The 2-Action Rule** - Save findings after every 2 view/browser operations
3. **Read Before Decide** - Re-read plan before major decisions
4. **Update After Act** - Mark phases complete and log errors

> See the full skill file @.claude/skills/planning-with-files/SKILL.md for complete instructions, templates, and advanced topics.
