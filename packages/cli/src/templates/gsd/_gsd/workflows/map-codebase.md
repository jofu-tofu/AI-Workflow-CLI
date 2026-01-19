# GSD Workflow: Map Codebase

## Purpose

Analyze existing codebases for brownfield projects to understand current state before planning changes.

## Use Case

Use this workflow when:
- Working with existing code
- Planning refactoring or enhancements
- Need to understand architecture before adding features

## Process

### Step 1: Initial Scan

Perform high-level codebase analysis:

1. **Directory Structure**
   - List all major directories
   - Identify organization patterns
   - Note any unusual structures

2. **Technology Stack**
   - Languages used
   - Frameworks detected
   - Build tools present
   - Dependencies (package.json, requirements.txt, etc.)

3. **Entry Points**
   - Main application files
   - API endpoints
   - CLI commands
   - Tests

### Step 2: Architecture Analysis

Deep dive into key areas:

1. **Data Flow**
   - How does data move through the system?
   - Database/storage patterns
   - API integrations

2. **Key Components**
   - Core modules/classes
   - Shared utilities
   - Configuration management

3. **Testing**
   - Test coverage
   - Testing patterns used
   - CI/CD setup

### Step 3: Pain Points Identification

Look for:
- Code smells
- Technical debt markers
- Performance bottlenecks
- Missing documentation
- Outdated dependencies
- Security concerns

### Step 4: Generate Codebase Report

Create `_output/gsd/.planning/CODEBASE.md` with:

```markdown
# Codebase Analysis - {{PROJECT_NAME}}

## Technology Stack
[List all technologies]

## Architecture Overview
[High-level architecture description]

## Directory Structure
[Key directories and their purposes]

## Key Components
[Important modules and their responsibilities]

## Current State Assessment
- **Strengths:** [What's working well]
- **Weaknesses:** [Areas needing improvement]
- **Opportunities:** [Quick wins or enhancements]
- **Threats:** [Technical debt or risks]

## Recommendations
[Suggested improvements or next steps]
```

### Step 5: Update PROJECT.md

If `_output/gsd/.planning/PROJECT.md` doesn't exist, create it based on codebase analysis.

If it exists, ensure it reflects current reality:
- Update technical constraints based on existing stack
- Add discovered limitations to constraints
- Adjust goals to be realistic given current state

### Step 6: Integration with Roadmap

If planning changes:
1. Add "Code Audit" or "Technical Debt" phase if needed
2. Ensure roadmap accounts for existing architecture
3. Plan migration/refactoring if switching technologies

## Output Files

- `_output/gsd/.planning/CODEBASE.md` - Detailed analysis report
- Updated `_output/gsd/.planning/PROJECT.md` - Reflects current state
- Updated `_output/gsd/.planning/STATE.md` - Documents key architectural decisions

## Success Criteria

- [ ] Complete technology stack documented
- [ ] Architecture clearly understood
- [ ] Pain points identified
- [ ] Recommendations provided
- [ ] User confirms analysis accuracy
