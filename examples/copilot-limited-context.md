# Example: GitHub Copilot Working Set Limitation Pattern

**Date:** 2026-01-12
**Pattern:** Working Set Limitation Pattern (Pattern 3)
**Purpose:** Demonstrate skill decomposition for GitHub Copilot's 10-file working set limit

---

## Scenario

You need to refactor the database access layer across your application. The refactor affects 28 files:

- `src/database/connection.ts` (core)
- `src/database/query-builder.ts` (core)
- `src/database/transaction.ts` (core)
- `src/repositories/user-repository.ts`
- `src/repositories/product-repository.ts`
- `src/repositories/order-repository.ts`
- `src/repositories/payment-repository.ts`
- `src/repositories/inventory-repository.ts`
- `src/repositories/customer-repository.ts`
- `src/repositories/vendor-repository.ts`
- `src/repositories/audit-repository.ts`
- `src/services/user-service.ts`
- `src/services/product-service.ts`
- `src/services/order-service.ts`
- `src/services/payment-service.ts`
- `src/services/inventory-service.ts`
- `src/services/analytics-service.ts`
- `src/api/controllers/user-controller.ts`
- `src/api/controllers/product-controller.ts`
- `src/api/controllers/order-controller.ts`
- `src/api/controllers/payment-controller.ts`
- `src/api/controllers/inventory-controller.ts`
- `src/models/user-model.ts`
- `src/models/product-model.ts`
- `src/models/order-model.ts`
- `src/models/payment-model.ts`
- `src/models/inventory-model.ts`
- `src/types/database-types.ts` (shared types)

**Total:** 28 files

**Problem:** GitHub Copilot's 10-file working set limit makes this impossible to handle in a single prompt.

**Solution:** Apply Working Set Limitation Pattern to decompose into 4 batched sub-skills.

---

## Step 1: Apply Decision Tree

### Question 1: Count affected files
**Answer:** 28 files

### Question 2: Exceeds 10-file limit?
**Answer:** Yes (28 > 10)

### Question 3: Is operation read-only (analysis/search)?
**Answer:** No, this is a write-heavy refactor (modifying database access patterns)

### Question 4: Can be logically split?
**Answer:** Yes, can split by layer:
- Part 1: Core database module (3 files)
- Part 2: Repository layer (8 files)
- Part 3: Service layer (6 files)
- Part 4: API controllers + Models (11 files)

**Decision:** Use skill decomposition pattern

---

## Step 2: Decompose Into Sub-Skills

### Original Monolithic Skill (Won't Work on Copilot)

**File:** `.github/prompts/refactor-database.prompt.md` (NOT SUITABLE)

```yaml
---
description: Refactor database access layer across entire application
applyTo:
  - "src/database/**/*.ts"
  - "src/repositories/**/*.ts"
  - "src/services/**/*.ts"
  - "src/api/controllers/**/*.ts"
  - "src/models/**/*.ts"
mode: agent
---

# Database Layer Refactor

## Scope
Refactor database access across 28 files to:
- Migrate from raw SQL to query builder
- Standardize transaction handling
- Add connection pooling
- Implement retry logic

## Files Affected
- src/database/ (3 files)
- src/repositories/ (8 files)
- src/services/ (6 files)
- src/api/controllers/ (5 files)
- src/models/ (5 files)
- src/types/ (1 file)

## Tasks
1. Update core database module with query builder
2. Refactor all repositories to use query builder
3. Update services to use new repository methods
4. Update API controllers to use new service methods
5. Update models to reflect new database schema
```

**Problem:** 28 files far exceeds Copilot's 10-file limit. This will fail or produce poor results.

---

### Decomposed Skills (Works Within Copilot Limits)

#### Part 1: Core Database Module

**File:** `.github/prompts/refactor-database-core.prompt.md`

