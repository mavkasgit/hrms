/**
 * Project `setup`: real UI login → storageState for smoke/api/ui.
 *
 * Dual-run (password path):
 * - Opens `/login?password=1` (escape hatch when OIDC stub is default).
 * - Form login with E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD.
 * - Dev default: admin / dev (backend DEV_BYPASS_AUTH accepts password "dev").
 * - OIDC / Authentik is **not** used here — see e2e/auth/oidc-login.spec.ts
 *   (opt-in via E2E_OIDC=1). Setup must stay green without IdP.
 *
 * Fallback: if form login fails (e.g. admin user missing) and dev bypass
 * buttons are visible, click "Войти как Admin" (localStorage token + optional
 * JWT from /auth/login). Documented so CI can prefer real form path.
 *
 * Does not leave new users; only authenticates existing admin.
 * Does not automate Telegram Widget.
 */
import { test as setup, expect } from '@playwright/test'
import {
  ADMIN_STORAGE_STATE,
  getAdminCredentials,
} from '../fixtures/auth'
import { LoginPage } from '../pages/LoginPage'

setup('authenticate as admin → storageState', async ({ page }) => {
  const { username, password } = getAdminCredentials()
  const login = new LoginPage(page)

  await login.goto()
  await login.loginWithPassword(username, password)

  // Form success → leave /login. On failure stay and show error.
  const leftLogin = await page
    .waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12_000 })
    .then(() => true)
    .catch(() => false)

  if (!leftLogin) {
    // Fallback: Dev / Test "Войти как Admin" (VITE_AUTH_MODE=dev|test only)
    if (await login.devAdminButton.isVisible().catch(() => false)) {
      await login.devAdminButton.click()
      await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 15_000,
      })
    } else {
      const errText = await login.errorMessage.textContent().catch(() => null)
      throw new Error(
        `Admin login failed and no dev bypass button. ` +
          `Check E2E_ADMIN_* / DEV_BYPASS_AUTH / admin user exists. ` +
          `UI error: ${errText ?? '(none)'}`
      )
    }
  }

  const token = await login.getToken()
  expect(token, 'expected token in localStorage after login').toBeTruthy()

  await page.context().storageState({ path: ADMIN_STORAGE_STATE })
})
