import { Page, Locator, expect } from '@playwright/test'
import type { VacationFormData, VacationType } from '../types'

/**
 * Page Object для страницы отпусков
 * Инкапсулирует все взаимодействия с UI страницы /vacations
 */
export class VacationsPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly table: Locator
  readonly rows: Locator
  readonly searchInput: Locator
  readonly createForm: Locator
  readonly auditLogBtn: Locator
  readonly calendarBtn: Locator
  readonly successAlert: Locator

  // Поля формы создания
  readonly employeeCombobox: Locator
  readonly vacationTypeCombobox: Locator
  readonly startDateInput: Locator
  readonly endDateInput: Locator
  readonly orderDateInput: Locator
  readonly orderNumberInput: Locator
  readonly createBtn: Locator
  readonly clearBtn: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: 'Отпуска' })
    this.table = page.locator('table')
    this.rows = page.locator('tbody tr')
    this.searchInput = page.getByPlaceholder(/поиск по имени|поиск/i)
    this.createForm = page.locator('form').first()
    this.auditLogBtn = page.getByRole('button', { name: /журнал/i })
    this.calendarBtn = page.getByRole('button', { name: /календарь/i })
    this.successAlert = page.getByRole('alert').filter({ hasText: /успешно/i })

    // Поля формы
    this.employeeCombobox = page.locator('label:has-text("Сотрудник")').locator('..').locator('[role="combobox"]')
    this.vacationTypeCombobox = page.locator('label:has-text("Тип отпуска")').locator('..').locator('[role="combobox"]')
    this.startDateInput = page.locator('label:has-text("Дата начала")').locator('..').locator('input')
    this.endDateInput = page.locator('label:has-text("Дата конца")').locator('..').locator('input')
    this.orderDateInput = page.locator('label:has-text("Дата приказа")').locator('..').locator('input')
    this.orderNumberInput = page.getByLabel(/номер приказа/i)
    this.createBtn = page.getByRole('button', { name: /создать/i })
    this.clearBtn = page.getByRole('button', { name: /очистить/i })
  }

  async goto() {
    await this.page.goto('/vacations')
    await this.page.waitForLoadState('networkidle')
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 })
    await expect(this.table).toBeVisible({ timeout: 10000 })
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

  // ============================================================================
  // ПОИСК И ФИЛЬТРАЦИЯ
  // ============================================================================

  async searchEmployee(query: string) {
    await this.waitForVacationListRefresh(async () => {
      await this.searchInput.fill(query)
    })
  }

  async filterByArchive(status: 'active' | 'archived' | 'all') {
    const statusLabels: Record<string, string> = {
      active: 'Активные',
      archived: 'В архиве',
      all: 'Все',
    }
    await this.page.getByRole('button', { name: /архив|фильтр/i }).click()
    await this.waitForVacationListRefresh(async () => {
      await this.page.getByText(statusLabels[status]).click()
    })
  }

  // ============================================================================
  // ЗАПОЛНЕНИЕ ФОРМЫ
  // ============================================================================

  async selectEmployee(name: string) {
    await this.employeeCombobox.click()
    const searchInput = this.page.locator('input[placeholder*="Найти"], input[placeholder*="ФИО"]').first()
    await searchInput.waitFor({ state: 'visible', timeout: 3000 })
    await searchInput.fill(name)

    const option = this.page.getByRole('option', { name }).first()
    await option.waitFor({ state: 'visible', timeout: 2000 }).catch(() => null)
    const isVisible = await option.isVisible({ timeout: 2000 }).catch(() => false)
    if (isVisible) {
      await option.click()
    } else {
      await searchInput.press('Enter')
    }

    await expect(this.employeeCombobox).toContainText(name, { timeout: 5000 })
  }

  async selectVacationType(type: VacationType) {
    await this.vacationTypeCombobox.click()
    await this.page.getByRole('option', { name: type }).click()
    await expect(this.vacationTypeCombobox).toContainText(type, { timeout: 3000 })
  }

  async fillStartDate(date: string) {
    await this.startDateInput.fill(date)
  }

  async fillEndDate(date: string) {
    await this.endDateInput.fill(date)
  }

  async fillOrderDate(date: string) {
    await this.orderDateInput.fill(date)
  }

  async fillOrderNumber(number: string) {
    await this.orderNumberInput.fill(number)
  }

  // ============================================================================
  // ДЕЙСТВИЯ С ФОРМОЙ
  // ============================================================================

  async clickCreate() {
    const createPromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/api/vacations') && resp.request().method() === 'POST',
        { timeout: 7000 }
      )
      .catch(() => null)

    await this.createBtn.click()
    await createPromise
  }

  async clickClear() {
    await this.clearBtn.click()
    await expect(this.orderNumberInput).toHaveValue('')
  }

  async createVacation(data: VacationFormData) {
    if (data.employee_id) {
      // Если передан ID, нужно найти имя сотрудника
      // В реальном сценарии это делается через API lookup
    }
    if (data.start_date) {
      await this.fillStartDate(data.start_date)
    }
    if (data.end_date) {
      await this.fillEndDate(data.end_date)
    }
    if (data.vacation_type) {
      await this.selectVacationType(data.vacation_type)
    }
    if (data.order_date) {
      await this.fillOrderDate(data.order_date)
    }
    if (data.order_number) {
      await this.fillOrderNumber(data.order_number)
    }
    await this.clickCreate()
  }

  async waitForSuccess(timeout = 5000) {
    await expect(this.successAlert).toBeVisible({ timeout })
  }

  // ============================================================================
  // РАБОТА С ТАБЛИЦЕЙ
  // ============================================================================

  async getRowCount(): Promise<number> {
    return this.rows.count()
  }

  async getFirstRow(): Promise<Locator> {
    return this.rows.first()
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

  async expandRow(row: Locator) {
    const chevron = row.locator('[data-lucide="chevron-right"], svg.lucide-chevron-right')
    if (await chevron.count() > 0) {
      await chevron.click()
      await expect(row.locator('[data-lucide="chevron-down"], svg.lucide-chevron-down')).toBeVisible({ timeout: 3000 })
    } else {
      // Если уже раскрыта (chevron-down), ничего не делаем
      const chevronDown = row.locator('[data-lucide="chevron-down"], svg.lucide-chevron-down')
      if (await chevronDown.count() === 0) {
        await row.click()
        await expect(chevronDown).toBeVisible({ timeout: 3000 })
      }
    }
  }

  async collapseRow(row: Locator) {
    const chevronDown = row.locator('[data-lucide="chevron-down"], svg.lucide-chevron-down')
    if (await chevronDown.count() > 0) {
      await chevronDown.click()
      await expect(row.locator('[data-lucide="chevron-right"], svg.lucide-chevron-right')).toBeVisible({ timeout: 3000 })
    }
  }

  async isRowExpanded(row: Locator): Promise<boolean> {
    const chevronDown = row.locator('[data-lucide="chevron-down"], svg.lucide-chevron-down')
    return (await chevronDown.count()) > 0
  }

  // ============================================================================
  // ПЕРИОДЫ И БАЛАНС
  // ============================================================================

  async getPeriods(row: Locator): Promise<Locator> {
    return row.locator('[class*="period"], [class*="Period"]')
  }

  async getVacationsForRow(row: Locator): Promise<Locator> {
    return row.locator('tbody tr')
  }

  async closePeriod(row: Locator, yearNumber: number) {
    const periodRow = row.locator('tr').filter({ hasText: `Год ${yearNumber}` })
    const closeBtn = periodRow.getByRole('button', { name: /закрыть период/i })
    await expect(closeBtn).toBeVisible({ timeout: 3000 })
    await closeBtn.click()

    // Подтверждение
    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 3000 })
    await confirmDialog.getByRole('button', { name: /закрыть/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  async partialClosePeriod(row: Locator, yearNumber: number, remainingDays: number) {
    const periodRow = row.locator('tr').filter({ hasText: `Год ${yearNumber}` })
    const partialBtn = periodRow.getByRole('button', { name: /частично закрыть/i })
    await expect(partialBtn).toBeVisible({ timeout: 3000 })
    await partialBtn.click()

    // Ввод остатка дней
    const remainingInput = this.page.getByLabel(/остаток дней/i)
    await remainingInput.fill(String(remainingDays))

    const confirmDialog = this.page.getByRole('alertdialog')
    await confirmDialog.getByRole('button', { name: /закрыть/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  async restorePeriod(row: Locator, yearNumber: number) {
    const periodRow = row.locator('tr').filter({ hasText: `Год ${yearNumber}` })
    const restoreBtn = periodRow.getByRole('button', { name: /восстановить период/i })
    await expect(restoreBtn).toBeVisible({ timeout: 3000 })
    await restoreBtn.click()
  }

  async toggleClosedPeriods() {
    const toggleBtn = this.page.getByRole('button', { name: /показать.*закрытые|скрыть.*закрытые/i })
    await expect(toggleBtn).toBeVisible({ timeout: 3000 })
    const previousText = (await toggleBtn.textContent())?.trim() ?? ''
    await toggleBtn.click()
    await expect
      .poll(async () => ((await toggleBtn.textContent()) ?? '').trim(), { timeout: 3000 })
      .not.toBe(previousText)
  }

  // ============================================================================
  // ДЕЙСТВИЯ С ОТПУСКАМИ
  // ============================================================================

  async cancelVacation(row: Locator, vacationIndex = 0) {
    const vacationRow = this.getVacationsForRow(row).nth(vacationIndex)
    const cancelBtn = vacationRow.getByRole('button', { name: /отменить/i })
    await expect(cancelBtn).toBeVisible({ timeout: 3000 })
    await cancelBtn.click()

    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 3000 })
    await confirmDialog.getByRole('button', { name: /отменить/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  async deleteVacation(row: Locator, vacationIndex = 0) {
    const vacationRow = this.getVacationsForRow(row).nth(vacationIndex)
    const deleteBtn = vacationRow.getByRole('button', { name: /удалить/i })
    await expect(deleteBtn).toBeVisible({ timeout: 3000 })
    await deleteBtn.click()

    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 3000 })
    await confirmDialog.getByRole('button', { name: /удалить/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ДОП. ДНИ
  // ============================================================================

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

  // ============================================================================
  // НАВИГАЦИЯ
  // ============================================================================

  async openAuditLog() {
    await this.auditLogBtn.click()
    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  }

  async openCalendar() {
    await this.calendarBtn.click()
    await this.page.waitForURL('/vacation-calendar')
    await expect(this.page.getByRole('heading', { name: /календарь/i })).toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ПРОВЕРКИ
  // ============================================================================

  async expectEmployeeVisible(name: string) {
    await expect(this.page.getByText(name)).toBeVisible({ timeout: 5000 })
  }

  async expectEmployeeNotVisible(name: string) {
    await expect(this.page.getByText(name)).not.toBeVisible({ timeout: 3000 })
  }

  async expectVacationVisibleForRow(row: Locator, startDate: string, endDate: string) {
    const vacationRow = this.getVacationsForRow(row).first()
    await expect(vacationRow).toBeVisible({ timeout: 3000 })
    await expect(vacationRow).toContainText(startDate)
    await expect(vacationRow).toContainText(endDate)
  }
}