```yaml
---
description: Refactor core database module (Part 1 of 4)
applyTo:
  - "src/database/*.ts"
  - "src/types/database-types.ts"
mode: agent
---

# Database Refactor - Part 1: Core Module

<!-- Part 1 of 4: Core Database Infrastructure -->
<!-- Version: 1.0.0 -->

## Scope

**This prompt handles:** Core database infrastructure (3 files) + shared types (1 file)

**Working Set (4 files):**
1. src/database/connection.ts
2. src/database/query-builder.ts
3. src/database/transaction.ts
4. src/types/database-types.ts (shared types - keep as reference)

**Why these files:**
- Core files that all other layers depend on
- Must be refactored first to establish new patterns
- Types needed as reference for interface consistency

## Objectives

1. Migrate from raw SQL strings to query builder API
2. Implement connection pooling
3. Add transaction retry logic
4. Standardize error handling

## Workflow

### Step 1: Update Query Builder

Refactor `src/database/query-builder.ts`:
- Replace SQL template strings with query builder methods
- Add type-safe query construction
- Implement parameter sanitization

**Example Pattern:**

```typescript
// OLD (raw SQL):
const result = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// NEW (query builder):
const result = await db
  .select('*')
  .from('users')
  .where('email', '=', email)
  .execute();
```

### Step 2: Update Connection Management

Refactor `src/database/connection.ts`:
- Implement connection pooling (max 20 connections)
- Add connection health checks
- Implement graceful shutdown

### Step 3: Update Transaction Handling

Refactor `src/database/transaction.ts`:
- Add automatic retry logic (max 3 retries)
- Implement deadlock detection
- Add transaction timeout (30 seconds)

### Step 4: Update Shared Types

Update `src/types/database-types.ts`:
- Add query builder result types
- Add connection pool types
- Add transaction types

### Step 5: Verify Core Module

Test the core module:
```bash
npm test src/database/
```

### Step 6: Checkpoint

Create commit:
```
refactor(db): part 1 - migrate core module to query builder with pooling
```

## Next Steps

After completing this part:
1. Ensure all core database tests pass
2. Review new query builder API for repositories
3. Proceed to Part 2: `/prompt refactor-database-repositories`

## Related Files (Not Modified Here)

Dependencies on core module (handled in later parts):
- src/repositories/*.ts (Part 2 - will use new query builder)
- src/services/*.ts (Part 3 - indirect dependency)
- src/api/controllers/*.ts (Part 4 - indirect dependency)
- src/models/*.ts (Part 4 - may need updates)
```

---

#### Part 2: Repository Layer

**File:** `.github/prompts/refactor-database-repositories.prompt.md`

```yaml
---
description: Refactor repository layer to use new query builder (Part 2 of 4)
applyTo:
  - "src/repositories/*.ts"
  - "src/database/query-builder.ts"
mode: agent
---

# Database Refactor - Part 2: Repository Layer

<!-- Part 2 of 4: Repository Refactoring -->
<!-- Version: 1.0.0 -->

## Prerequisites

**IMPORTANT:** Complete Part 1 (`refactor-database-core`) before starting this part.

Part 1 should have:
- Migrated core database module to query builder
- Implemented connection pooling
- Added transaction retry logic
- Updated shared database types

## Scope

**This prompt handles:** All repositories (8 files) + query builder reference (1 file)

**Working Set (9 files):**
1. src/repositories/user-repository.ts
2. src/repositories/product-repository.ts
3. src/repositories/order-repository.ts
4. src/repositories/payment-repository.ts
5. src/repositories/inventory-repository.ts
6. src/repositories/customer-repository.ts
7. src/repositories/vendor-repository.ts
8. src/repositories/audit-repository.ts
9. src/database/query-builder.ts (reference - new API)

**Rationale:** Keep query-builder.ts in working set as reference for correct API usage.

## Objectives

1. Refactor all repository methods to use query builder instead of raw SQL
2. Standardize error handling across repositories
3. Add transaction support to multi-step operations
4. Ensure repository interfaces remain unchanged (backward compatibility)

## Workflow

### Step 1: Review Query Builder API

Read `src/database/query-builder.ts` to understand new API from Part 1.

**Key Methods:**
- `.select()`, `.from()`, `.where()`, `.join()`
- `.insert()`, `.update()`, `.delete()`
- `.transaction()`, `.execute()`

### Step 2: Refactor User Repository

Update `src/repositories/user-repository.ts`:

**Example Migration:**

```typescript
// OLD (raw SQL):
async findByEmail(email: string): Promise<User | null> {
  const result = await db.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
}

