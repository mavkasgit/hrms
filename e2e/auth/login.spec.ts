/**
 * Auth project — clean browser (no storageState).
 * Login tests must not create users; only use existing admin credentials.
 *
 * Dual-run: password form works whether OIDC is on or off.
 * OIDC / SSO covered in oidc-login.spec.ts (opt-in E2E_OIDC=1).
 */
import { test, expect } from '@playwright/test'
import { getAdminCredentials } from '../fixtures/auth'
import { LoginPage } from '../pages/LoginPage'

test.describe('Login @auth', () => {
  test('valid credentials land on app', async ({ page }) => {
    const { username, password } = getAdminCredentials()
    const login = new LoginPage(page)

    await login.goto()
    await login.loginWithPassword(username, password)

    // Leave login page (dashboard / employees / root)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    const token = await login.getToken()
    expect(token).toBeTruthy()
  })

  test('invalid password shows error and stays on login', async ({ page }) => {
    const { username } = getAdminCredentials()
    const login = new LoginPage(page)

    await login.goto()
    await login.loginWithPassword(username, 'definitely-wrong-password-e2e')

    await expect(page.getByText(/Неверный|Ошибка входа|парол/i)).toBeVisible({
      timeout: 10_000,
    })
    await login.expectOnLogin()

    const token = await login.getToken()
    expect(token).toBeFalsy()
  })
})
