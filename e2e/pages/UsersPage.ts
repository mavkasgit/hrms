import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Page Object: /settings/users — список, create dialog, invite, delete.
 * Selectors: role/label/text (no e2e-* testids on this page).
 */
export class UsersPage {
  readonly page: Page
  readonly heading: Locator
  readonly addButton: Locator
  readonly searchInput: Locator
  readonly createDialog: Locator
  readonly deleteDialog: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', {
      name: 'Пользователи кадровой системы',
      level: 1,
    })
    this.addButton = page.getByRole('button', { name: 'Добавить пользователя' })
    this.searchInput = page.getByPlaceholder(/поиск по логину/i)
    this.createDialog = page.getByRole('dialog', { name: /добавление пользователя/i })
    this.deleteDialog = page.getByRole('alertdialog')
  }

  async goto() {
    await this.page.goto('/settings/users')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  /** Row in users table that contains the given username. */
  userRow(username: string): Locator {
    return this.page.locator('tbody tr').filter({ hasText: username })
  }

  async openCreateDialog() {
    await this.addButton.click()
    await expect(this.createDialog).toBeVisible({ timeout: 10_000 })
  }

  /**
   * EmployeeSearch in create dialog: placeholder «Начните вводить ФИО...».
   */
  async selectEmployeeByName(name: string) {
    const search = this.createDialog.getByPlaceholder('Начните вводить ФИО...')
    await expect(search).toBeVisible({ timeout: 10_000 })
    await search.click()
    await search.fill(name)
    const option = this.page.locator('button').filter({ hasText: name }).first()
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()
    // Chip with employee name replaces the search input
    await expect(this.createDialog.getByText(name, { exact: false }).first()).toBeVisible({
      timeout: 5_000,
    })
  }

  async fillUsername(username: string) {
    const login = this.createDialog.getByPlaceholder('ivanov_i')
    await expect(login).toBeVisible()
    await login.fill(username)
    await expect(login).toHaveValue(username)
  }

  /**
   * Role Select defaults to viewer («Наблюдатель»).
   * Explicitly pick to assert the control works.
   * Soft dual-run (SSO-D): when OIDC is on the role Select is hidden — skip silently.
   */
  async selectRole(label: 'Наблюдатель' | 'Администратор') {
    const trigger = this.createDialog.getByRole('combobox')
    const visible = await trigger.isVisible().catch(() => false)
    if (!visible) {
      // OIDC on: role managed via IdP section — no local Select
      return
    }
    // Already selected?
    if (await trigger.getByText(label, { exact: true }).isVisible().catch(() => false)) {
      return
    }
    await trigger.click()
    await this.page.getByRole('option', { name: label, exact: true }).click()
    await expect(trigger).toContainText(label)
  }

  async saveCreate() {
    await this.createDialog.getByRole('button', { name: 'Сохранить' }).click()
    await expect(this.createDialog).not.toBeVisible({ timeout: 15_000 })
  }

  async expectUserInTable(username: string) {
    await expect(this.userRow(username)).toBeVisible({ timeout: 10_000 })
  }

  async expectUserNotInTable(username: string) {
    await expect(this.userRow(username)).toHaveCount(0, { timeout: 10_000 })
  }

  async generateInvite(username: string) {
    const row = this.userRow(username)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Сгенерировать инвайт' }).click()
    await expect(row.getByText(/Инвайт:/i)).toBeVisible({ timeout: 10_000 })
  }

  /**
   * Icon-only trash button is the last action button in the row.
   * Edit (Edit2) is first; delete (Trash2) is second.
   */
  async deleteUser(username: string) {
    const row = this.userRow(username)
    await expect(row).toBeVisible()
    // Actions cell: last button is delete (no accessible name)
    await row.locator('td').last().locator('button').last().click()
    await expect(this.deleteDialog).toBeVisible({ timeout: 5_000 })
    await expect(
      this.deleteDialog.getByRole('heading', { name: 'Удалить пользователя?' })
    ).toBeVisible()
    await this.deleteDialog.getByRole('button', { name: 'Да, удалить' }).click()
    await expect(this.deleteDialog).not.toBeVisible({ timeout: 10_000 })
  }
}
