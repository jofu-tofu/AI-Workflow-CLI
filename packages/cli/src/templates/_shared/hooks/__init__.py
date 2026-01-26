"""Shared hooks for AIW CLI templates.

These hooks integrate with Claude Code's hook system to provide:
- UserPromptSubmit: Context enforcement (ensures work happens in tracked context)
- PostToolUse: Context monitoring and handoff warnings
- ExitPlanMode: Plan archival to context

Hooks read JSON input from stdin and output instructions to stdout.

Available hooks:
- user_prompt_submit.py: Runs on user prompt, enforces context tracking
- context_monitor.py: Runs on PostToolUse, monitors context and warns when low
- archive_plan.py: Runs on ExitPlanMode, archives plan to context
- task_create_capture.py: Runs on TaskCreate, captures task events
- task_update_capture.py: Runs on TaskUpdate, captures task updates
"""
