"""Context selection module - determines which context a prompt belongs to.

Single entry point: determine_context(prompt, session_id, project_root)
Returns (context_id, method, output_text).

Selection priority (5 cases):
1. session_match       - session_id found in index.json sessions map
2. caret_command       - prompt starts with ^ -> parse and execute
3. plan_content_match  - hash prompt, match against has_plan contexts' plan_hash
4. plan_signature_match - check prompt[:500] against plan_signature (fallback)
5. default             - create new context

Cases 3-4 fix the concurrent plan bug: after /clear, Claude Code pastes
the plan as the first prompt in a new session. session_match fails because
/clear creates a new session_id. Plan content matching identifies which
has_plan context's plan was pasted.
"""
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from .context_store import (
    ContextState,
    get_context,
    get_all_contexts,
    get_context_by_session_id,
    create_context_from_prompt,
    create_context,
    complete_context,
    bind_session,
    update_mode,
)
from .context_formatter import (
    format_active_context_reminder,
    format_context_created,
    format_context_picker_stderr,
    format_command_feedback,
    format_handoff_continuation,
    format_plan_continuation,
    format_active_continuation,
)
from ..base.subprocess_utils import is_internal_call
from ..base.utils import eprint

# Minimum characters required for new context description
MIN_NEW_CONTEXT_CHARS = 10


class BlockRequest(Exception):
    """Raised when the request should be blocked with a message to user."""
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


@dataclass
class CaretCommand:
    """Parsed caret command result."""
    ends: List[str]  # Context IDs to end (race-safe)
    select: Optional[str]  # Context ID to select (race-safe)
    new_context_desc: Optional[str]  # Description for new context (^0)
    remaining_prompt: str  # The remaining prompt after the command


def resolve_context_by_prefix(query: str, contexts: List[ContextState]) -> Tuple[Optional[int], Optional[str]]:
    """Resolve a context ID query to an index (1-based) using tiered matching.

    Match priority: exact > prefix > substring (all case-insensitive).
    Returns (index, None) on unique match, (None, error) on 0 or 2+ matches.
    """
    q = query.lower()
    available = ', '.join(c.id for c in contexts)

    # Tier 1: Exact match
    exact = [(i, ctx) for i, ctx in enumerate(contexts, 1) if ctx.id.lower() == q]
    if len(exact) == 1:
        return exact[0][0], None

    # Tier 2: Prefix match
    prefix = [(i, ctx) for i, ctx in enumerate(contexts, 1) if ctx.id.lower().startswith(q)]
    if len(prefix) == 1:
        return prefix[0][0], None
    if len(prefix) > 1:
        return None, f"Ambiguous match '{query}' — {len(prefix)} prefix matches: {', '.join(c.id for _, c in prefix)}. Be more specific."

    # Tier 3: Substring match
    substr = [(i, ctx) for i, ctx in enumerate(contexts, 1) if q in ctx.id.lower()]
    if len(substr) == 1:
        return substr[0][0], None
    if len(substr) > 1:
        return None, f"Ambiguous match '{query}' — {len(substr)} substring matches: {', '.join(c.id for _, c in substr)}. Be more specific."

    return None, f"No context matches '{query}'. Available: {available}"


