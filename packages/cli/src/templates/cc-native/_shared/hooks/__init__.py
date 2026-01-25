"""Shared hooks for AIW CLI templates.

These hooks integrate with Claude Code's hook system to provide:
- SessionStart: Context discovery and plan handoff
- ExitPlanMode: Plan archival to context

Hooks read JSON input from stdin and output instructions to stdout.
"""
