import { Page, Locator, expect } from '@playwright/test'

export class VacationsPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly table: Locator
  readonly rows: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: 'Отпуска' })
    this.table = page.locator('table')
    this.rows = page.locator('tbody tr')
  }

  async goto() {
    await this.page.goto('/vacations')
    await this.pageTitle.waitFor({ state: 'visible', timeout: 10000 })
    await this.table.waitFor({ state: 'visible', timeout: 10000 })
  }

  async waitForTableLoaded() {
    await expect(this.pageTitle).toBeVisible()
    await expect(this.table).toBeVisible()
  }

  async getRowCount(): Promise<number> {
    return this.rows.count()
  }

  async getFirstRow(): Promise<Locator> {
    return this.rows.first()
  }

  async getEmployeeNameByRow(row: Locator): Promise<string> {
    const nameCell = row.locator('td').nth(2)
    const text = await nameCell.textContent()
    return text?.trim() || ''
  }

  async getAddDaysColumnIndex(): Promise<number> {
    const headers = this.page.locator('thead th')
    const index = await headers.evaluateAll((ths) => {
      return ths.findIndex(th => th.textContent?.includes('Доп. дни'))
    })
    return index
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

  async getVacationBalance(employeeId: number): Promise<any> {
    const response = await this.page.request.get('http://localhost:8000/api/vacations/balance', {
      params: { employee_id: employeeId }
    })
    expect(response.status()).toBe(200)
    return response.json()
  }

  async getVacationPeriods(employeeId: number): Promise<any[]> {
    const response = await this.page.request.get(`http://localhost:8000/api/vacation-periods/employees/${employeeId}/periods`)
    expect(response.status()).toBe(200)
    return response.json()
  }
}
