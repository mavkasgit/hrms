import { Page, Locator, expect } from '@playwright/test'
import type { HolidayFormData } from '../types'

/**
 * Page Object для страницы праздников /settings/holidays
 */
export class HolidaysPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly table: Locator
  readonly rows: Locator
  readonly yearSelect: Locator
  readonly addBtn: Locator
  readonly fillRBBtn: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /праздники/i, level: 1 })
    this.table = page.locator('table')
    this.rows = page.locator('tbody tr')
    this.yearSelect = page.getByRole('combobox').filter({ hasText: /год/i })
    this.addBtn = page.getByRole('button', { name: /добавить/i })
    this.fillRBBtn = page.getByRole('button', { name: /заполнить рб/i })
  }

  async goto() {
    await this.page.goto('/settings/holidays')
    await this.page.waitForLoadState('networkidle')
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 })
  }

  private async waitForHolidayRefresh(trigger: () => Promise<void>) {
    const refreshPromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/api/holidays') && resp.request().method() === 'GET',
        { timeout: 5000 }
      )
      .catch(() => null)

    await trigger()
    await refreshPromise
  }

  // ============================================================================
  // ВЫБОР ГОДА
  // ============================================================================

  async selectYear(year: number) {
    await this.yearSelect.click()
    await this.waitForHolidayRefresh(async () => {
      await this.page.getByRole('option', { name: String(year) }).click()
    })
  }

  // ============================================================================
  // СТАТИСТИКА
  // ============================================================================

  async getStatValue(statName: 'Всего праздников' | 'Выходные' | 'Рабочие'): Promise<number> {
    const statCard = this.page.locator('[class*="stat"], [class*="Stat"]').filter({ hasText: statName })
    const valueText = await statCard.locator('[class*="value"]').first().textContent()
    return valueText ? parseInt(valueText.trim(), 10) : 0
  }

  // ============================================================================
  // ДОБАВЛЕНИЕ ПРАЗДНИКА
  // ============================================================================

  async clickAdd() {
    await this.addBtn.click()
    await expect(this.page.getByLabel(/дата/i)).toBeVisible({ timeout: 3000 })
  }

  async fillHolidayForm(data: HolidayFormData) {
    // Дата
    const dateInput = this.page.getByLabel(/дата/i)
    await dateInput.fill(data.date)

    // Название
    const nameInput = this.page.getByLabel(/название|имя/i)
    await nameInput.fill(data.name)
  }

  async submitHoliday() {
    const createPromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/api/holidays') && resp.request().method() === 'POST',
        { timeout: 7000 }
      )
      .catch(() => null)

    const confirmBtn = this.page.getByRole('button', { name: /подтвердить|добавить/i })
    await confirmBtn.click()
    await createPromise
  }

  async addHoliday(data: HolidayFormData) {
    await this.clickAdd()
    await this.fillHolidayForm(data)
    await this.submitHoliday()
    await expect(this.getHolidayRow(data.date)).toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // АВТОЗАПОЛНЕНИЕ
  // ============================================================================

  async fillByRB() {
    const fillPromise = this.page
      .waitForResponse(
        (resp) =>
          resp.url().includes('/api/holidays') &&
          ['POST', 'PUT'].includes(resp.request().method()),
        { timeout: 10000 }
      )
      .catch(() => null)

    await this.fillRBBtn.click()
    // Подтверждение если требуется
    const confirmDialog = this.page.getByRole('alertdialog')
    if (await confirmDialog.isVisible({ timeout: 2000 })) {
      await confirmDialog.getByRole('button', { name: /заполнить|да/i }).click()
      await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
    }
    await fillPromise
    await expect(this.rows.first()).toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ТАБЛИЦА
  // ============================================================================

  async getHolidayRow(date: string): Promise<Locator> {
    // Ищем по дате в формате DD.MM.YYYY или YYYY-MM-DD
    const row = this.rows.filter({ hasText: date })
    await expect(row.first()).toBeVisible({ timeout: 5000 })
    return row.first()
  }

  async getHolidayCount(): Promise<number> {
    return this.rows.count()
  }

  async getHolidayName(date: string): Promise<string> {
    const row = await this.getHolidayRow(date)
    const nameCell = row.locator('td').nth(2)
    const text = await nameCell.textContent()
    return text?.trim() || ''
  }

  async isHolidayWeekend(date: string): Promise<boolean> {
    const row = await this.getHolidayRow(date)
    const dateCell = row.locator('td').first()
    // Выходные подсвечены красным
    const classAttr = await dateCell.getAttribute('class')
    return classAttr?.includes('red') || classAttr?.includes('weekend') || false
  }

  // ============================================================================
  // УДАЛЕНИЕ
  // ============================================================================

  async deleteHoliday(date: string) {
    const row = await this.getHolidayRow(date)
    const deleteBtn = row.getByRole('button', { name: /удалить|trash/i })
    await expect(deleteBtn).toBeVisible({ timeout: 3000 })
    await deleteBtn.click()

    // Подтверждение
    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 3000 })
    await confirmDialog.getByRole('button', { name: /удалить/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ПРОВЕРКИ
  // ============================================================================

  async expectHolidayVisible(date: string) {
    await expect(this.getHolidayRow(date)).toBeVisible({ timeout: 5000 })
  }

  async expectHolidayNotVisible(date: string) {
    await expect(this.page.getByText(date)).not.toBeVisible({ timeout: 3000 })
  }

  async expectHolidayCount(count: number) {
    await expect(this.rows).toHaveCount(count, { timeout: 5000 })
  }
}