def parse_chained_caret(prompt: str, contexts: List[ContextState]) -> Tuple[Optional[CaretCommand], Optional[str]]:
    """Parse chained caret commands from user prompt.

    Syntax:
    - ^E<N>: End context N
    - ^E<N>+: End context N and all after
    - ^E*: End ALL contexts
    - ^S<N>: Select context N
    - ^0 <desc>: Create new context
    - ^<N>: Shorthand for ^S<N>
    - ^E:query / ^S:query: End/select by ID prefix match (race-safe)
    - Chain: ^E1E2S3 means end 1, end 2, select 3
    """
    if not prompt.startswith("^"):
        return None, None

    match = re.match(r'^\^(\S+)(?:\s+(.*))?$', prompt, re.DOTALL)
    if not match:
        return None, "Invalid prefix. Use ^E<N> to end, ^S<N> to select, or ^0 <desc> for new context."

    command_str = match.group(1)
    remaining = (match.group(2) or "").strip()

    # ^N shorthand
    if command_str.isdigit():
        num = int(command_str)
        if num == 0:
            if len(remaining) < MIN_NEW_CONTEXT_CHARS:
                return None, (
                    f"Please provide a longer description for your new context.\n"
                    f"Your description '{remaining}' is only {len(remaining)} characters.\n"
                    f"Minimum required: {MIN_NEW_CONTEXT_CHARS} characters.\n"
                    f"Example: ^0 implement user authentication with JWT tokens"
                )
            return CaretCommand(ends=[], select=None, new_context_desc=remaining, remaining_prompt=""), None
        else:
            if num < 1 or num > len(contexts):
                if not contexts:
                    return None, "No existing contexts. Use ^0 <description> to create a new one."
                return None, f"Invalid selection. Choose 1-{len(contexts)} for existing contexts, or ^0 for new."
            ctx = contexts[num - 1]
            return CaretCommand(ends=[], select=ctx.id, new_context_desc=None, remaining_prompt=remaining), None

    # Parse chained commands
    ends = []
    select = None
    pos = 0

    while pos < len(command_str):
        if command_str[pos].upper() == 'E':
            pos += 1
            if pos < len(command_str) and command_str[pos] == '*':
                pos += 1
                if not contexts:
                    return None, "No contexts to end."
                for ctx in contexts:
                    if ctx.id not in ends:
                        ends.append(ctx.id)
            elif pos < len(command_str) and command_str[pos] == ':':
                pos += 1
                prefix_start = pos
                while pos < len(command_str) and command_str[pos] not in ('E', 'S', 'e', 's'):
                    pos += 1
                pfx = command_str[prefix_start:pos]
                if not pfx:
                    return None, "Expected ID query after 'E:'"
                idx, err = resolve_context_by_prefix(pfx, contexts)
                if err:
                    return None, err
                ctx = contexts[idx - 1]
                if ctx.id not in ends:
                    ends.append(ctx.id)
            else:
                num_start = pos
                while pos < len(command_str) and command_str[pos].isdigit():
                    pos += 1
                if num_start == pos:
                    return None, f"Expected number, '*', or ':prefix' after 'E' at position {num_start + 1}"
                num = int(command_str[num_start:pos])
                if num < 1 or num > len(contexts):
                    if not contexts:
                        return None, "No contexts to end."
                    return None, f"Context ^E{num} invalid. Choose 1-{len(contexts)}."
                if pos < len(command_str) and command_str[pos] == '+':
                    pos += 1
                    for i in range(num, len(contexts) + 1):
                        ctx = contexts[i - 1]
                        if ctx.id not in ends:
                            ends.append(ctx.id)
                else:
                    ctx = contexts[num - 1]
                    if ctx.id not in ends:
                        ends.append(ctx.id)

        elif command_str[pos].upper() == 'S':
            pos += 1
            if pos < len(command_str) and command_str[pos] == ':':
                pos += 1
                prefix_start = pos
                while pos < len(command_str) and command_str[pos] not in ('E', 'S', 'e', 's'):
                    pos += 1
                pfx = command_str[prefix_start:pos]
                if not pfx:
                    return None, "Expected ID query after 'S:'"
                idx, err = resolve_context_by_prefix(pfx, contexts)
                if err:
                    return None, err
                ctx = contexts[idx - 1]
            else:
                num_start = pos
                while pos < len(command_str) and command_str[pos].isdigit():
                    pos += 1
                if num_start == pos:
                    return None, f"Expected number or ':prefix' after 'S' at position {num_start + 1}"
                num = int(command_str[num_start:pos])
                if num < 1 or num > len(contexts):
                    if not contexts:
                        return None, "No contexts to select."
                    return None, f"Context ^S{num} invalid. Choose 1-{len(contexts)}."
                ctx = contexts[num - 1]
            if select is None:
                select = ctx.id

        else:
            return None, (
                f"Invalid command '{command_str[pos]}' at position {pos + 1}.\n"
                f"Use E<N> to end, E<N>+ to end N and after, E* to end all, S<N> to select.\n"
                f"Example: ^E1S2 (end 1, select 2), ^E2+ (end 2 and older), ^E* (end all)"
            )

    if select is not None and select in ends:
        return None, f"Cannot select context '{select}' because it's being ended."

    return CaretCommand(ends=ends, select=select, new_context_desc=None, remaining_prompt=remaining), None


# ---------------------------------------------------------------------------
# Plan content matching (the concurrent plan bug fix)
# ---------------------------------------------------------------------------

