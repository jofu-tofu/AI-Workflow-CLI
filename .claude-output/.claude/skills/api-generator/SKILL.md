---
name: api-generator
description: |
  USE WHEN generating REST API endpoints, creating OpenAPI specifications, or scaffolding backend routes from specifications or requirements.
  
version: "1.0.0"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash(npm run *)
  - Bash(npx *)
  - Bash(curl *)
model: claude-opus-4-5-20251101
context: fork
agent: api-architect
hooks:
  PostToolUse:
    - matcher: "Write|Edit"
      hooks:
        - type: command
          command: "npm run lint:fix"
  Stop:
    - hooks:
        - type: command
          command: "npm run validate:api"
---

# API Generator Skill

Generate REST API endpoints and OpenAPI specifications from requirements or existing specs.

## Context Gathering Protocol

Before beginning generation, gather comprehensive context:

1. First read the project's existing API structure by examining `src/api/**/*.ts`
2. Use Glob to discover existing route patterns: `**/routes/**/*.ts`
3. Use Grep to search for existing endpoint patterns and middleware usage
4. Read any existing OpenAPI spec files (`openapi.yaml`, `swagger.json`)

**Context Checklist:**
- [ ] Existing API structure understood
- [ ] Authentication patterns identified
- [ ] Validation middleware located
- [ ] Database models mapped

Only proceed to generation once context gathering is complete.

## Input Modes

### Mode 1: From OpenAPI Specification

If an OpenAPI spec is provided:

1. Use the Read tool to parse the specification file
2. Extract endpoint definitions, schemas, and security requirements
3. Map to project conventions discovered during context gathering

### Mode 2: From Natural Language

If requirements are described in natural language:

1. Extract resource names and relationships
2. Determine CRUD operations needed
3. Generate OpenAPI spec first, then implementation

### Mode 3: From Database Models

If generating from existing models:

1. Use Grep to find model definitions: `pattern="interface.*Model|type.*Entity"`
2. Infer relationships from foreign key patterns
3. Generate RESTful endpoints for each resource

## Generation Process

### Phase 1: Spawn Planning Agent

Spawn a dedicated agent to analyze requirements and plan the API structure:

1. Identify all resources and their relationships
2. Define endpoint paths following REST conventions
3. Determine request/response schemas
4. Plan authentication and authorization requirements

### Phase 2: Generate OpenAPI Specification

Create the specification file with full documentation:

```yaml
openapi: 3.0.0
info:
  title: Generated API
  version: 1.0.0
paths:
  /resource:
    get:
      summary: List resources
      # ... generated content
```

Use the Write tool to create `openapi.yaml` in the project root.

### Phase 3: Generate Route Handlers

For each endpoint in the spec:

1. Spawn agent for each route group (users, posts, comments, etc.)
2. Generate TypeScript handler files matching project conventions
3. Include input validation using discovered middleware patterns
4. Add error handling following project standards

**Permission Requirements:** Requires Write permission for `src/api/**` and `src/routes/**`. Not allowed to modify production configuration files.

### Phase 4: Generate Tests

For comprehensive API coverage:

1. Use Glob to find test patterns: `**/*.test.ts`, `**/*.spec.ts`
2. Generate integration tests for each endpoint
3. Include positive and negative test cases

## Progress Tracking

Update the todo list as generation progresses:

- [ ] Context gathering complete
- [ ] OpenAPI spec generated
- [ ] Route handlers created
- [ ] Validation middleware added
- [ ] Tests generated
- [ ] Documentation updated

Mark task complete when all endpoints are generated and validated.

## Working Set Management

For large APIs with many endpoints, batch the generation:

**Part 1 of N:** Core resource endpoints
**Part 2 of N:** Related resource endpoints
**Part 3 of N:** Admin/management endpoints

Each part should handle 8-10 files to stay within working set limits.

Proceed to Part 2 after completing Part 1 generation.

## Checkpoint Commits

Create atomic commits after each phase:

```
feat(api): add user management endpoints

- POST /users - create user
- GET /users - list users
- GET /users/:id - get user by ID
- PUT /users/:id - update user
- DELETE /users/:id - delete user

Includes validation and error handling
```

Commit changes with conventional commit format after each resource group.

## Verification Steps

After generation is complete:

1. Run tests: `npm test src/api/`
2. Validate OpenAPI spec: `npx @redocly/cli lint openapi.yaml`
3. Start development server and test endpoints manually

## Output Structure

Generated files will follow this structure:

```
src/
  api/
    users/
      users.controller.ts
      users.service.ts
      users.validation.ts
    posts/
      posts.controller.ts
      posts.service.ts
      posts.validation.ts
  routes/
    index.ts
    users.routes.ts
    posts.routes.ts
openapi.yaml
```

## Manual Invocation

Invocation command: `/api-generator`

When to invoke this skill:
- Creating new REST API from scratch
- Adding endpoints to existing API
- Generating code from OpenAPI specification
- Scaffolding backend routes from requirements