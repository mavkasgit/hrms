import { type Page, type Locator, expect } from '@playwright/test'

/**
 * POM for /login — password dual-run + optional OIDC/SSO CTA.
 *
 * Labels match frontend LoginPage:
 * - password: placeholders «Введите логин/пароль», button «Войти» (exact)
 * - SSO: «Войти через единый вход» or TG1 «Войти через Telegram»
 * - Dev bypass: «Войти как Admin» (VITE_AUTH_MODE=dev|test only)
 */
export class LoginPage {
  readonly page: Page
  readonly heading: Locator
  readonly usernameInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly errorMessage: Locator
  readonly devAdminButton: Locator
  /** Primary OIDC CTA (SSO or Telegram-primary label). */
  readonly ssoButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: 'HRMS' })
    this.usernameInput = page.getByPlaceholder('Введите логин')
    this.passwordInput = page.getByPlaceholder('Введите пароль')
    this.submitButton = page.getByRole('button', { name: 'Войти', exact: true })
    this.errorMessage = page.locator('p.text-red-600')
    this.devAdminButton = page.getByRole('button', { name: 'Войти как Admin' })
    // TG1 primary or classic SSO — both start the same OIDC authorize flow
    this.ssoButton = page.getByRole('button', {
      name: /Войти через (единый вход|Telegram)/i,
    })
  }

  async goto() {
    await this.page.goto('/login')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  async expectOnLogin() {
    await expect(this.page).toHaveURL(/\/login/)
    await expect(this.heading).toBeVisible()
  }

  async loginWithPassword(username: string, password: string) {
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  /**
   * Click primary SSO / Telegram OIDC button.
   * Prefer exact TG label when present, else «единый вход».
   */
  async startOidcSso() {
    const tg = this.page.getByRole('button', { name: 'Войти через Telegram' })
    if (await tg.isVisible().catch(() => false)) {
      await tg.click()
      return
    }
    await this.page
      .getByRole('button', { name: 'Войти через единый вход' })
      .click()
  }

  /** LocalStorage JWT after successful login (password or OIDC callback). */
  async getToken(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('token'))
  }
}