def _match_plan_content(prompt: str, has_plan_contexts: List[ContextState]) -> Optional[ContextState]:
    """Match pasted plan content to a has_plan context.

    After /clear, Claude Code pastes the plan as the first prompt.
    1. Deterministic hash match (plan_hash stored in state.json)
    2. Signature match (plan_signature in prompt[:500])
    3. Most recent has_plan context (last resort)
    """
    if not has_plan_contexts:
        return None

    prompt_hash = hashlib.sha256(prompt.encode('utf-8')).hexdigest()[:12]

    # Case 3: Deterministic hash match
    for ctx in has_plan_contexts:
        if ctx.plan_hash and ctx.plan_hash == prompt_hash:
            return ctx

    # Case 4: Signature match
    prompt_head = prompt[:500]
    for ctx in has_plan_contexts:
        if ctx.plan_signature and ctx.plan_signature in prompt_head:
            return ctx

    # No match — let caller fall through to new context creation
    return None


# ---------------------------------------------------------------------------
# Context creation helper
# ---------------------------------------------------------------------------

def _create_new_context(prompt: str, project_root: Path) -> Tuple[Optional[str], str, Optional[str]]:
    """Create a new context from the user's prompt (case 5: default)."""
    try:
        new_ctx = create_context_from_prompt(prompt, project_root)
        update_mode(new_ctx.id, "active", project_root=project_root)
        new_ctx.mode = "active"
        eprint(f"[context_selector] Auto-created context: {new_ctx.id}")
        return (new_ctx.id, "auto_created", format_context_created(new_ctx))
    except Exception as e:
        eprint(f"[context_selector] Primary context creation failed: {e}")
        try:
            from datetime import datetime
            fallback_id = datetime.now().strftime("%y%m%d-%H%M") + "-context"
            new_ctx = create_context(
                context_id=fallback_id,
                summary=prompt.strip()[:200] or "New context",
                method="auto-created-fallback",
                tags=["auto-created", "fallback"],
                project_root=project_root,
            )
            update_mode(new_ctx.id, "active", project_root=project_root)
            new_ctx.mode = "active"
            eprint(f"[context_selector] Fallback context created: {new_ctx.id}")
            return (new_ctx.id, "auto_created_fallback", format_context_created(new_ctx))
        except Exception as e2:
            eprint(f"[context_selector] ALL context creation failed: {e2}")
            return (None, "creation_failed", None)


# ---------------------------------------------------------------------------
# Caret command handler
# ---------------------------------------------------------------------------

