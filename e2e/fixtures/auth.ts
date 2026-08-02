/**
 * Auth paths and credentials for e2e rewrite.
 * storageState is produced by setup/auth.setup.ts (project `setup`).
 *
 * Login path: Break Glass (`POST /auth/break-glass/login`) — пароль берётся
 * из env-конфига бэкенда (BREAK_GLASS_PASSWORD; в dev/test это "dev").
 * Парольного входа по локальным хэшам в HRMS нет (#36).
 * Override via E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD — never invent prod secrets.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// @ts-ignore — Playwright ESM path for fixtures
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** Absolute path to admin storageState (localStorage token + cookies). */
export const ADMIN_STORAGE_STATE = path.resolve(__dirname, '../.auth/admin.json')

/** Relative path preferred in playwright.config `use.storageState`. */
export const ADMIN_STORAGE_STATE_REL = 'e2e/.auth/admin.json'

export type AdminCredentials = {
  username: string
  password: string
}

/** Dev defaults: username admin, password dev (backend BREAK_GLASS_PASSWORD). */
export function getAdminCredentials(): AdminCredentials {
  return {
    username: process.env.E2E_ADMIN_USERNAME || 'admin',
    password: process.env.E2E_ADMIN_PASSWORD || 'dev',
  }
}

/**
 * Read JWT from storageState localStorage (`token` key).
 * Used by apiOps for Playwright APIRequestContext (does not see localStorage).
 */
export function getAdminTokenFromStorage(
  storagePath: string = ADMIN_STORAGE_STATE
): string | undefined {
  try {
    if (!fs.existsSync(storagePath)) return undefined
    const raw = fs.readFileSync(storagePath, 'utf8')
    const state = JSON.parse(raw) as {
      origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>
    }
    for (const origin of state.origins || []) {
      for (const item of origin.localStorage || []) {
        if (item.name === 'token' && item.value) {
          return item.value
        }
      }
    }
    return undefined
  } catch {
    return undefined
  }
}