// NEW (query builder):
async findByEmail(email: string): Promise<User | null> {
  const result = await this.db
    .select('*')
    .from('users')
    .where('email', '=', email)
    .execute();
  return result[0] || null;
}
```

### Step 3: Refactor Remaining Repositories

Apply same pattern to:
- product-repository.ts
- order-repository.ts
- payment-repository.ts
- inventory-repository.ts
- customer-repository.ts
- vendor-repository.ts
- audit-repository.ts

### Step 4: Add Transaction Support

For repositories with multi-step operations, add transaction support:

```typescript
async createOrderWithItems(order: Order, items: OrderItem[]): Promise<Order> {
  return await this.db.transaction(async (tx) => {
    const createdOrder = await tx
      .insert(order)
      .into('orders')
      .returning('*')
      .execute();

    await tx
      .insert(items)
      .into('order_items')
      .execute();

    return createdOrder;
  });
}
```

### Step 5: Verify Repository Tests

Run repository tests:
```bash
npm test src/repositories/
```

Ensure:
- All repository methods work correctly
- Interfaces unchanged (no breaking changes)
- Transactions commit/rollback properly

### Step 6: Checkpoint

Create commit:
```
refactor(db): part 2 - migrate repositories to query builder
```

## Next Steps

After completing this part:
1. Ensure all repository tests pass
2. Verify no breaking changes to repository interfaces
3. Proceed to Part 3: `/prompt refactor-database-services`

## Related Files (Not Modified Here)

Consumers of repositories (handled in later parts):
- src/services/*.ts (Part 3 - uses repositories, should still work)
- src/api/controllers/*.ts (Part 4 - indirect consumers)
```

---

#### Part 3: Service Layer

**File:** `.github/prompts/refactor-database-services.prompt.md`

```yaml
---
description: Update service layer for new database patterns (Part 3 of 4)
applyTo:
  - "src/services/*.ts"
  - "src/repositories/user-repository.ts"
mode: agent
---

# Database Refactor - Part 3: Service Layer

<!-- Part 3 of 4: Service Layer Updates -->
<!-- Version: 1.0.0 -->

## Prerequisites

**IMPORTANT:** Complete Parts 1 and 2 before starting this part.

Previous parts should have:
- Part 1: Core database module with query builder
- Part 2: Repositories refactored to use query builder

## Scope

**This prompt handles:** Service layer (6 files) + repository reference (1 file)

**Working Set (7 files):**
1. src/services/user-service.ts
2. src/services/product-service.ts
3. src/services/order-service.ts
4. src/services/payment-service.ts
5. src/services/inventory-service.ts
6. src/services/analytics-service.ts
7. src/repositories/user-repository.ts (reference - example of new patterns)

**Rationale:** Services use repositories. While repository interfaces unchanged, may need to handle new error types or transaction patterns.

## Objectives

1. Update services to handle new database error types
2. Optimize service methods to leverage query builder features (e.g., joins)
3. Add transaction coordination across multiple repositories
4. Ensure service interfaces remain unchanged (backward compatibility)

## Workflow

### Step 1: Review Repository Changes

Read `src/repositories/user-repository.ts` to understand new patterns from Part 2.

**Key Changes:**
- Repositories now return typed results from query builder
- New transaction support for multi-step operations
- Standardized error handling

### Step 2: Update Error Handling

Update service error handling for new database errors:

```typescript
// Services now handle query builder errors
try {
  const user = await this.userRepository.findById(userId);
} catch (error) {
  if (error instanceof QueryBuilderError) {
    // Handle query builder specific errors
    throw new ServiceError('Database query failed', error);
  }
  throw error;
}
```

### Step 3: Optimize Service Methods

Leverage query builder features for complex operations:

```typescript
// OLD (N+1 query problem):
async getOrdersWithCustomers() {
  const orders = await orderRepository.findAll();
  for (const order of orders) {
    order.customer = await customerRepository.findById(order.customerId);
  }
  return orders;
}

// NEW (single query with join):
async getOrdersWithCustomers() {
  // Repository now supports joins via query builder
  return await orderRepository.findAllWithCustomers();
}
```

### Step 4: Add Cross-Repository Transactions

For services coordinating multiple repositories, use transactions:

```typescript
async placeOrder(userId: string, items: CartItem[]): Promise<Order> {
  return await this.db.transaction(async (tx) => {
    // Deduct inventory
    await this.inventoryRepository.deductStock(items, tx);

    // Create order
    const order = await this.orderRepository.create(userId, items, tx);

    // Process payment
    await this.paymentRepository.charge(order.total, tx);

    return order;
  });
}
```

### Step 5: Update Remaining Services

Apply optimizations to:
- product-service.ts
- payment-service.ts
- inventory-service.ts
- analytics-service.ts

### Step 6: Verify Service Tests

Run service tests:
```bash
npm test src/services/
```

Ensure:
- Services still work correctly
- No breaking changes to service interfaces
- Transactions commit/rollback properly

### Step 7: Checkpoint

Create commit:
```
refactor(db): part 3 - update services for new database patterns
```

## Next Steps

After completing this part:
1. Ensure all service tests pass
2. Verify service interfaces unchanged
3. Proceed to Part 4: `/prompt refactor-database-finalize`

## Related Files (Not Modified Here)

Consumers of services (handled in Part 4):
- src/api/controllers/*.ts (Part 4 - uses services)
- src/models/*.ts (Part 4 - may need minor updates)
```

