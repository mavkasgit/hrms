import { Page, Locator, expect } from '@playwright/test'

/**
 * POM: /vacations — list search, row helpers, additional days edit.
 * Form create / period lifecycle UI methods removed (unused; covered by API pytest).
 */
export class VacationsPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly table: Locator
  readonly rows: Locator
  readonly searchInput: Locator
  readonly createFormEmployeeSearch: Locator
  readonly orderNumberInput: Locator
  readonly startDateInput: Locator
  readonly endDateInput: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: 'Трудовой отпуск' })
    this.table = page.locator('table')
    this.rows = page.locator('tbody tr')
    this.searchInput = page.getByPlaceholder(/поиск по фио или таб/i)
    // Форма создания отпуска (вкладка «Создать трудовой отпуск» открыта по умолчанию)
    this.createFormEmployeeSearch = page.getByPlaceholder('Поиск по ФИО...').first()
    this.orderNumberInput = page.getByLabel(/номер приказа/i).first()
    this.startDateInput = page.getByLabel(/Дата начала/i).first()
    this.endDateInput = page.getByLabel(/Дата конца/i).first()
  }

  async goto() {
    await this.page.goto('/vacations')
    await expect(this.pageTitle).toBeVisible({ timeout: 15000 })
    await expect(this.table).toBeVisible({ timeout: 15000 })
  }

  /** Выбрать сотрудника в форме создания отпуска (EmployeeSearch). */
  async selectCreateFormEmployee(name: string) {
    await expect(this.createFormEmployeeSearch).toBeVisible({ timeout: 10_000 })
    await this.createFormEmployeeSearch.click()
    await this.createFormEmployeeSearch.fill(name)
    const option = this.page.locator('button').filter({ hasText: name }).first()
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()
    await expect(this.page.getByText(name, { exact: false }).first()).toBeVisible({
      timeout: 5_000,
    })
  }

  /** Заполнить даты начала/конца отпуска в формате ДД.ММ.ГГГГ. */
  async fillCreateFormDates(start: string, end: string) {
    await this.startDateInput.click()
    await this.startDateInput.fill(start)
    await this.startDateInput.press('Enter')
    await this.endDateInput.click()
    await this.endDateInput.fill(end)
    await this.endDateInput.press('Enter')
  }

  private async waitForVacationListRefresh(trigger: () => Promise<void>) {
    const refreshPromise = this.page
      .waitForResponse(
        (resp) =>
          (resp.url().includes('/api/vacations') || resp.url().includes('/api/vacation-periods')) &&
          resp.request().method() === 'GET',
        { timeout: 4000 }
      )
      .catch(() => null)

    await trigger()
    await refreshPromise
  }

  async searchEmployee(query: string) {
    await this.waitForVacationListRefresh(async () => {
      await this.searchInput.fill(query)
    })
  }

  async getEmployeeRow(name: string): Promise<Locator> {
    const row = this.rows.filter({ hasText: name })
    await expect(row.first()).toBeVisible({ timeout: 5000 })
    return row.first()
  }

  async getEmployeeNameByRow(row: Locator): Promise<string> {
    const nameCell = row.locator('td').nth(2)
    const text = await nameCell.textContent()
    return text?.trim() || ''
  }

  async getAddDaysColumnIndex(): Promise<number> {
    const headers = this.page.locator('thead th')
    return headers.evaluateAll((ths) =>
      ths.findIndex((th) => th.textContent?.includes('Доп. дни'))
    )
  }

  async getAddDaysCellForRow(row: Locator, colIndex: number): Promise<Locator> {
    return row.locator(`td:nth-child(${colIndex + 1})`)
  }

  async editAddDays(cell: Locator, newValue: number): Promise<void> {
    const button = cell.locator('button')
    await expect(button).toBeVisible()
    await button.click()

    const input = cell.locator('input')
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill(String(newValue))
    await input.press('Enter')
  }
}
