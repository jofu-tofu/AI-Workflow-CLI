# Hook Merge Explanation

## What Our Merge Does

When you run `aiw init --method bmad --ide claude`, our implementation:

### 1. Reads Two Sources
```
Source A: Template hooks (from template/.claude/settings.json)
Source B: Existing project hooks (from ./.claude/settings.json) - if exists
```

### 2. Merges Hook Arrays Per Event Type

**Example:**

**Existing Project Settings:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [{ "type": "command", "command": "eslint $FILE" }]
      }
    ]
  }
}
```

**Template Settings:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "prettier $FILE" }]
      }
    ],
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "echo 'Starting'" }]
      }
    ]
  }
}
```

**After Merge (written to ./.claude/settings.json):**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [{ "type": "command", "command": "eslint $FILE" }]
      },
      {
        "matcher": "Edit",
        "hooks": [{ "type": "command", "command": "prettier $FILE" }]
      }
    ],
    "SessionStart": [
      {
        "matcher": ".*",
        "hooks": [{ "type": "command", "command": "echo 'Starting'" }]
      }
    ]
  }
}
```

### 3. Deduplication

If the same hook exists in both, it's only included once:

**Both Have:**
```json
{
  "matcher": "Write",
  "hooks": [{ "type": "command", "command": "eslint $FILE" }]
}
```

**Result:** Only appears once (not duplicated)

## How Claude Code Itself Handles Multiple Settings Files

According to Claude Code documentation, there are 3 levels of settings:

1. **User Settings** (`~/.claude/settings.json`) - Global
2. **Project Settings** (`.claude/settings.json`) - Shared with team
3. **Local Settings** (`.claude/settings.local.json`) - Personal, gitignored

### Claude Code's Native Behavior

**Claude Code MERGES hooks from all three levels automatically!**

When Claude Code runs, it:
1. Reads user settings hooks
2. Reads project settings hooks
3. Reads local settings hooks
4. **Executes ALL of them** (concatenates the arrays)

**Example:**

User settings:
```json
{
  "hooks": {
    "PostToolUse": [{ "matcher": "Write", "hooks": [...] }]
  }
}
```

Project settings:
```json
{
  "hooks": {
    "PostToolUse": [{ "matcher": "Edit", "hooks": [...] }]
  }
}
```

**Claude Code sees BOTH hooks and runs both!**

## What Our Implementation Does vs Claude Code Native

| Aspect | Claude Code (Runtime) | Our Merge (Init Time) |
|--------|----------------------|----------------------|
| **When** | Every time Claude Code starts | Only when running `aiw init` |
| **What** | Merges user + project + local settings | Merges template + existing project settings |
| **Where** | In-memory (doesn't modify files) | Writes to `.claude/settings.json` |
| **Scope** | All 3 levels | Only project level |
| **Purpose** | Runtime execution | Template installation |

## Why Our Approach Works

Our merge is **additive and safe**:

1. ✅ **Only touches project settings** - Never modifies user or local settings
2. ✅ **Non-destructive** - Existing hooks are preserved
3. ✅ **Deduplicates** - No duplicate hooks
4. ✅ **Creates backup** - `.claude/settings.json.backup` before changes
5. ✅ **Compatible** - Works with Claude Code's native hierarchy

## Complete Flow

```
Step 1: User runs aiw init --method bmad --ide claude
        ↓
Step 2: Template installed to current directory
        ↓
Step 3: Our merge reads:
        - Template: packages/cli/src/templates/bmad/.claude/settings.json
        - Existing: ./.claude/settings.json (if exists)
        ↓
Step 4: Merge hooks (concatenate + deduplicate)
        ↓
Step 5: Write to: ./.claude/settings.json
        ↓
Step 6: When user runs Claude Code in this directory:
        - Claude Code reads ~/.claude/settings.json (user)
        - Claude Code reads ./.claude/settings.json (project - OUR MERGED FILE)
        - Claude Code reads ./.claude/settings.local.json (local)
        - Claude Code executes ALL hooks from all 3 files
```

## Example End-to-End

**Before Init:**
```
~/.claude/settings.json:
  PostToolUse: [security-check hook]

./.claude/settings.json:
  PostToolUse: [eslint hook]
```

**After `aiw init --method bmad --ide claude`:**
```
~/.claude/settings.json:
  PostToolUse: [security-check hook]  ← UNCHANGED

./.claude/settings.json:
  PostToolUse: [eslint hook, template-hook-1, template-hook-2]  ← MERGED
```

**When Claude Code Runs:**
```
Executes:
  - security-check hook (from user settings)
  - eslint hook (from project settings)
  - template-hook-1 (from project settings - added by our merge)
  - template-hook-2 (from project settings - added by our merge)
```

## Summary

**What Our Merge Does:**
- Combines template hooks INTO the project `.claude/settings.json` file
- Only runs during `aiw init` command
- Only affects current project directory
- Preserves existing hooks
- Deduplicates identical hooks

**This is correct because:**
- Claude Code natively merges all 3 settings levels at runtime
- We're only managing the project-level file
- User's global hooks remain separate and untouched
- Team can share the merged project hooks via git
