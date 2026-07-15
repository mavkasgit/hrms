/**
 * E2E suite entry: `import { test, expect } from '../fixtures/index'`
 *
 * Provides apiOps with e2e- prefix + tracked cleanup.
 * Does NOT inject hardcoded JWT into page — use storageState from project `setup`.
 *
 * Page object fixtures (employeesPage, etc.) will be wired when needed.
 */
export { test, expect, API_BASE } from './api'
export type { ApiOperations } from './api'
export {
  ADMIN_STORAGE_STATE,
  ADMIN_STORAGE_STATE_REL,
  getAdminCredentials,
  getAdminTokenFromStorage,
} from './auth'
