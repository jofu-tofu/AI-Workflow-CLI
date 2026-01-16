#!/bin/bash
# Initialize planning files for a new session
# Usage: ./init-session.sh [project-name]

set -e

PROJECT_NAME="${1:-project}"
DATE=$(date +%Y-%m-%d)
OUTPUT_DIR="_planning-with-files-output"

echo "Initializing planning files for: $PROJECT_NAME"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Create task_plan.md if it doesn't exist
if [ ! -f "$OUTPUT_DIR/task_plan.md" ]; then
    cat > "$OUTPUT_DIR/task_plan.md" << 'EOF'
# Task Plan: [Brief Description]

## Goal
[One sentence describing the end state]

## Current Phase
Phase 1

## Phases

### Phase 1: Requirements & Discovery
- [ ] Understand user intent
- [ ] Identify constraints
- [ ] Document in findings.md
- **Status:** in_progress

### Phase 2: Planning & Structure
- [ ] Define approach
- [ ] Create project structure
- **Status:** pending

### Phase 3: Implementation
- [ ] Execute the plan
- [ ] Write to files before executing
- **Status:** pending

### Phase 4: Testing & Verification
- [ ] Verify requirements met
- [ ] Document test results
- **Status:** pending

### Phase 5: Delivery
- [ ] Review outputs
- [ ] Deliver to user
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|----------|-----------|

## Errors Encountered
| Error | Resolution |
|-------|------------|
EOF
    echo "Created $OUTPUT_DIR/task_plan.md"
else
    echo "$OUTPUT_DIR/task_plan.md already exists, skipping"
fi

# Create findings.md if it doesn't exist
if [ ! -f "$OUTPUT_DIR/findings.md" ]; then
    cat > "$OUTPUT_DIR/findings.md" << 'EOF'
# Findings & Decisions

## Requirements
-

## Research Findings
-

## Technical Decisions
| Decision | Rationale |
|----------|-----------|

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
-
EOF
    echo "Created $OUTPUT_DIR/findings.md"
else
    echo "$OUTPUT_DIR/findings.md already exists, skipping"
fi

# Create progress.md if it doesn't exist
if [ ! -f "$OUTPUT_DIR/progress.md" ]; then
    cat > "$OUTPUT_DIR/progress.md" << EOF
# Progress Log

## Session: $DATE

### Current Status
- **Phase:** 1 - Requirements & Discovery
- **Started:** $DATE

### Actions Taken
-

### Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|

### Errors
| Error | Resolution |
|-------|------------|
EOF
    echo "Created $OUTPUT_DIR/progress.md"
else
    echo "$OUTPUT_DIR/progress.md already exists, skipping"
fi

echo ""
echo "Planning files initialized!"
echo "Files: $OUTPUT_DIR/task_plan.md, $OUTPUT_DIR/findings.md, $OUTPUT_DIR/progress.md"
