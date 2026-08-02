import { test, expect } from '@playwright/test'
import { getAdminCredentials } from '../fixtures/auth'
import { LoginPage } from '../pages/LoginPage'

test.describe('Login @auth', () => {
  test('valid break glass lands on app', async ({ page }) => {
    const { password } = getAdminCredentials()
    const login = new LoginPage(page)

    await login.goto()
    await login.loginWithBreakGlass(password)

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    const token = await login.getToken()
    expect(token).toBeTruthy()
  })

  test('invalid password shows error and stays on login', async ({ page }) => {
    const login = new LoginPage(page)

    await login.goto()
    await login.loginWithBreakGlass('definitely-wrong-password-e2e')

    await expect(page.getByText(/Неверный|Ошибка входа|парол/i)).toBeVisible({
      timeout: 10_000,
    })
    await login.expectOnLogin()

    const token = await login.getToken()
    expect(token).toBeFalsy()
  })

  test('break_glass_login_regression @auth', async ({ request }) => {
    const bgPassword = process.env.E2E_BREAK_GLASS_PASSWORD || 'dev'
    const resp = await request.post('/api/auth/break-glass/login', {
      data: { password: bgPassword },
    })
    if (resp.status() === 200) {
      const data = await resp.json()
      expect(data.access_token).toBeTruthy()
      expect(data.role).toBe('admin')
    } else {
      expect(resp.status()).toBe(401)
    }
  })

  test('password_login_endpoint_removed @auth', async ({ request }) => {
    // #36: парольное хранилище удалено — POST /auth/login больше не существует.
    const resp = await request.post('/api/auth/login', {
      data: { username: 'admin', password: 'dev' },
    })
    expect(resp.status()).toBe(404)
  })
})
