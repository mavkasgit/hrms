import { type Locator, type Page, expect } from '@playwright/test'

/**
 * POM: /timesheet — shell, mode tabs, import, history, legend.
 * Custom TabsTrigger = plain button (not role=tab).
 */
export class TimesheetPage {
  readonly page: Page
  readonly heading: Locator
  readonly planTab: Locator
  readonly factTab: Locator
  readonly mergedTab: Locator
  readonly importButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', {
      name: 'Табель учёта рабочего времени',
    })
    this.planTab = page.getByRole('button', { name: 'План', exact: true })
    this.factTab = page.getByRole('button', { name: 'Факт', exact: true })
    this.mergedTab = page.getByRole('button', { name: 'Совмещённый', exact: true })
    this.importButton = page.getByTestId('timesheet-import-button')
  }

  async goto() {
    await this.page.goto('/timesheet')
    await expect(this.heading).toBeVisible({ timeout: 15_000 })
  }

  async expectSidebarLink() {
    await this.page.goto('/')
    await expect(this.page.getByRole('link', { name: 'Табель учёта' })).toBeVisible({
      timeout: 15_000,
    })
  }

  async switchModeTabs() {
    await expect(this.planTab).toBeVisible({ timeout: 15_000 })
    await expect(this.factTab).toBeVisible()
    await expect(this.mergedTab).toBeVisible()
    await this.factTab.click()
    await expect(this.factTab).toHaveClass(/shadow-sm|bg-background/)
    await this.mergedTab.click()
    await expect(this.mergedTab).toHaveClass(/shadow-sm|bg-background/)
    await this.planTab.click()
    await expect(this.planTab).toHaveClass(/shadow-sm|bg-background/)
  }

  async openImportModal() {
    await this.importButton.click()
    await expect(this.page.getByText('Импорт журнала турникетов')).toBeVisible({
      timeout: 10_000,
    })
    await expect(this.page.getByText('Нажмите для выбора .xlsx файла')).toBeVisible()
  }

  async openImportHistory() {
    await this.page.getByRole('button', { name: 'История импортов' }).click()
    await expect(this.page.getByText('История импортов').first()).toBeVisible({
      timeout: 10_000,
    })
  }

  async navigateMonth() {
    const prev = this.page.getByRole('button', { name: /предыдущ|назад|prev/i }).first()
    const next = this.page.getByRole('button', { name: /следующ|вперёд|next/i }).first()
    if (await prev.isVisible().catch(() => false)) {
      await prev.click()
    } else if (await next.isVisible().catch(() => false)) {
      await next.click()
    } else {
      const iconNav = this.page.locator('button').filter({ has: this.page.locator('svg') }).first()
      await iconNav.click()
    }
    await expect(this.page.getByRole('heading', { name: /Табель учёта/i })).toBeVisible()
  }

  async expectLegend() {
    await expect(this.page.getByText('Расхождение плана и факта').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(this.page.getByText('Выходной (Сб/Вс)').first()).toBeVisible()
    await expect(this.page.getByText('Праздничный день').first()).toBeVisible()
    await expect(this.page.getByText('Нерабочие статусы:').first()).toBeVisible()
    await expect(this.page.getByText('Отпуск').first()).toBeVisible()
    await expect(this.page.getByText('Больничный').first()).toBeVisible()
  }
}