---

#### Part 4: API Controllers and Models

**File:** `.github/prompts/refactor-database-finalize.prompt.md`

```yaml
---
description: Finalize database refactor - update controllers and models (Part 4 of 4)
applyTo:
  - "src/api/controllers/*.ts"
  - "src/models/*.ts"
  - "src/types/database-types.ts"
mode: agent
---

# Database Refactor - Part 4: Finalization

<!-- Part 4 of 4: Controllers, Models, and Final Verification -->
<!-- Version: 1.0.0 -->

## Prerequisites

**IMPORTANT:** Complete Parts 1, 2, and 3 before starting this part.

Previous parts should have:
- Part 1: Core database module with query builder
- Part 2: Repositories refactored
- Part 3: Services updated

## Scope

**This prompt handles:** API controllers (5 files) + Models (5 files) + Types (1 file)

**Working Set (11 files):**

**NOTICE:** This exceeds the ideal 10-file limit, but these files are loosely coupled enough that quality should remain acceptable. If quality issues occur, split into Part 4A (controllers) and Part 4B (models).

1. src/api/controllers/user-controller.ts
2. src/api/controllers/product-controller.ts
3. src/api/controllers/order-controller.ts
4. src/api/controllers/payment-controller.ts
5. src/api/controllers/inventory-controller.ts
6. src/models/user-model.ts
7. src/models/product-model.ts
8. src/models/order-model.ts
9. src/models/payment-model.ts
10. src/models/inventory-model.ts
11. src/types/database-types.ts (reference - ensure consistency)

## Objectives

1. Update controllers to handle new service error types
2. Update models to reflect new database schema (if changed)
3. Verify end-to-end functionality
4. Run full test suite and integration tests
5. Document breaking changes (if any)

## Workflow

### Step 1: Update API Controllers

Controllers are mostly unaffected (services maintain interfaces), but may need error handling updates:

```typescript
// Update error responses for new database errors
app.get('/users/:id', async (req, res) => {
  try {
    const user = await userService.findById(req.params.id);
    res.json(user);
  } catch (error) {
    if (error instanceof ServiceError && error.cause instanceof QueryBuilderError) {
      // Handle database-specific errors
      res.status(500).json({ error: 'Database error', details: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

### Step 2: Update Models (If Needed)

If database schema changed during refactor, update models:

```typescript
// Example: Add new field if schema changed
interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  // NEW: If added during refactor
  lastLoginAt?: Date;
}
```

### Step 3: Update Database Types

Review `src/types/database-types.ts` for any final type updates needed.

### Step 4: System-Wide Verification

Run comprehensive test suite:

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests (if available)
npm run test:e2e
```

### Step 5: Manual Testing

Test critical flows manually:
1. User registration and login
2. Product catalog browsing
3. Order creation and payment
4. Inventory updates

### Step 6: Final Checkpoint

Create commit:
```
refactor(db): part 4 - finalize controllers and models, verify system integrity
```

## Completion Checklist

- [ ] All 28 files refactored across 4 parts
- [ ] Core database module uses query builder (Part 1)
- [ ] Repositories use query builder (Part 2)
- [ ] Services optimized and use transactions (Part 3)
- [ ] Controllers and models updated (Part 4)
- [ ] Full test suite passes
- [ ] Integration tests pass
- [ ] No breaking API changes (or documented)
- [ ] Performance improved (benchmark if needed)

## Rollback Plan

If critical issues discovered:

1. **Identify problematic part:**
   - Review commits from all 4 parts
   - Check test failures for clues
   - Identify which layer has issues

2. **Rollback specific part:**
   ```bash
   git log --oneline  # Find commit hash
   git revert <commit-hash>
   ```

3. **Fix and re-run:**
   - Fix issues in that part
   - Re-run the prompt for that part
   - Verify tests pass
   - Continue from there

## Performance Verification

**Optional:** Benchmark database performance improvements:

```bash
# Run before/after benchmarks
npm run benchmark:database
```

Expected improvements:
- Connection pooling: 30-50% faster under load
- Query builder: Similar or better performance vs raw SQL
- Transaction retry: Reduced deadlock failures

## Summary

This completes the 4-part database refactor:
- **Part 1:** Core module (4 files)
- **Part 2:** Repositories (9 files)
- **Part 3:** Services (7 files)
- **Part 4:** Controllers & models (11 files)
- **Total:** 28 files refactored within Copilot's constraints

**Key Achievements:**
- Migrated to query builder (type-safe queries)
- Added connection pooling (better performance)
- Implemented transaction retry logic (improved reliability)
- Maintained backward compatibility (no breaking API changes)

## Next Steps (Optional)

**Future Enhancements:**
- Add query caching layer
- Implement read replicas for scaling
- Add database monitoring and alerting
- Optimize slow queries identified in benchmarks
```

---

#### Coordinator Prompt

**File:** `.github/prompts/refactor-database-coordinator.prompt.md`

```yaml
---
description: Coordinate full database refactor (use this as entry point)
mode: agent
---

# Database Refactor - Coordinator

<!-- Master prompt for orchestrating the 4-part refactor -->
<!-- Version: 1.0.0 -->

## Overview

This database refactor has been decomposed into 4 sequential parts to work within GitHub Copilot's 10-file working set limit.

**Original Scope:** 28 files across database, repository, service, controller, and model layers
**Copilot Limit:** 10 files per working set
**Solution:** 4 batched sub-tasks, each ≤11 files (Part 4 slightly exceeds but should work)

## Why Decomposition Was Necessary

**Challenge:** Copilot cannot effectively refactor >10 files simultaneously
**Risk Without Decomposition:** Quality degradation, missed dependencies, incomplete refactors

**Solution Benefits:**
- Each part stays within working set limits
- Clear dependency chain (Part 1 → 2 → 3 → 4)
- Checkpoint commits allow rollback
- Easier to review and test incrementally

## Execution Order

Execute prompts in this order:

### Part 1: Core Database Module
**Prompt:** `/prompt refactor-database-core`
**Files:** 4 files (database core + types)
**Duration:** ~15-20 minutes
**Checkpoint:** Commit after completion
**Tests:** `npm test src/database/`

### Part 2: Repository Layer
**Prompt:** `/prompt refactor-database-repositories`
**Files:** 9 files (8 repositories + query builder reference)
**Duration:** ~25-30 minutes
**Checkpoint:** Commit after completion
**Tests:** `npm test src/repositories/`

### Part 3: Service Layer
**Prompt:** `/prompt refactor-database-services`
**Files:** 7 files (6 services + repository reference)
**Duration:** ~20-25 minutes
**Checkpoint:** Commit after completion
**Tests:** `npm test src/services/`

### Part 4: Controllers and Models
**Prompt:** `/prompt refactor-database-finalize`
**Files:** 11 files (5 controllers + 5 models + types)
**Duration:** ~20-25 minutes
**Checkpoint:** Final commit
**Tests:** `npm test` (full suite)

## Total Estimated Time

Approximately 80-100 minutes for complete refactor.

## Progress Tracking

Create `REFACTOR-PROGRESS.md` to track completion:

```markdown
# Database Refactor Progress

## Status
- [ ] Part 1: Core database module (4 files)
- [ ] Part 2: Repository layer (9 files)
- [ ] Part 3: Service layer (7 files)
- [ ] Part 4: Controllers & models (11 files)

## Checkpoint Commits
- Part 1: [commit hash]
- Part 2: [commit hash]
- Part 3: [commit hash]
- Part 4: [commit hash]

## Test Results
- Part 1 tests: [pass/fail]
- Part 2 tests: [pass/fail]
- Part 3 tests: [pass/fail]
- Part 4 tests: [pass/fail]

## Notes
- Started: [date]
- Current part: [1/2/3/4]
- Issues: [any blockers or decisions made]
```

## When to Use @workspace Instead

**Use this decomposed approach when:**
- You need to MODIFY files (write operations)
- Changes are implementation-heavy
- Files are tightly coupled and must be coordinated
- Need precise control over changes

**Use @workspace when:**
- You need to SEARCH/ANALYZE many files (read-only)
- Planning the refactor scope
- Understanding current patterns and dependencies
- Generating migration documentation

**Recommended Workflow:**

1. **Discovery Phase (Use @workspace):**
   ```
   @workspace analyze database access patterns across the codebase
   @workspace find all files that import from src/database/
   @workspace show examples of current SQL usage
   ```

2. **Planning Phase (Use @workspace):**
   ```
   @workspace document current database architecture
   @workspace identify repositories that need refactoring
   ```

3. **Implementation Phase (Use Decomposed Prompts):**
   - Execute Part 1: Core module refactor
   - Execute Part 2: Repository refactor
   - Execute Part 3: Service refactor
   - Execute Part 4: Controller & model updates

## Decision Points

### Should You Split Part 4 Further?

Part 4 has 11 files (slightly over 10-file limit).

**Keep as single part IF:**
- Files are loosely coupled (controllers and models are mostly independent)
- Quality remains acceptable during execution
- Test suite passes after Part 4

**Split into Part 4A and 4B IF:**
- Quality degrades during execution
- Copilot misses dependencies between controllers and models
- Test failures indicate incomplete refactor

**If splitting needed:**

**Part 4A: Controllers** (6 files)
- src/api/controllers/*.ts (5 files)
- src/types/database-types.ts (1 reference)

**Part 4B: Models** (6 files)
- src/models/*.ts (5 files)
- src/types/database-types.ts (1 reference)

## Troubleshooting

### Part N Fails

1. Review commit from Part N-1
2. Ensure previous parts completed successfully
3. Check test output for specific errors
4. Verify file count in working set ≤10
5. Fix errors and re-run Part N

### Working Set Limit Hit

- Verify "Working Set" section in prompt lists ≤10 files
- Remove non-essential reference files
- Split part into sub-parts (4A, 4B)

### Quality Degradation

If Copilot produces poor results:
- Check if files are too large (>782 lines)
- Consider decomposing large files first
- Verify working set count ≤10
- Try splitting part into smaller batches

### Tests Fail After a Part

1. Review changes in that part's commit
2. Run tests for just that layer: `npm test src/{layer}/`
3. Fix failures before proceeding to next part
4. Re-run tests to confirm fix
5. Update checkpoint commit if needed

## Alternative Strategies

### Strategy 1: Layer-by-Layer (Current Approach)
- Part 1: Core
- Part 2: Repositories
- Part 3: Services
- Part 4: Controllers & Models

**Pros:** Clear dependency chain, logical progression
**Cons:** Must complete all parts sequentially

### Strategy 2: Feature-by-Feature
- Part 1: User feature (user-repo, user-service, user-controller, user-model)
- Part 2: Product feature (product-repo, product-service, product-controller, product-model)
- Part 3: Order feature (order-repo, order-service, order-controller, order-model)
- Part 4: Payment & Inventory features

**Pros:** Each part delivers complete vertical slice, can test end-to-end per part
**Cons:** More complex dependency management, core module changes repeated

**When to use Feature-by-Feature:**
- Features are mostly independent
- Want to deliver incremental value
- Can test each feature end-to-end immediately

## Final Checklist

After completing all 4 parts:

- [ ] All 28 files refactored
- [ ] 4 checkpoint commits created
- [ ] All unit tests pass (`npm test`)
- [ ] All integration tests pass (`npm run test:integration`)
- [ ] No breaking API changes (or documented)
- [ ] Performance benchmarked (optional)
- [ ] Documentation updated (if needed)
- [ ] REFACTOR-PROGRESS.md completed

## Next Steps

1. Review this coordinator prompt to understand full scope
2. Create `REFACTOR-PROGRESS.md` for tracking
3. Optional: Use @workspace for discovery phase
4. Start with Part 1: `/prompt refactor-database-core`
5. Follow the sequence through Part 4
6. Run final integration tests
7. Create final summary commit

## Estimated ROI

**Investment:**
- Time: 80-100 minutes across 4 parts
- Effort: Moderate (follow prompts sequentially)

**Return:**
- Type-safe database queries (fewer runtime errors)
- Connection pooling (30-50% performance improvement under load)
- Transaction retry logic (improved reliability)
- Standardized patterns (easier maintenance)
- Better developer experience (autocomplete for queries)
```

---

## Step 3: When to Use @workspace vs Decomposition

### Use @workspace for Discovery

**Scenario:** You want to understand the current state before refactoring.

**Example:**

```
@workspace analyze how database connections are currently managed
@workspace find all SQL queries in the codebase
@workspace show examples of transaction usage patterns
@workspace list all files that import from src/database/
```

**Benefits:**
- Can analyze >10 files (no working set limit for read-only)
- Get high-level overview
- Understand scope before decomposing
- Identify patterns and anti-patterns

**Limitations:**
- Read-only (cannot make changes)
- Must transition to decomposed prompts for implementation

### Use Decomposition for Implementation

**Scenario:** You need to actually refactor the 28 files.

**Example:**

After using @workspace to understand scope, execute:

```
/prompt refactor-database-coordinator  # Read overview
/prompt refactor-database-core         # Part 1 (4 files)
/prompt refactor-database-repositories # Part 2 (9 files)
/prompt refactor-database-services     # Part 3 (7 files)
/prompt refactor-database-finalize     # Part 4 (11 files)
```

**Benefits:**
- Can modify files (write operations)
- Stays within working set limits
- Clear checkpoints (commits per part)
- Easier to review and test incrementally

**Limitations:**
- Manual orchestration required
- Takes longer than monolithic approach would (if it worked)
- Must maintain context across parts

---

## Step 4: File Prioritization Example

**Scenario:** Part 4 has 11 files (over the 10-file limit), but they're loosely coupled enough that quality might be acceptable.

**If Quality Degrades:** Apply file prioritization heuristic.

### Prioritization Algorithm

**Priority 1: Core/Root Files (Always in Working Set)**
- `src/types/database-types.ts` (imported by all controllers and models)

**Priority 2: High-Value Files (Rotate in Batches)**
- Controllers (5 files) - higher priority (API facing)
- Models (5 files) - lower priority (internal structures)

### Execution with Prioritization

**Pass 1: Controllers + Types**

**Working Set (6 files):**
1. src/types/database-types.ts (core)
2. src/api/controllers/user-controller.ts
3. src/api/controllers/product-controller.ts
4. src/api/controllers/order-controller.ts
5. src/api/controllers/payment-controller.ts
6. src/api/controllers/inventory-controller.ts

**Pass 2: Models + Types**

**Working Set (6 files):**
1. src/types/database-types.ts (core - keep in both passes)
2. src/models/user-model.ts
3. src/models/product-model.ts
4. src/models/order-model.ts
5. src/models/payment-model.ts
6. src/models/inventory-model.ts

**Result:** Split Part 4 into Part 4A (controllers) and Part 4B (models), each within 10-file limit.

---

## Verification

### Acceptance Criteria Met

- [x] Working Set Limitation Pattern section added to WORKAROUND-PATTERNS.md
- [x] Decision tree documented for when to split templates vs use @workspace
- [x] examples/copilot-limited-context.md shows practical skill decomposition
- [x] File prioritization heuristics clearly documented
- [x] Skill chaining pattern explained with code examples
- [x] Pattern is manually traceable (coordinator → part 1 → part 2 → part 3 → part 4)

### Example Demonstrates

1. **Decomposition Strategy:** 28-file refactor split into 4 parts (4, 9, 7, 11 files)
2. **Skill Chaining:** Each part references the next in "Next Steps" section
3. **Coordinator Pattern:** Master prompt orchestrates execution order
4. **File Prioritization:** Part 4 demonstrates prioritization when approaching limit
5. **@workspace Guidance:** Clear explanation of when to use @workspace vs decomposed prompts
6. **Decision Tree Application:** Shows applying decision tree to determine decomposition strategy
7. **Manual Traceability:** Clear execution flow from coordinator through all 4 parts
8. **Checkpoint Commits:** Each part creates commit for rollback capability
9. **Progress Tracking:** REFACTOR-PROGRESS.md for manual tracking

---

## Summary

This example demonstrates the **Working Set Limitation Pattern** for GitHub Copilot:

- **Problem:** 28-file refactor exceeds 10-file working set limit
- **Solution:** Decompose into 4 sequential parts, each ≤11 files
- **Coordinator:** Master prompt provides overview and execution guidance
- **Chaining:** Each part references the next, creating clear progression
- **Checkpoints:** Commits after each part allow rollback and incremental testing
- **@workspace Alternative:** Use for discovery, decomposition for implementation
- **File Prioritization:** Applied when part approaches or exceeds limit

**Key Takeaway:** Large operations on GitHub Copilot require manual decomposition and orchestration, but the pattern provides a systematic approach to work within platform constraints.
