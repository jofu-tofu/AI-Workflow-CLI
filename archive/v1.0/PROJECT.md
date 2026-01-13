# Template for Cross AI Assistant Compatibility

## Vision

Create a standardized template system that resolves capability discrepancies and terminology differences between AI IDE/CLI tools (Claude Code, Windsurf, GitHub Copilot, etc.). This project enables workflow template portability by mapping capabilities, translating terminologies, and providing workaround patterns for missing features across different AI systems.

## Goals

- [ ] Map all capabilities and terminologies between AI editors (e.g., Windsurf "workflow" = Claude Code "command/skill")
- [ ] Create a standardized template - either based on Claude Code or a custom standard format
- [ ] Document workaround patterns to emulate missing capabilities (e.g., use Windsurf rules to emulate Claude skills via front matter)
- [ ] Build programmatic, deterministic mapping system for automation
- [ ] Define standardized file structure that works across different AI assistants
- [ ] Support 1-2 IDEs/CLI tools initially, then expand

## Success Criteria

All planned functionality is implemented and working:
- Complete capability and terminology mapping between AI editors documented
- Standardized template format defined (Claude Code-based or custom standard)
- Workaround patterns documented for emulating missing capabilities
- Can convert workflows/skills between different AI systems programmatically
- Standardized file structure works across target IDEs (starting with Claude Code and Windsurf)

## Constraints

- **Time:** None specified
- **Technical:** Requirements quickly change over time - need flexible, adaptable design that can evolve
- **Resources:** Personal project, individual contributor

## Target Users

Personal use - building this for my own workflow needs when working with multiple AI assistants.

## Out of Scope

- **AI platform integration:** Not building connectors, APIs, or direct integrations with AI platforms
- **Specific use cases:** Focusing on general-purpose template format, not creating domain-specific templates (e.g., code review templates, documentation templates)
- **Supporting all AI tools:** Starting with 1-2 tools (likely Claude Code and Windsurf), not attempting comprehensive coverage initially
- **Template execution engine:** Defining format and mapping, not building a runtime or execution environment

## Key Technical Approaches

### Capability Mapping
Map capabilities between AI editors to understand what exists where:
- **Example:** Windsurf "workflow" = Claude Code "command/skill" = GitHub Copilot "agent"
- **Example:** Claude Code can run agents, Windsurf cannot (requires workaround)

### Emulation Patterns
Use clever combinations to replicate missing capabilities:
- **Example:** Emulate Claude skills in Windsurf by loading core rule with front matter that points to markdown files containing skill definitions
- **Example:** Use IDE-specific features as substitutes for missing functionality

### Standard Template Decision
Two options to evaluate:
1. **Claude Code as standard:** Use existing Claude Code implementation as the base template
2. **Custom standard:** Create new vendor-neutral template format

### Programmatic Translation
Build deterministic mapping system that can automatically translate between formats for different AI tools.

---

**Created:** 2026-01-12
**Status:** Active Development (Phase 6)
