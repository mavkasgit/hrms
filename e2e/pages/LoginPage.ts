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
    // OIDC SSO only — never the app-level Telegram bot button
    // (that label collides when telegram_primary is off)
    this.ssoButton = page.getByRole('button', {
      name: 'Войти через единый вход',
    })
  }

  /** OIDC CTA when AUTH_OIDC_TELEGRAM_PRIMARY (app bot hidden). */
  get ssoTelegramPrimaryButton(): Locator {
    return this.page.getByRole('button', { name: 'Войти через Telegram' })
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
   * Click OIDC SSO CTA (Authentik authorize).
   *
   * Prefer «Войти через единый вход» first: when telegram_primary is off,
   * LoginPage still shows app-level «Войти через Telegram» (bot modal) —
   * that must NOT be used for OIDC e2e.
   * When telegram_primary is on, app bot is hidden and OIDC CTA is the TG label.
   */
  async startOidcSso() {
    const sso = this.page.getByRole('button', {
      name: 'Войти через единый вход',
    })
    if (await sso.isVisible().catch(() => false)) {
      await sso.click()
      return
    }
    // TG1 primary: OIDC button only (app bot login hidden)
    await this.page
      .getByRole('button', { name: 'Войти через Telegram' })
      .click()
  }

  /** LocalStorage JWT after successful login (password or OIDC callback). */
  async getToken(): Promise<string | null> {
    return this.page.evaluate(() => localStorage.getItem('token'))
  }
}