def _handle_caret_command(
    prompt: str,
    contexts: List[ContextState],
    project_root: Path,
) -> Tuple[Optional[str], str, Optional[str]]:
    """Handle explicit caret commands (^E, ^S, ^0, ^N).

    Raises:
        BlockRequest: When command is invalid or selection needed
    """
    if not contexts:
        match = re.match(r'^\^(\S+)(?:\s+(.*))?$', prompt, re.DOTALL)
        if not match:
            raise BlockRequest(
                "Invalid prefix. Use ^0 <description> to create a new context.\n"
                "Example: ^0 implement user authentication system"
            )
        prefix_value = match.group(1)
        remaining = match.group(2) or ""
        if not prefix_value.isdigit() or int(prefix_value) != 0:
            raise BlockRequest(
                "No existing contexts to select. Use ^0 <description> to create a new context.\n"
                "Example: ^0 implement user authentication system"
            )
        description = remaining.strip()
        if len(description) < MIN_NEW_CONTEXT_CHARS:
            raise BlockRequest(
                f"Please provide a longer description for your new context.\n"
                f"Your description '{description}' is only {len(description)} characters.\n"
                f"Minimum required: {MIN_NEW_CONTEXT_CHARS} characters.\n"
                f"Example: ^0 implement user authentication with JWT tokens"
            )
        return _create_new_context(description, project_root)

    cmd, error = parse_chained_caret(prompt, contexts)
    if error:
        raise BlockRequest(error + "\n" + format_context_picker_stderr(contexts))
    if not cmd:
        raise BlockRequest(format_context_picker_stderr(contexts))

    ended_contexts = []
    for ctx_id in cmd.ends:
        ctx_to_end = next((c for c in contexts if c.id == ctx_id), None)
        if ctx_to_end is None:
            raise BlockRequest(f"Context '{ctx_id}' no longer exists.\n" + format_context_picker_stderr(contexts))
        complete_context(ctx_to_end.id, project_root)
        ended_contexts.append(ctx_to_end)
        eprint(f"[context_selector] Ended context: {ctx_to_end.id}")

    if cmd.new_context_desc:
        ctx_id, method, output = _create_new_context(cmd.new_context_desc, project_root)
        if ctx_id and ended_contexts:
            new_ctx = get_context(ctx_id, project_root)
            output = format_command_feedback(ended_contexts, new_ctx)
        return (ctx_id, "caret_new" if method != "creation_failed" else method, output)

    if cmd.select:
        selected_ctx = next((c for c in contexts if c.id == cmd.select), None)
        if selected_ctx is None:
            raise BlockRequest(f"Context '{cmd.select}' no longer exists.\n" + format_context_picker_stderr(contexts))
        eprint(f"[context_selector] Caret-selected context: {selected_ctx.id}")
        return (selected_ctx.id, "caret_select", format_command_feedback(ended_contexts, selected_ctx))

    if ended_contexts:
        remaining_contexts = get_all_contexts(status="active", project_root=project_root)
        feedback = format_command_feedback(ended_contexts, None)
        if not remaining_contexts:
            raise BlockRequest(
                feedback + "\nAll contexts have been ended. No context selected.\n\n"
                "Just type your task to start a new context.\n"
                "Example: implement user authentication system"
            )
        raise BlockRequest(
            feedback + "\nNo context selected.\n\nSelect a context to continue:\n" +
            format_context_picker_stderr(remaining_contexts)
        )

    raise BlockRequest(format_context_picker_stderr(contexts))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def determine_context(
    prompt: str,
    session_id: str = None,
    project_root: Path = None,
) -> Tuple[Optional[str], str, Optional[str]]:
    """Determine which context this prompt belongs to.

    Selection priority (5 cases):
    1. session_match        - session_id already bound to a context
    2. caret_command        - prompt starts with ^, parse and execute
    3. plan_content_match   - hash prompt matches a has_plan context's plan_hash
    4. plan_signature_match - prompt[:500] contains plan's first 200 chars
    5. default              - create new context

    Returns:
        (context_id, method, output_text)

    Raises:
        BlockRequest: When request should be blocked to show picker
    """
    if is_internal_call():
        eprint("[context_selector] Skipping: internal subprocess call")
        return (None, "skip_internal", None)

    # --- Case 1: session_match ---
    if session_id:
        session_context = get_context_by_session_id(session_id, project_root)
        if session_context:
            eprint(f"[context_selector] Session match: {session_context.id}")
            return (
                session_context.id,
                "session_match",
                format_active_context_reminder(session_context, project_root),
            )

    # --- Case 2: caret_command ---
    if prompt.strip() == "^":
        contexts = get_all_contexts(status="active", project_root=project_root)
        if not contexts:
            raise BlockRequest(
                "No contexts exist.\n\nJust type your task to start a new context.\n"
                "Example: implement user authentication system"
            )
        raise BlockRequest(format_context_picker_stderr(contexts))

    if prompt.startswith("^"):
        contexts = get_all_contexts(status="active", project_root=project_root)
        return _handle_caret_command(prompt, contexts, project_root)

    # --- Cases 3-4: plan_content_match / plan_signature_match ---
    has_plan_contexts = [
        c for c in get_all_contexts(status="active", project_root=project_root)
        if c.mode == "has_plan"
    ]

    if has_plan_contexts:
        matched = _match_plan_content(prompt, has_plan_contexts)
        if matched:
            prompt_hash = hashlib.sha256(prompt.encode('utf-8')).hexdigest()[:12]
            method = "plan_content_match" if matched.plan_hash == prompt_hash else "plan_signature_match"

            if session_id:
                bind_session(matched.id, session_id, project_root)

            update_mode(matched.id, "active", project_root=project_root)
            matched.mode = "active"

            eprint(f"[context_selector] Plan {method}: {matched.id}")
            return (matched.id, method, format_plan_continuation(matched, project_root))

    # --- Case 5: default ---
    return _create_new_context(prompt, project_root)


__all__ = [
    "determine_context",
    "BlockRequest",
    "CaretCommand",
    "resolve_context_by_prefix",
    "parse_chained_caret",
]
