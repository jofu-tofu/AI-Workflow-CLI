# Coding Standards Checklist

Standards that address the most common plan review failure modes. Reference this
when planning code changes in established codebases.

---

## 1. Test-First Design Thinking

Tests are an architectural constraint, not an afterthought. Design from the test
perspective first.

- **Interface-first:** Before describing implementation, ask: "Can I write the test
  for this before the implementation exists?" If the answer is unclear, the interface
  needs more thought.
- **Structure tests before code:** Plans that describe "implement then test" consistently
  fail review. Restructure: define what the tests assert, then describe the implementation
  that satisfies them.
- **Testability as architecture:** Design for dependency injection, interface seams, and
  fakes. If a component can't be tested in isolation, the coupling is too tight.
- **Test categories:** Consider which test types apply — unit (isolated logic), integration
  (module boundaries), contract (API surfaces), and characterization (existing behavior
  preservation during refactoring).
- **Verification clarity:** Each planned change should have a corresponding verification
  step that is binary-testable (pass/fail in one check, no subjective judgment).

---

## 2. File Structure & Codebase Convention Fit

Don't pick a "plausible" location — pick the location that matches the project's
established patterns.

- **Discover before proposing:** Before suggesting new files or directories, verify where
  similar things already live in this project. Use Glob/Grep to find existing patterns.
- **Naming conventions:** Match existing module and file naming patterns. If the project
  uses `kebab-case.ts`, don't introduce `camelCase.ts`. If hooks live in `hooks/`, don't
  create a `hook-handlers/` directory.
- **Co-location patterns:** Check if the project follows co-location (tests next to source,
  types with implementation) or separation (dedicated `__tests__/`, `types/` directories).
  Follow what exists.
- **Import depth:** Verify that new files fit the existing import hierarchy. Adding a file
  that requires imports to cross architectural boundaries (e.g., shared lib importing from
  feature code) signals a structural problem.
- **Existing system boundaries:** Check if the project has documented system boundaries
  (CLAUDE.md, architecture docs). New files should respect these boundaries rather than
  create cross-cutting dependencies.

---

## 3. Extensibility & Future-Proofing Analysis

Balance: don't over-engineer (YAGNI), but don't create designs that actively resist
extension.

- **Adjacent features:** What features are most commonly built after this one? Does the
  design accommodate those extensions without major restructuring?
- **Extension points:** Where would future developers need to hook in? Are those seams
  accessible, or does the design require forking/copying to extend?
- **Configuration vs. code changes:** Will common customizations require code changes, or
  can they be handled through configuration? Prefer the latter when the variation space
  is predictable.
- **Data model flexibility:** Are data structures designed to accommodate likely additions
  (new fields, new types) without breaking existing consumers?
- **Inversion of control:** Does the design allow callers to inject behavior, or does it
  hardcode decisions that callers will need to override? Prefer interfaces and callbacks
  over concrete implementations when variation is expected.

---

## Applicability

These standards apply to production code in established codebases with existing conventions.
For prototypes, scripts, spike explorations, or greenfield projects without established
patterns, use judgment on which standards apply — not all will be relevant.
