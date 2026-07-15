/**
 * Project `setup`: real UI login → storageState for smoke/api/ui.
 *
 * Auth path: form login with E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD.
 * Dev default: admin / dev (backend DEV_BYPASS_AUTH accepts password "dev").
 *
 * Fallback: if form login fails (e.g. admin user missing) and dev bypass
 * buttons are visible, click "Войти как Admin" (localStorage token + optional
 * JWT from /auth/login). Documented so CI can prefer real form path.
 *
 * Does not leave new users; only authenticates existing admin.
 */
import { test as setup, expect } from '@playwright/test'
import {
  ADMIN_STORAGE_STATE,
  getAdminCredentials,
} from '../fixtures/auth'

setup('authenticate as admin → storageState', async ({ page }) => {
  const { username, password } = getAdminCredentials()

  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'HRMS' })).toBeVisible()

  await page.getByPlaceholder('Введите логин').fill(username)
  await page.getByPlaceholder('Введите пароль').fill(password)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()

  // Form success → leave /login. On failure stay and show error.
  const leftLogin = await page
    .waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12_000 })
    .then(() => true)
    .catch(() => false)

  if (!leftLogin) {
    // Fallback: Dev / Test "Войти как Admin" (VITE_AUTH_MODE=dev|test only)
    const devAdmin = page.getByRole('button', { name: 'Войти как Admin' })
    if (await devAdmin.isVisible().catch(() => false)) {
      await devAdmin.click()
      await page.waitForURL((url) => !url.pathname.includes('/login'), {
        timeout: 15_000,
      })
    } else {
      const errText = await page.locator('p.text-red-600').textContent().catch(() => null)
      throw new Error(
        `Admin login failed and no dev bypass button. ` +
          `Check E2E_ADMIN_* / DEV_BYPASS_AUTH / admin user exists. ` +
          `UI error: ${errText ?? '(none)'}`
      )
    }
  }

  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token, 'expected token in localStorage after login').toBeTruthy()

  await page.context().storageState({ path: ADMIN_STORAGE_STATE })
})
