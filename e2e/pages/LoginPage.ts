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
    await this.page.goto('/login')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  /**
   * Стаб /api/auth/oidc/config → enabled=false: форма break-glass доступна всегда,
   * даже когда на бэкенде включён OIDC (иначе /login auto-redirect'ит в Authentik
   * и до формы не добраться). НЕ вызывать в oidc-login.spec.ts — там нужен реальный конфиг.
   */
  async stubOidcDisabled() {
    await this.page.route('**/auth/oidc/config', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          authorization_url: null,
          client_id: null,
          redirect_uri: null,
          scopes: null,
          issuer: null,
          sso_only: false,
          login_hint_enabled: false,
        }),
      })
    )
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
