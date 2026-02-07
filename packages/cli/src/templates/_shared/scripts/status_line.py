#!/usr/bin/env python3
"""Status line for Claude Code sessions.

Renders context window usage and git status with ANSI colors.
Optionally persists context_window data to the session's state.json.

Ported from PAI statusline.ts — context and git sections only.

Usage: echo '{"session_id":"...","model":{"display_name":"Opus"},...}' | python status_line.py
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

# ---------------------------------------------------------------------------
# Path setup (matches save_handoff.py pattern)
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
SHARED_ROOT = SCRIPT_DIR.parent  # _shared/
sys.path.insert(0, str(SHARED_ROOT))

from lib.base.atomic_write import atomic_write
from lib.base.hook_utils import CONTEXT_BASELINE_TOKENS

# Cache file for session_id → context_id mapping
OUTPUT_DIR = Path(".") / "_output"
STATUSLINE_CACHE = OUTPUT_DIR / ".statusline-cache.json"

# ---------------------------------------------------------------------------
# NO_COLOR support (https://no-color.org)
# ---------------------------------------------------------------------------
NO_COLOR = bool(os.environ.get("NO_COLOR"))

RESET = "" if NO_COLOR else "\x1b[0m"

# Structural
SLATE_300 = "" if NO_COLOR else "\x1b[38;2;203;213;225m"
SLATE_400 = "" if NO_COLOR else "\x1b[38;2;148;163;184m"
SLATE_500 = "" if NO_COLOR else "\x1b[38;2;100;116;139m"
SLATE_600 = "" if NO_COLOR else "\x1b[38;2;71;85;105m"

# Semantic
EMERALD = "" if NO_COLOR else "\x1b[38;2;74;222;128m"
ROSE = "" if NO_COLOR else "\x1b[38;2;251;113;133m"
AMBER = "" if NO_COLOR else "\x1b[38;2;251;191;36m"

# Context colors
CTX_PRIMARY = "" if NO_COLOR else "\x1b[38;2;129;140;248m"
CTX_SECONDARY = "" if NO_COLOR else "\x1b[38;2;165;180;252m"
CTX_ACCENT = "" if NO_COLOR else "\x1b[38;2;139;92;246m"
CTX_BUCKET_EMPTY = "" if NO_COLOR else "\x1b[38;2;75;82;95m"

# Git colors
GIT_PRIMARY = "" if NO_COLOR else "\x1b[38;2;56;189;248m"
GIT_VALUE = "" if NO_COLOR else "\x1b[38;2;186;230;253m"
GIT_DIR = "" if NO_COLOR else "\x1b[38;2;147;197;253m"
GIT_CLEAN = "" if NO_COLOR else "\x1b[38;2;125;211;252m"
GIT_MODIFIED = "" if NO_COLOR else "\x1b[38;2;96;165;250m"
GIT_ADDED = "" if NO_COLOR else "\x1b[38;2;59;130;246m"
GIT_STASH = "" if NO_COLOR else "\x1b[38;2;165;180;252m"
GIT_AGE_FRESH = "" if NO_COLOR else "\x1b[38;2;125;211;252m"
GIT_AGE_RECENT = "" if NO_COLOR else "\x1b[38;2;96;165;250m"
GIT_AGE_STALE = "" if NO_COLOR else "\x1b[38;2;59;130;246m"
GIT_AGE_OLD = "" if NO_COLOR else "\x1b[38;2;99;102;241m"

# ---------------------------------------------------------------------------
# Display modes
# ---------------------------------------------------------------------------

def get_terminal_width() -> int:
    """Detect terminal width with fallbacks."""
    # Try COLUMNS env var first
    cols_env = os.environ.get("COLUMNS")
    if cols_env:
        try:
            cols = int(cols_env)
            if cols > 0:
                return cols
        except ValueError:
            pass

    # Try os.get_terminal_size
    try:
        return os.get_terminal_size().columns
    except (OSError, ValueError):
        pass

    return 80


def get_display_mode(width: int) -> str:
    """Map terminal width to display mode."""
    if width < 35:
        return "nano"
    if width < 55:
        return "micro"
    if width < 80:
        return "mini"
    return "normal"


# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------

def get_bucket_color(pos: int, max_pos: int) -> str:
    """Get gradient color for context bar bucket at position."""
    if NO_COLOR:
        return ""
    pct = (pos * 100) // max_pos

    if pct <= 33:
        r = 74 + ((250 - 74) * pct) // 33
        g = 222 + ((204 - 222) * pct) // 33
        b = 128 + ((21 - 128) * pct) // 33
    elif pct <= 66:
        t = pct - 33
        r = 250 + ((251 - 250) * t) // 33
        g = 204 + ((146 - 204) * t) // 33
        b = 21 + ((60 - 21) * t) // 33
    else:
        t = pct - 66
        r = 251 + ((239 - 251) * t) // 34
        g = 146 + ((68 - 146) * t) // 34
        b = 60 + ((68 - 60) * t) // 34

    return f"\x1b[38;2;{r};{g};{b}m"


# ---------------------------------------------------------------------------
# Context bar rendering
# ---------------------------------------------------------------------------

def render_context_bar(width: int, pct: int) -> Tuple[str, str]:
    """Render the context usage bar with gradient colors.

    Returns (bar_string, last_filled_color).
    """
    pct = max(0, min(100, pct))
    filled = (pct * width) // 100
    last_color = EMERALD
    parts = []

    for i in range(1, width + 1):
        if i <= filled:
            color = get_bucket_color(i, width)
            last_color = color
            parts.append(f"{color}\u26C1{RESET}")
        else:
            parts.append(f"{CTX_BUCKET_EMPTY}\u26C1{RESET}")
        if width > 8:
            parts.append(" ")

    return "".join(parts).rstrip(), last_color


# ---------------------------------------------------------------------------
# Separator
# ---------------------------------------------------------------------------

SEPARATOR = f"{SLATE_600}" + "\u2500" * 72 + f"{RESET}"


# ---------------------------------------------------------------------------
# Context section
# ---------------------------------------------------------------------------

def shorten_model(name: str) -> str:
    """Shorten common model display names."""
    replacements = [
        ("claude-opus-4-6", "opus-4.6"),
        ("claude-opus-4-5", "opus-4.5"),
        ("claude-sonnet-4", "sonnet-4"),
        ("claude-3-5-sonnet", "sonnet-3.5"),
        ("claude-3-5-haiku", "haiku-3.5"),
        ("claude-", ""),
    ]
    result = name
    for old, new in replacements:
        result = result.replace(old, new)
    return result


def render_context(
    mode: str,
    context_pct: int,
    context_k: int,
    max_k: int,
    time_display: str,
    model_name: str,
) -> None:
    """Render the context usage section."""
    if context_pct <= 33:
        pct_color = EMERALD
    elif context_pct <= 66:
        pct_color = AMBER
    else:
        pct_color = ROSE

    short_model = shorten_model(model_name)

    if mode == "nano":
        bar, _ = render_context_bar(5, context_pct)
        print(
            f"{CTX_PRIMARY}\u25C9{RESET} {CTX_ACCENT}{short_model}{RESET} "
            f"{bar} {pct_color}{context_pct}%{RESET} "
            f"{CTX_ACCENT}\u23F1{RESET} {SLATE_300}{time_display}{RESET}"
        )
    elif mode == "micro":
        bar, _ = render_context_bar(6, context_pct)
        print(
            f"{CTX_PRIMARY}\u25C9{RESET} {CTX_ACCENT}{short_model}{RESET} "
            f"{SLATE_600}\u2502{RESET} "
            f"{bar} {pct_color}{context_pct}%{RESET} {SLATE_500}({context_k}k){RESET} "
            f"{CTX_ACCENT}\u23F1{RESET} {SLATE_300}{time_display}{RESET}"
        )
    elif mode == "mini":
        bar, _ = render_context_bar(8, context_pct)
        print(
            f"{CTX_PRIMARY}\u25C9{RESET} {CTX_ACCENT}{short_model}{RESET} "
            f"{SLATE_600}\u2502{RESET} "
            f"{CTX_SECONDARY}CTX:{RESET} {bar} "
            f"{pct_color}{context_pct}%{RESET} {SLATE_500}({context_k}k/{max_k}k){RESET} "
            f"{CTX_ACCENT}\u23F1{RESET} {SLATE_300}{time_display}{RESET}"
        )
    else:  # normal
        bar, last_color = render_context_bar(16, context_pct)
        print(
            f"{CTX_PRIMARY}\u25C9{RESET} {CTX_SECONDARY}Model:{RESET} {CTX_ACCENT}{short_model}{RESET} "
            f"{SLATE_600}\u2502{RESET} "
            f"{CTX_SECONDARY}Context:{RESET} {bar} "
            f"{last_color}{context_pct}%{RESET} {SLATE_500}({context_k}k/{max_k}k){RESET} "
            f"{SLATE_600}\u2502{RESET} "
            f"{CTX_ACCENT}\u23F1{RESET} {SLATE_300}{time_display}{RESET}"
        )

    print(SEPARATOR)


# ---------------------------------------------------------------------------
# Git status
# ---------------------------------------------------------------------------

def _run_git(args: list, cwd: str, timeout: int = 2) -> Optional[str]:
    """Run a git command and return stdout, or None on failure."""
    try:
        kwargs: Dict[str, Any] = {
            "capture_output": True,
            "text": True,
            "timeout": timeout,
            "cwd": cwd,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        result = subprocess.run(["git"] + args, **kwargs)
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None


def get_git_status(cwd: str) -> Optional[Dict[str, Any]]:
    """Gather git repository status."""
    # Check if git repo
    if _run_git(["rev-parse", "--git-dir"], cwd) is None:
        return None

    status: Dict[str, Any] = {
        "branch": "detached",
        "modified": 0,
        "staged": 0,
        "untracked": 0,
        "stash_count": 0,
        "ahead": 0,
        "behind": 0,
        "age_display": "",
        "age_color": GIT_AGE_FRESH,
    }

    # Branch
    branch = _run_git(["branch", "--show-current"], cwd)
    if branch:
        status["branch"] = branch

    # Modified files
    diff = _run_git(["diff", "--name-only"], cwd)
    if diff:
        status["modified"] = len([l for l in diff.splitlines() if l])

    # Staged files
    staged = _run_git(["diff", "--cached", "--name-only"], cwd)
    if staged:
        status["staged"] = len([l for l in staged.splitlines() if l])

    # Untracked files
    untracked = _run_git(["ls-files", "--others", "--exclude-standard"], cwd)
    if untracked:
        status["untracked"] = len([l for l in untracked.splitlines() if l])

    # Stash count
    stash = _run_git(["stash", "list"], cwd)
    if stash:
        status["stash_count"] = len([l for l in stash.splitlines() if l])

    # Ahead/behind
    ab = _run_git(["rev-list", "--left-right", "--count", "HEAD...@{u}"], cwd)
    if ab:
        parts = ab.split()
        if len(parts) >= 2:
            status["ahead"] = int(parts[0] or 0)
            status["behind"] = int(parts[1] or 0)

    # Commit age
    log = _run_git(["log", "-1", "--format=%ct"], cwd)
    if log:
        try:
            import time
            last_epoch = int(log)
            now_epoch = int(time.time())
            age_sec = now_epoch - last_epoch
            age_min = age_sec // 60
            age_hrs = age_sec // 3600
            age_days = age_sec // 86400

            if age_min < 1:
                status["age_display"] = "now"
                status["age_color"] = GIT_AGE_FRESH
            elif age_hrs < 1:
                status["age_display"] = f"{age_min}m"
                status["age_color"] = GIT_AGE_FRESH
            elif age_hrs < 24:
                status["age_display"] = f"{age_hrs}h"
                status["age_color"] = GIT_AGE_RECENT
            elif age_days < 7:
                status["age_display"] = f"{age_days}d"
                status["age_color"] = GIT_AGE_STALE
            else:
                status["age_display"] = f"{age_days}d"
                status["age_color"] = GIT_AGE_OLD
        except (ValueError, TypeError):
            pass

    return status


def render_git(mode: str, git: Dict[str, Any], dir_name: str) -> None:
    """Render the git status section."""
    total_changed = git["modified"] + git["staged"]
    status_icon = "*" if (total_changed > 0 or git["untracked"] > 0) else "\u2713"

    if mode == "nano":
        line = f"{GIT_PRIMARY}\u25C8{RESET} {GIT_DIR}{dir_name}{RESET} {GIT_VALUE}{git['branch']}{RESET} "
        if status_icon == "\u2713":
            line += f"{GIT_CLEAN}\u2713{RESET}"
        else:
            line += f"{GIT_MODIFIED}*{total_changed}{RESET}"
        print(line)

    elif mode == "micro":
        line = f"{GIT_PRIMARY}\u25C8{RESET} {GIT_DIR}{dir_name}{RESET} {GIT_VALUE}{git['branch']}{RESET}"
        if git["age_display"]:
            line += f" {git['age_color']}{git['age_display']}{RESET}"
        line += " "
        if status_icon == "\u2713":
            line += f"{GIT_CLEAN}{status_icon}{RESET}"
        else:
            line += f"{GIT_MODIFIED}{status_icon}{total_changed}{RESET}"
        print(line)

    elif mode == "mini":
        line = (
            f"{GIT_PRIMARY}\u25C8{RESET} {GIT_DIR}{dir_name}{RESET} "
            f"{SLATE_600}\u2502{RESET} {GIT_VALUE}{git['branch']}{RESET}"
        )
        if git["age_display"]:
            line += f" {SLATE_600}\u2502{RESET} {git['age_color']}{git['age_display']}{RESET}"
        line += f" {SLATE_600}\u2502{RESET} "
        if status_icon == "\u2713":
            line += f"{GIT_CLEAN}{status_icon}{RESET}"
        else:
            line += f"{GIT_MODIFIED}{status_icon}{total_changed}{RESET}"
            if git["untracked"] > 0:
                line += f" {GIT_ADDED}+{git['untracked']}{RESET}"
        print(line)

    else:  # normal
        line = (
            f"{GIT_PRIMARY}\u25C8{RESET} {GIT_PRIMARY}PWD:{RESET} {GIT_DIR}{dir_name}{RESET} "
            f"{SLATE_600}\u2502{RESET} "
            f"{GIT_PRIMARY}Branch:{RESET} {GIT_VALUE}{git['branch']}{RESET}"
        )
        if git["age_display"]:
            line += f" {SLATE_600}\u2502{RESET} {GIT_PRIMARY}Age:{RESET} {git['age_color']}{git['age_display']}{RESET}"
        if git["stash_count"] > 0:
            line += f" {SLATE_600}\u2502{RESET} {GIT_PRIMARY}Stash:{RESET} {GIT_STASH}{git['stash_count']}{RESET}"

        if total_changed > 0 or git["untracked"] > 0:
            line += f" {SLATE_600}\u2502{RESET} "
            if total_changed > 0:
                line += f"{GIT_PRIMARY}Mod:{RESET} {GIT_MODIFIED}{total_changed}{RESET}"
            if git["untracked"] > 0:
                if total_changed > 0:
                    line += " "
                line += f"{GIT_PRIMARY}New:{RESET} {GIT_ADDED}{git['untracked']}{RESET}"
        else:
            line += f" {SLATE_600}\u2502{RESET} {GIT_CLEAN}\u2713 clean{RESET}"

        if git["ahead"] > 0 or git["behind"] > 0:
            line += f" {SLATE_600}\u2502{RESET} {GIT_PRIMARY}Sync:{RESET} "
            if git["ahead"] > 0:
                line += f"{GIT_CLEAN}\u2191{git['ahead']}{RESET}"
            if git["behind"] > 0:
                line += f"{GIT_STASH}\u2193{git['behind']}{RESET}"
        print(line)


# ---------------------------------------------------------------------------
# Context manager line (line 3)
# ---------------------------------------------------------------------------

def render_context_manager(
    mode: str,
    context_id: str,
    context_state=None,
) -> None:
    """Render the context manager line (line 3) showing context ID, mode, and plan."""
    # Strip YYMMDD-HHMM- timestamp prefix from context ID for display
    display_id = re.sub(r"^\d{6}-\d{4}-", "", context_id)
    if not display_id:
        display_id = context_id  # fallback if regex strips everything

    # Truncate display_id per mode
    max_id_len = {"nano": 14, "micro": 18, "mini": 22, "normal": 30}.get(mode, 30)
    truncated_id = display_id[:max_id_len]
    if len(display_id) > max_id_len:
        truncated_id += "\u2026"

    # Read state fields (ContextState object from context_store)
    state_mode = getattr(context_state, "mode", "idle") if context_state else "idle"
    state_plan_path = getattr(context_state, "plan_path", None) if context_state else None

    # Detect plan mode heuristic: if state is idle but a recent plan file exists
    # in ~/.claude/plans/, we're likely in active planning (transient, not persisted)
    active_plan_file = _find_active_plan_file()
    is_planning = state_mode == "idle" and active_plan_file is not None

    # Build mode badge
    mode_badge = ""
    if is_planning:
        label = "Plan" if mode == "nano" else "Planning"
        mode_badge = f" {SLATE_600}\u2502{RESET} {CTX_SECONDARY}Mode:{RESET} {AMBER}{label}{RESET}"
    elif state_mode == "has_plan":
        label = "Ready" if mode == "nano" else "Plan Ready"
        mode_badge = f" {SLATE_600}\u2502{RESET} {CTX_SECONDARY}Mode:{RESET} {EMERALD}{label}{RESET}"
    elif state_mode == "active":
        label = "Active" if mode == "nano" else "Active"
        mode_badge = f" {SLATE_600}\u2502{RESET} {CTX_SECONDARY}Mode:{RESET} {CTX_ACCENT}{label}{RESET}"

    # Resolve plan file path for display
    plan_file_path = None
    if is_planning:
        plan_file_path = active_plan_file
    elif state_plan_path:
        plan_file_path = state_plan_path
    elif state_mode in ("has_plan", "active"):
        # Fallback: check context's plans/ folder
        try:
            from lib.context.plan_manager import find_latest_plan
            plan_file_path = find_latest_plan(context_id)
        except Exception:
            pass

    # Build plan name (mini/normal only)
    plan_part = ""
    if mode in ("mini", "normal") and plan_file_path:
        plan_stem = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", Path(plan_file_path).stem)
        max_plan_len = 20 if mode == "mini" else 30
        truncated_plan = plan_stem[:max_plan_len]
        if len(plan_stem) > max_plan_len:
            truncated_plan += "\u2026"
        plan_part = f" {SLATE_600}\u2502{RESET} {CTX_SECONDARY}Plan:{RESET} {SLATE_300}{truncated_plan}{RESET}"

    if mode == "nano":
        print(
            f"{CTX_ACCENT}\u25C6{RESET} {SLATE_400}{truncated_id}{RESET}"
            f"{mode_badge}"
        )
    elif mode == "micro":
        print(
            f"{CTX_ACCENT}\u25C6{RESET} {SLATE_400}{truncated_id}{RESET}"
            f"{mode_badge}"
        )
    elif mode == "mini":
        print(
            f"{CTX_ACCENT}\u25C6{RESET} {SLATE_400}{truncated_id}{RESET}"
            f"{mode_badge}{plan_part}"
        )
    else:  # normal
        print(
            f"{CTX_ACCENT}\u25C6{RESET} {CTX_SECONDARY}Context:{RESET} {SLATE_300}{truncated_id}{RESET}"
            f"{mode_badge}{plan_part}"
        )


# ---------------------------------------------------------------------------
# Context persistence
# ---------------------------------------------------------------------------

def _load_cache() -> Dict[str, Any]:
    """Load the statusline cache file."""
    try:
        if STATUSLINE_CACHE.exists():
            return json.loads(STATUSLINE_CACHE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_cache(cache: Dict[str, Any]) -> None:
    """Save the statusline cache file."""
    try:
        STATUSLINE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        STATUSLINE_CACHE.write_text(
            json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    except Exception:
        pass


def _resolve_context_id(session_id: str) -> Optional[str]:
    """Resolve session_id to context_id, using cache when possible."""
    if not session_id or session_id == "unknown":
        return None

    # Check cache first
    cache = _load_cache()
    cached_entry = cache.get("sessions", {}).get(session_id)
    if cached_entry and cached_entry.get("context_id") is not None:
        return cached_entry["context_id"]

    # Cache miss — look up via context manager
    try:
        from lib.context.context_store import get_context_by_session_id
        context = get_context_by_session_id(session_id)
        if context:
            # Update cache
            if "sessions" not in cache:
                cache["sessions"] = {}
            cache["sessions"][session_id] = {"context_id": context.id}
            _save_cache(cache)
            return context.id
    except Exception:
        pass

    # Mark as no-context in cache to avoid repeated lookups
    if "sessions" not in cache:
        cache["sessions"] = {}
    cache["sessions"][session_id] = {"context_id": None}
    _save_cache(cache)
    return None


def _load_context_state(context_id: str):
    """Load context state from state.json (with context.json fallback)."""
    try:
        from lib.context.context_store import load_state
        return load_state(context_id)
    except Exception:
        return None


def _find_active_plan_file() -> Optional[str]:
    """Find most recent plan file in ~/.claude/plans/."""
    try:
        plans_dir = Path.home() / ".claude" / "plans"
        if not plans_dir.exists():
            return None
        plan_files = list(plans_dir.glob("*.md"))
        if not plan_files:
            return None
        plan_files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return str(plan_files[0])
    except Exception:
        return None


def _write_context_window(context_id: str, context_window_data: Dict[str, Any]) -> None:
    """Write context_window data to state.json last_session."""
    try:
        from lib.context.context_store import get_context as get_ctx, save_state
        state = get_ctx(context_id)
        if state:
            if state.last_session is None:
                state.last_session = {}
            state.last_session["context_remaining_pct"] = context_window_data.get("remaining_percentage")
            save_state(state)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Read stdin JSON, render status line, optionally persist context data."""
    # Force UTF-8 stdout on Windows to support Unicode symbols
    if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    # Read JSON from stdin
    try:
        input_data = json.loads(sys.stdin.read())
    except Exception:
        input_data = {}

    # Terminal width and mode
    term_width = get_terminal_width()
    mode = get_display_mode(term_width)

    # Extract input fields
    session_id = input_data.get("session_id", "")
    model_name = (input_data.get("model") or {}).get("display_name", "unknown")
    cost = input_data.get("cost") or {}
    duration_ms = cost.get("total_duration_ms", 0)
    workspace = input_data.get("workspace") or {}
    current_dir = workspace.get("project_dir", os.getcwd())
    dir_name = os.path.basename(current_dir)

    # Context window data
    ctx_win = input_data.get("context_window") or {}
    usage = ctx_win.get("current_usage") or {}
    cache_read = usage.get("cache_read_input_tokens", 0)
    input_tokens = usage.get("input_tokens", 0)
    cache_creation = usage.get("cache_creation_input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    context_max = ctx_win.get("context_window_size", 200000)

    # Calculate context percentage
    # Use used_percentage if available (pre-calculated), else raw tokens + baseline
    used_pct = ctx_win.get("used_percentage")
    if used_pct is not None:
        context_pct = int(used_pct)
        total_input = cache_read + input_tokens + cache_creation
        context_used = total_input + output_tokens + CONTEXT_BASELINE_TOKENS
    else:
        total_input = cache_read + input_tokens + cache_creation
        context_used = total_input + output_tokens + CONTEXT_BASELINE_TOKENS
        context_pct = (context_used * 100) // context_max if context_max > 0 else 0

    context_k = context_used // 1000
    max_k = context_max // 1000

    # Format duration
    duration_sec = duration_ms // 1000
    if duration_sec >= 3600:
        time_display = f"{duration_sec // 3600}h{(duration_sec % 3600) // 60}m"
    elif duration_sec >= 60:
        time_display = f"{duration_sec // 60}m{duration_sec % 60}s"
    else:
        time_display = f"{duration_sec}s"

    # Resolve context ID for display and persistence
    context_id = _resolve_context_id(session_id)

    # Render context section
    render_context(mode, context_pct, context_k, max_k, time_display, model_name)

    # Render git section
    git = get_git_status(current_dir)
    if git:
        render_git(mode, git, dir_name)

    # Render context manager line (line 3) with separator
    if context_id:
        print(SEPARATOR)
        context_state = _load_context_state(context_id)
        render_context_manager(mode, context_id, context_state)

    # Persist context_window to state.json
    if context_id:
        _write_context_window(context_id, {
            "used_percentage": context_pct,
            "remaining_percentage": 100 - context_pct,
            "context_window_size": context_max,
            "tokens_used": context_used,
            "total_input_tokens": total_input,
            "total_output_tokens": output_tokens,
            "model": model_name,
            "last_updated": datetime.now().isoformat(timespec="seconds"),
        })


if __name__ == "__main__":
    main()
