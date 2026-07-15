/**
 * New e2e suite entry: `import { test, expect } from '../fixtures/index'`
 * (or `from '../fixtures/index.js'` depending on resolver).
 *
 * Provides apiOps with e2e- prefix + tracked cleanup.
 * Does NOT inject hardcoded JWT into page — use storageState from project `setup`.
 *
 * Legacy specs MUST import from `e2e/fixtures.ts` (page + JWT localStorage hack),
 * which re-exports this apiOps base: `import { test, expect } from '../../fixtures'`.
 *
 * Page object fixtures (employeesPage, etc.) will be wired in a later phase.
 */
export { test, expect, API_BASE } from './api'
export type { ApiOperations } from './api'
export {
  ADMIN_STORAGE_STATE,
  ADMIN_STORAGE_STATE_REL,
  getAdminCredentials,
  getAdminTokenFromStorage,
} from './auth'
