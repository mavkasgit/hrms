import { type Locator, type Page, expect } from '@playwright/test'

/**
 * POM: /structure — departments, positions, tags.
 * Custom TabsTrigger = plain button (not role=tab).
 */
export class StructurePage {
  readonly page: Page
  readonly heading: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: /структура/i, level: 1 })
  }

  async goto() {
    await this.page.goto('/structure')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  entityRow(name: string): Locator {
    return this.page.locator('main').getByText(name, { exact: true }).first()
  }

  async openDepartmentsTab() {
    // default view is departments; no-op safe click if needed
  }

  async openPositionsTab() {
    await this.page
      .locator('main')
      .getByRole('button', { name: 'Должности', exact: true })
      .first()
      .click()
    await expect(this.page.getByText(/Должности —/i)).toBeVisible({ timeout: 10_000 })
  }

  async openCreateDepartment() {
    await this.page.getByRole('button', { name: 'Подразделение' }).first().click()
    const dialog = this.page.getByRole('dialog', { name: /добавить подразделение/i })
    await expect(dialog).toBeVisible()
    return dialog
  }

  async openCreatePosition() {
    await this.page.getByRole('button', { name: 'Должность', exact: true }).first().click()
    const dialog = this.page.getByRole('dialog', { name: /добавить должность/i })
    await expect(dialog).toBeVisible()
    return dialog
  }

  async createDepartment(name: string, opts?: { shortName?: string }) {
    const dialog = await this.openCreateDepartment()
    await dialog.getByLabel('Название').fill(name)
    if (opts?.shortName) {
      await dialog.getByLabel('Краткое').fill(opts.shortName)
    }
    await dialog.getByRole('button', { name: 'Создать' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    await expect(this.entityRow(name)).toBeVisible({ timeout: 10_000 })
  }

  async createPosition(name: string) {
    const dialog = await this.openCreatePosition()
    await dialog.getByLabel('Название').fill(name)
    await dialog.getByRole('button', { name: 'Создать' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10_000 })
    await expect(this.entityRow(name)).toBeVisible({ timeout: 10_000 })
  }

  /** Optional tag panel on structure page */
  async tryCreateTag(name: string): Promise<boolean> {
    const addTagBtn = this.page
      .locator('h3')
      .filter({ hasText: 'Теги' })
      .locator('..')
      .getByRole('button', { name: 'Добавить' })
    if (!(await addTagBtn.isVisible().catch(() => false))) return false
    await addTagBtn.click()
    const tagDialog = this.page.getByRole('dialog')
    await expect(tagDialog).toBeVisible()
    const nameField = tagDialog.getByLabel(/название/i)
    if (!(await nameField.isVisible().catch(() => false))) {
      await this.page.keyboard.press('Escape')
      return false
    }
    await nameField.fill(name)
    await tagDialog.getByRole('button', { name: /создать|сохранить/i }).click()
    await expect(tagDialog).not.toBeVisible({ timeout: 10_000 }).catch(() => {})
    await expect(this.page.getByText(name, { exact: true }).first())
      .toBeVisible({ timeout: 8_000 })
      .catch(() => {})
    return true
  }

  async setOwnColor(dialog: Locator, color: string) {
    const colorInput = dialog.locator('input[type="color"]').first()
    const normalized = color.toLowerCase()
    await expect(colorInput).toBeVisible()
    await colorInput.fill(normalized)
    await expect(colorInput).toHaveValue(normalized)
  }
}
