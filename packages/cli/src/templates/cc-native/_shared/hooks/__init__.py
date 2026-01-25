"""Shared hooks for AIW CLI templates.

These hooks integrate with Claude Code's hook system to provide:
- SessionStart: Context discovery and plan handoff
- ExitPlanMode: Plan archival to context
- UserPromptSubmit: Context-aware handoff (low context warning)

Hooks read JSON input from stdin and output instructions to stdout.

Available hooks:
- session_start.py: Runs on session start, shows context picker or auto-continues
- archive_plan.py: Runs on ExitPlanMode, archives plan to context
- context_aware_handoff.py: Runs on UserPromptSubmit, warns when context is low
"""
