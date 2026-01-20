#!/usr/bin/env python3
"""
Aggregate Agents - Auto-detect agent configurations from frontmatter.

Reads all agent markdown files from .claude/agents/ and extracts their
YAML frontmatter to provide agent configuration for the hook system.

Used by cc-native-agent-review.py to auto-detect available agents
instead of requiring manual config.json entries.

Note: Uses simple YAML parsing without external dependencies.
"""

import re
from pathlib import Path
from typing import Any


def parse_simple_yaml(yaml_str: str) -> dict[str, Any]:
    """Parse simple YAML frontmatter without external dependencies.

    Supports:
    - Key: value pairs
    - Lists (using - item syntax)
    - Boolean values (true/false)
    - Nested lists under keys

    Args:
        yaml_str: YAML string to parse

    Returns:
        Parsed dict
    """
    result: dict[str, Any] = {}
    current_key = None
    current_list: list[str] | None = None

    for line in yaml_str.split('\n'):
        # Skip empty lines
        if not line.strip():
            continue

        # Check if this is a list item (starts with -)
        list_match = re.match(r'^(\s*)-\s+(.+)$', line)
        if list_match:
            indent = len(list_match.group(1))
            value = list_match.group(2).strip()
            if current_key and indent > 0:
                if current_list is None:
                    current_list = []
                    result[current_key] = current_list
                current_list.append(value)
            continue

        # Check if this is a key: value pair
        kv_match = re.match(r'^(\w+):\s*(.*)$', line)
        if kv_match:
            key = kv_match.group(1)
            value = kv_match.group(2).strip()
            current_key = key
            current_list = None

            if value:
                # Parse the value
                if value.lower() == 'true':
                    result[key] = True
                elif value.lower() == 'false':
                    result[key] = False
                elif value.isdigit():
                    result[key] = int(value)
                else:
                    result[key] = value
            # If no value, it might be followed by a list

    return result


def extract_frontmatter(content: str) -> dict[str, Any] | None:
    """Extract YAML frontmatter from markdown content.

    Args:
        content: Raw markdown file content

    Returns:
        Parsed frontmatter as dict, or None if no valid frontmatter found
    """
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not match:
        return None
    try:
        return parse_simple_yaml(match.group(1))
    except Exception:
        return None


def aggregate_agents(agents_dir: Path | None = None) -> list[dict[str, Any]]:
    """Read all agent files and return aggregated metadata.
    
    Scans the agents directory for .md files, extracts frontmatter from each,
    and returns a list of agent configurations.
    
    Args:
        agents_dir: Path to agents directory. If None, uses default
                   .claude/agents relative to project root.
                   
    Returns:
        List of agent configuration dicts with fields:
        - name: Agent identifier (lowercase)
        - description: Full description for Task tool
        - model: Claude model (haiku/sonnet/opus)
        - focus: Brief focus for orchestrator
        - enabled: Whether agent is available
        - categories: Work categories for filtering
        - tools: Available tools
    """
    if agents_dir is None:
        # Default to .claude/agents/cc-native relative to this script's location
        # Script is at: _cc-native/scripts/aggregate_agents.py
        # Agents are at: .claude/agents/cc-native/
        script_dir = Path(__file__).parent
        agents_dir = script_dir.parent.parent / ".claude" / "agents" / "cc-native"

    agents = []

    if not agents_dir.exists():
        return agents

    for file in agents_dir.glob("*.md"):
        try:
            content = file.read_text(encoding="utf-8")
            frontmatter = extract_frontmatter(content)
            if frontmatter and frontmatter.get("name"):
                # Ensure categories is always a list
                if "categories" not in frontmatter:
                    frontmatter["categories"] = ["code"]
                elif isinstance(frontmatter["categories"], str):
                    frontmatter["categories"] = [frontmatter["categories"]]
                agents.append(frontmatter)
        except Exception:
            # Skip files that can't be read or parsed
            continue

    return agents


if __name__ == "__main__":
    import json
    import sys
    
    agents = aggregate_agents()
    json.dump(agents, sys.stdout, indent=2)
