import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object: /users (после удаления админ-IAM — #35).
 * - OIDC on: карточка «Управление — в IdP» со ссылками на админку Authentik / IdP Ops.
 * - OIDC off: заглушка-предупреждение «Управление пользователями недоступно».
 * Локальной таблицы и CRUD-диалогов больше нет.
 * Selectors: role/label/text (no e2e-* testids on this page).
 */
export class UsersPage {
  readonly page: Page
  readonly heading: Locator
  readonly idpCard: Locator
  readonly oidcOffWarning: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', {
      name: 'Пользователи',
      level: 1,
      exact: true,
    })
    this.idpCard = page.getByText('Управление — в IdP', { exact: true })
    this.oidcOffWarning = page.getByText('Управление пользователями недоступно', {
      exact: true,
    })
  }

  /**
   * Wait until mode is resolved (no flash loader):
   * either the IdP card (OIDC on) or the warning stub (OIDC off).
   */
  async goto() {
    await this.page.goto('/users')
    const ready = this.idpCard.or(this.oidcOffWarning)
    await expect(ready).toBeVisible({ timeout: 15_000 })
  }

  /** OIDC включён: ссылки на админку Authentik / IdP Ops, без локального IAM. */
  async expectIdpFirstLayout() {
    await expect(this.heading).toBeVisible({ timeout: 10_000 })
    await expect(
      this.page.getByText(/Управление пользователями выполняется в IdP/i)
    ).toBeVisible()
    await expect(this.idpCard).toBeVisible()
    await expect(
      this.page.getByRole('button', { name: 'Админка Authentik' })
    ).toBeVisible()
    // Никаких локальных CRUD-элементов
    await expect(this.page.getByRole('button', { name: /добавить пользователя/i })).toHaveCount(0)
    await expect(this.page.locator('tbody')).toHaveCount(0)
    await expect(this.page.getByRole('dialog')).toHaveCount(0)
  }

  /** OIDC выключен: заглушка-предупреждение, без таблицы и кнопок создания. */
  async expectOidcOffWarning() {
    await expect(this.heading).toBeVisible({ timeout: 10_000 })
    await expect(this.oidcOffWarning).toBeVisible()
    await expect(this.page.getByText(/AUTH_OIDC_ENABLED/i)).toBeVisible()
    // Никаких локальных CRUD-элементов
    await expect(this.page.getByRole('button', { name: /добавить пользователя/i })).toHaveCount(0)
    await expect(this.page.locator('tbody')).toHaveCount(0)
    await expect(this.page.getByRole('dialog')).toHaveCount(0)
  }
}
