import { type Page, expect } from '@playwright/test'

/**
 * POM: absences nav + unpaid / weekend / sick pages.
 */
export class AbsencesPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async openSidebarLinks() {
    await this.page.goto('/')
    await this.page.getByRole('button', { name: 'Отсутствия' }).click()
    await expect(this.page.getByRole('link', { name: 'Трудовой отпуск' })).toBeVisible()
    await expect(this.page.getByRole('link', { name: 'Отпуск за свой счет' })).toBeVisible()
    await expect(this.page.getByRole('link', { name: 'Вызовы в выходные дни' })).toBeVisible()
    await expect(this.page.getByRole('link', { name: 'Больничные' })).toBeVisible()
  }

  async gotoUnpaidLeaves() {
    await this.page.goto('/unpaid-leaves')
    await expect(
      this.page.getByRole('heading', { name: 'Отпуск за свой счет', exact: true })
    ).toBeVisible({ timeout: 15_000 })
  }

  async gotoWeekendCalls() {
    await this.page.goto('/weekend-calls')
    await expect(
      this.page.getByRole('heading', { name: 'Вызовы в выходные дни' })
    ).toBeVisible({ timeout: 15_000 })
  }

  async gotoSickLeaves() {
    await this.page.goto('/sick-leaves')
    await expect(
      this.page.getByRole('heading', { name: 'Больничные листы' })
    ).toBeVisible({ timeout: 15_000 })
  }

  async setUnpaidPeriod(from: string, to: string) {
    await this.page.locator('[data-testid="unpaid-period-from"] input').fill(from)
    await this.page.locator('[data-testid="unpaid-period-to"] input').fill(to)
  }

  async setWeekendPeriod(from: string, to: string) {
    await this.page.locator('[data-testid="weekend-period-from"] input').fill(from)
    await this.page.locator('[data-testid="weekend-period-to"] input').fill(to)
  }

  unpaidTotalOrders() {
    return this.page.getByTestId('unpaid-total-orders')
  }

  unpaidTotalDays() {
    return this.page.getByTestId('unpaid-total-days')
  }

  weekendTotalCalls() {
    return this.page.getByTestId('weekend-total-calls')
  }

  weekendTotalDays() {
    return this.page.getByTestId('weekend-total-days')
  }

  async expectOrderRowActions() {
    await expect(this.page.getByTitle('Просмотр DOCX').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(this.page.getByTitle('Скачать приказ').first()).toBeVisible()
    await expect(this.page.getByTitle('Удалить приказ').first()).toBeVisible()
  }
}
