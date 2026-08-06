import { test as setup, expect } from '@playwright/test'
import {
  ADMIN_STORAGE_STATE,
  getAdminCredentials,
} from '../fixtures/auth'
import { LoginPage } from '../pages/LoginPage'

setup('authenticate as admin → storageState', async ({ page }) => {
  const { password } = getAdminCredentials()
  const login = new LoginPage(page)

  // На dev/test-бэкенде может быть включён OIDC (auto-redirect в Authentik).
  // Стабим конфиг OIDC как выключенный, чтобы оставалась форма break-glass.
  await login.stubOidcDisabled()
  await login.goto()
  await login.loginWithBreakGlass(password)

  const leftLogin = await page
    .waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12_000 })
    .then(() => true)
    .catch(() => false)

  if (!leftLogin) {
    const errText = await login.errorMessage.textContent().catch(() => null)
    throw new Error(
      `Admin login failed. ` +
        `Check BREAK_GLASS_ENABLED / E2E_ADMIN_PASSWORD / backend. ` +
        `UI error: ${errText ?? '(none)'}`
    )
  }

  const token = await login.getToken()
  expect(token, 'expected token in localStorage after login').toBeTruthy()

  await page.context().storageState({ path: ADMIN_STORAGE_STATE })
})
