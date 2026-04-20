# E2E Stability and Deep Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize flaky Playwright tests, standardize fixtures/selectors, and strengthen deep domain checks for vacation balance and period invariants without regressing existing behavior.

**Architecture:** The test suite is stabilized in layers: shared dialog accessibility and selectors first, then flaky timing fixes, then fixture unification and API consistency, then deeper domain invariants and CI smoke/regression gates. Verification is run after each major step using focused suites and a smoke gate.

**Tech Stack:** Playwright + TypeScript, FastAPI backend, React/Vite frontend, GitHub Actions.

---

## File Map

- Modify: `frontend/src/pages/structure-page/shared/EntityDialog.tsx`
- Modify: `e2e/structure-full-lifecycle.spec.ts`
- Modify: `e2e/employee-full-lifecycle.spec.ts`
- Modify: `e2e/employee-create.spec.ts`
- Modify: `e2e/add-vacation-days.spec.ts`
- Modify: `e2e/vacation-plan-fill.spec.ts`
- Modify: `e2e/fixtures/index.ts`
- Modify: `e2e/employee-delete.spec.ts`
- Modify: `e2e/orders-errors.spec.ts`
- Modify: `e2e/vacation-balance.spec.ts`
- Modify: `e2e/vacation-periods-generation.spec.ts`
- Modify: `e2e/departments.spec.ts`
- Modify: `e2e/positions.spec.ts`
- Modify: `e2e/orders-lifecycle.spec.ts`
- Modify: `e2e/vacations-lifecycle.spec.ts`
- Modify: `e2e/employee-archive.spec.ts`
- Add: `e2e/helpers/vacation-invariants.ts`
- Modify: `package.json`
- Add: `.github/workflows/e2e-smoke.yml`
- Add: `.github/workflows/e2e-nightly.yml`

---

## Execution Log (Why + What + Verification)

### Task 0: Baseline Commit Before Migration

**Why:** User requested a pre-flight consolidated commit before further phased implementation.

- [x] Create a baseline commit with existing pending backend/frontend/e2e updates.

**Verification:**
- Commit created: `8082524`
- Working tree clean right after commit (`git status --short` returned empty output).

### Task 1: Stabilize Structure Dialog Field Targeting

**Why:** Failures were caused by brittle textbox accessible-name assumptions tied to placeholder text.

- [x] Add deterministic `id` per dialog field and bind labels through `htmlFor` in `EntityDialog`.
- [x] Move `structure-full-lifecycle` text field selectors to `getByLabel(...)` for departments/positions/tags.

**Verification Command:**
- `npx playwright test e2e/structure-full-lifecycle.spec.ts --project=chromium`

**Result:**
- 3/3 tests passed.

### Task 2: Remove Timing Sleeps From Flaky Lifecycle Specs

**Why:** `waitForTimeout` introduced race conditions and unnecessary runtime variance.

- [x] Remove fixed waits in `employee-full-lifecycle.spec.ts`.
- [x] Replace `employee-create.spec.ts` post-submit sleep with concrete response wait.
- [x] Replace `vacation-plan-fill.spec.ts` sleeps with API mutation waits and condition assertions.
- [x] Remove edit-cell sleep-only waits in `add-vacation-days.spec.ts`.

**Verification Command:**
- `npx playwright test e2e/employee-full-lifecycle.spec.ts e2e/employee-create.spec.ts e2e/add-vacation-days.spec.ts e2e/vacation-plan-fill.spec.ts --project=chromium`

**Result:**
- 4/4 tests passed.

### Task 3: Unify Specs On Shared Fixture Entry Point

**Why:** Deprecated fixture entry points created drift and incompatible helper naming.

- [x] Migrate specs from `./fixtures/*-fixtures` to `./fixtures` index export.
- [x] Extend `e2e/fixtures/index.ts` for backward-compatible signatures:
  - overloaded `createEmployee(...)`
  - aliases `getBalance`, `getPeriods`, `cleanupEmployee`
- [x] Update tests using removed fixture aliases (`employee-delete`, `orders-errors`).

**Verification Command:**
- `npx playwright test e2e/departments.spec.ts e2e/positions.spec.ts e2e/orders-lifecycle.spec.ts e2e/vacations-lifecycle.spec.ts e2e/employee-delete.spec.ts e2e/employee-archive.spec.ts e2e/orders-errors.spec.ts e2e/vacation-periods-generation.spec.ts --project=chromium`

**Result:**
- 19/19 tests passed.

### Task 4: Strengthen Deep Domain Assertions

**Why:** Domain tests validated outcomes, but shared invariants were duplicated and partially implicit.

- [x] Add reusable invariants helper in `e2e/helpers/vacation-invariants.ts`.
- [x] Apply period math invariant checks in `vacation-periods-generation.spec.ts`.
- [x] Apply balance/period invariants in `vacation-balance.spec.ts` critical paths.

**Verification Command:**
- `npx playwright test e2e/vacation-balance.spec.ts --project=chromium`

**Result:**
- 10/10 tests passed.

### Task 5: Define Operational Gates (Smoke + Regression)

**Why:** Required predictable “nothing is broken” gates after each incremental change.

- [x] Add `test:e2e:smoke` and `test:e2e:regression` scripts to `package.json`.

**Verification Command:**
- `npm run test:e2e:smoke`

**Result:**
- 14/14 tests passed.

### Task 6: CI Automation for Gate Enforcement

**Why:** Local verification is necessary but insufficient; smoke and nightly checks need automation.

- [x] Add PR/push smoke workflow: `.github/workflows/e2e-smoke.yml`.
- [x] Add nightly regression workflow: `.github/workflows/e2e-nightly.yml`.

**Verification:**
- Workflow files added and syntactically valid YAML.
- Runtime execution will be validated in CI environment after push.

---

## Final Verification Summary

- Structure suite: passed
- Flaky lifecycle subset: passed
- Fixture-migrated suites: passed
- Vacation balance deep suite: passed
- Smoke gate: passed
- Full regression gate (`npm run test:e2e:regression`): 53/53 passed

## Remaining Follow-ups (non-blocking)

- Reduce residual `console.log` noise in long-running specs to keep CI output concise.
- Continue replacing remaining `waitForTimeout` usages in less-critical POM helpers.
- Consider splitting extra-long specs into smaller `@api-domain` slices for finer CI diagnostics.
