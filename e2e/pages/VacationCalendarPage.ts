import { Page, Locator, Frame } from '@playwright/test'

/**
 * Page Object для страницы календаря отпусков /vacation-calendar
 */
export class VacationCalendarPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly yearSelect: Locator
  readonly table: Locator
  readonly tableRows: Locator
  readonly searchInput: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /календарь/i })
    this.yearSelect = page.locator('select').first()
    this.table = page.locator('table')
    this.tableRows = this.table.locator('tbody tr')
    this.searchInput = page.getByPlaceholder(/поиск/i)
  }

  async goto() {
    await this.page.goto('/vacation-calendar')
    await this.pageTitle.waitFor({ state: 'visible', timeout: 10000 })
  }

  async selectYear(year: number) {
    await this.yearSelect.selectOption(String(year))
  }

  async getRowCount(): Promise<number> {
    return await this.tableRows.count()
  }

  async getCellValue(employeeId: number, month: number): Promise<string | null> {
    const row = this.tableRows.filter({ has: this.page.locator(`[data-employee-id="${employeeId}"]`) }).first()
    if (!row) return null
    
    const cell = row.locator('td').nth(month)
    return await cell.textContent()
  }

  async setVacationDays(employeeId: number, month: number, days: number | string) {
    const row = this.getEmployeeRow(employeeId)
    const cell = row.locator('td').nth(month + 2)
    
    await cell.click()
    
    // Wait for input to appear - use the data-testid
    const input = this.page.getByTestId(`vacation-cell-input-${employeeId}-${month}`)
    await input.waitFor({ state: 'visible', timeout: 5000 })
    await input.fill(String(days))
    await input.press('Enter')
    
    // Wait for input to disappear (saved)
    await input.waitFor({ state: 'hidden', timeout: 5000 })
    await this.page.waitForLoadState('networkidle')
  }

  async getCellInput(employeeId: number, month: number): Locator {
    return this.page.getByTestId(`vacation-cell-input-${employeeId}-${month}`)
  }

  getEmployeeRow(employeeId: number): Locator {
    return this.tableRows.filter({ hasText: new RegExp(`\\bemployee-${employeeId}\\b`) }).first()
  }

  getRowByName(name: string): Locator {
    return this.tableRows.filter({ hasText: new RegExp(`^${name}\\b`) }).first()
  }

  async isCellEditable(employeeId: number, month: number): Promise<boolean> {
    const row = this.getEmployeeRow(employeeId)
    const cell = row.locator('td').nth(month + 2)
    
    await cell.click()
    const input = this.getCellInput(employeeId, month)
    return await input.isVisible()
  }
}