import { type Page, type Locator, expect } from '@playwright/test'

export class LoginPage {
  readonly page: Page
  readonly heading: Locator
  readonly breakGlassInput: Locator
  readonly breakGlassSubmitButton: Locator
  readonly errorMessage: Locator
  readonly ssoButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: 'HRMS' })
    this.breakGlassInput = page.getByPlaceholder('Пароль аварийного доступа')
    this.breakGlassSubmitButton = page.getByRole('button', { name: 'Аварийный вход' })
    this.errorMessage = page.locator('p.text-red-600')
    this.ssoButton = page.getByRole('button', { name: 'Войти через единый вход' })
  }

  async goto() {
    await this.page.goto('/login?password=1')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  async gotoSsoStub() {
    await this.page.goto('/login')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  async expectOnLogin() {
    await expect(this.page).toHaveURL(/\/login/)
    await expect(this.heading).toBeVisible()
  }

  async loginWithBreakGlass(password: string) {
    await this.breakGlassInput.fill(password)
    await this.breakGlassSubmitButton.click()
  }

  async startOidcSso() {
    await this.ssoButton.click()
  }

  async getToken(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('token'))
  }
}
