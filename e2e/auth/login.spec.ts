/**
 * Auth project — clean browser (no storageState).
 * Login tests must not create users; only use existing admin credentials.
 */
import { test, expect } from '@playwright/test'
import { getAdminCredentials } from '../fixtures/auth'

test.describe('Login @auth', () => {
  test('valid credentials land on app', async ({ page }) => {
    const { username, password } = getAdminCredentials()

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'HRMS' })).toBeVisible()

    await page.getByPlaceholder('Введите логин').fill(username)
    await page.getByPlaceholder('Введите пароль').fill(password)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()

    // Leave login page (dashboard / employees / root)
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token).toBeTruthy()
  })

  test('invalid password shows error and stays on login', async ({ page }) => {
    const { username } = getAdminCredentials()

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'HRMS' })).toBeVisible()

    await page.getByPlaceholder('Введите логин').fill(username)
    await page.getByPlaceholder('Введите пароль').fill('definitely-wrong-password-e2e')
    await page.getByRole('button', { name: 'Войти', exact: true }).click()

    await expect(page.getByText(/Неверный|Ошибка входа|парол/i)).toBeVisible({
      timeout: 10_000,
    })
    await expect(page).toHaveURL(/\/login/)

    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token).toBeFalsy()
  })
})
