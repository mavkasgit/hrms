import { Page, Locator, expect } from '@playwright/test'
import type { EmployeeFormData, EmployeeStatus, Gender, PaymentForm } from '../types'
import { uid, comboboxCreate, dateField, fillGridInput } from '../helpers/employee-helpers'

/**
 * Page Object для страницы сотрудников
 * Инкапсулирует все взаимодействия с UI страницы /employees
 */
export class EmployeesPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly table: Locator
  readonly rows: Locator
  readonly searchInput: Locator
  readonly addBtn: Locator
  readonly filterBtn: Locator
  readonly dialog: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /сотрудники/i, level: 1 })
    this.table = page.locator('table')
    this.rows = page.locator('tbody tr')
    this.searchInput = page.getByPlaceholder(/поиск по фио/i)
    this.addBtn = page.getByRole('button', { name: /добавить/i })
    this.filterBtn = page.getByRole('button', { name: /фильтры/i })
    this.dialog = page.getByRole('dialog')
  }

  async goto() {
    await this.page.goto('/employees')
    await this.page.waitForLoadState('networkidle')
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 })
  }

  private async waitForEmployeesRefresh(trigger: () => Promise<void>) {
    const refreshPromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/api/employees') && resp.request().method() === 'GET',
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
    await this.waitForEmployeesRefresh(async () => {
      await this.searchInput.fill(query)
    })
  }

  async clearSearch() {
    await this.waitForEmployeesRefresh(async () => {
      await this.searchInput.clear()
    })
  }

  async filterByStatus(status: EmployeeStatus) {
    const statusLabels: Record<EmployeeStatus, string> = {
      active: 'Активные',
      archived: 'В архиве',
      all: 'Все',
      deleted: 'Удалённые',
    }
    await this.filterBtn.click()
    await this.waitForEmployeesRefresh(async () => {
      await this.page.getByText(statusLabels[status]).click()
    })
  }

  async filterByGender(gender: Gender) {
    const genderBtn = this.page.getByRole('button', { name: gender === 'М' ? /мужчины/i : /женщины/i })
    await this.waitForEmployeesRefresh(async () => {
      await genderBtn.click()
    })
  }

  async clearFilters() {
    await this.waitForEmployeesRefresh(async () => {
      await this.page.getByRole('button', { name: /очистить/i }).click()
    })
  }

  async sortBy(column: string, direction: 'asc' | 'desc' = 'asc') {
    const header = this.page.locator('thead th').filter({ hasText: new RegExp(column, 'i') })
    await this.waitForEmployeesRefresh(async () => {
      await header.click()
      if (direction === 'desc') {
        await header.click()
      }
    })
  }

  // ============================================================================
  // РАБОТА С ТАБЛИЦЕЙ
  // ============================================================================

  async getEmployeeCount(): Promise<number> {
    return this.rows.count()
  }

  async getEmployeeRow(name: string): Promise<Locator> {
    const row = this.rows.filter({ hasText: name })
    await expect(row.first()).toBeVisible({ timeout: 5000 })
    return row.first()
  }

  async getEmployeeNameByRow(row: Locator): Promise<string> {
    const nameCell = row.locator('td').nth(1)
    const text = await nameCell.textContent()
    return text?.trim() || ''
  }

  async getEmployeeTabNumber(name: string): Promise<number | null> {
    const row = await this.getEmployeeRow(name)
    const tabCell = row.locator('td').nth(0)
    const text = await tabCell.textContent()
    return text ? parseInt(text.trim(), 10) : null
  }

  // ============================================================================
  // СОЗДАНИЕ СОТРУДНИКА
  // ============================================================================

  async clickAdd() {
    await this.addBtn.click()
    await expect(this.dialog).toBeVisible({ timeout: 5000 })
  }

  async closeForm() {
    await this.page.keyboard.press('Escape')
    await expect(this.dialog).not.toBeVisible({ timeout: 5000 })
  }

  async fillForm(data: EmployeeFormData) {
    // ФИО
    await this.page.getByRole('textbox').first().fill(data.name)

    // Пол
    if (data.gender) {
      await this.page.getByRole('combobox').nth(0).click()
      await this.page.getByRole('option', { name: data.gender === 'М' ? 'Мужской' : 'Женский' }).click()
    }

    // Дата рождения
    if (data.birth_date) {
      await dateField(this.page, 0).fill(data.birth_date)
    }

    // Таб. номер
    if (data.tab_number) {
      await this.page.getByRole('spinbutton').nth(0).fill(String(data.tab_number))
    }

    // Должность
    if (data.position_name) {
      await comboboxCreate(this.page, 'Должность', data.position_name)
    }

    // Подразделение
    if (data.department_name) {
      await comboboxCreate(this.page, 'Подразделение', data.department_name)
    }

    // Чекбоксы
    if (data.citizenship !== undefined) {
      const cb = this.page.getByLabel('Гражданство РБ', { exact: true })
      if (data.citizenship) await cb.check()
      else await cb.uncheck()
    }
    if (data.residency !== undefined) {
      const cb = this.page.getByLabel('Резидент РБ', { exact: true })
      if (data.residency) await cb.check()
      else await cb.uncheck()
    }
    if (data.pensioner !== undefined) {
      const cb = this.page.getByLabel('Пенсионер', { exact: true })
      if (data.pensioner) await cb.check()
      else await cb.uncheck()
    }

    // Дата приёма
    if (data.hire_date) {
      await dateField(this.page, 1).fill(data.hire_date)
    }

    // Форма оплаты
    if (data.payment_form) {
      await this.page.getByRole('combobox').filter({ hasText: 'Не указана' }).click()
      await this.page.getByRole('option', { name: data.payment_form }).click()
    }

    // Ставка
    if (data.rate !== undefined) {
      await this.page.getByRole('spinbutton').nth(1).fill(String(data.rate))
    }

    // Контракт
    if (data.contract_start) {
      await dateField(this.page, 2).fill(data.contract_start)
    }
    if (data.contract_end) {
      await dateField(this.page, 3).fill(data.contract_end)
    }

    // Личный / страховой / паспорт
    if (data.personal_number) {
      await this.page.getByRole('textbox').nth(5).fill(data.personal_number)
    }
    if (data.insurance_number) {
      await fillGridInput(this.page, 2, data.insurance_number)
    }
    if (data.passport_number) {
      await fillGridInput(this.page, 3, data.passport_number)
    }
  }

  async submitForm() {
    const submitBtn = this.dialog.getByRole('button', { name: /создать|сохранить/i })
    await submitBtn.click()
  }

  async waitForDialogClose(timeout = 10000) {
    await expect(this.dialog).not.toBeVisible({ timeout })
  }

  async createEmployeeViaUI(data: EmployeeFormData) {
    await this.clickAdd()
    await this.fillForm(data)
    await this.submitForm()
    await this.waitForDialogClose()
    await expect(this.page.getByText(data.name)).toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // РЕДАКТИРОВАНИЕ И ДЕЙСТВИЯ
  // ============================================================================

  async openEmployee(name: string) {
    const row = await this.getEmployeeRow(name)
    await row.click()
    await expect(this.dialog).toBeVisible({ timeout: 5000 })
  }

  async archiveEmployee(name: string) {
    await this.openEmployee(name)
    const archiveBtn = this.dialog.getByRole('button', { name: /уволить.*архив/i })
    await expect(archiveBtn).toBeVisible({ timeout: 5000 })
    await archiveBtn.click()

    // Подтверждение в AlertDialog
    const archiveDialog = this.page.getByRole('alertdialog')
    await expect(archiveDialog).toBeVisible()
    await archiveDialog.getByRole('button', { name: /уволить/i }).click()
    await expect(archiveDialog).not.toBeVisible({ timeout: 5000 })
    await expect(this.dialog).not.toBeVisible({ timeout: 5000 })
  }

  async restoreEmployee(name: string) {
    await this.openEmployee(name)
    const restoreBtn = this.dialog.getByRole('button', { name: /восстановить/i })
    await expect(restoreBtn).toBeVisible({ timeout: 5000 })
    await restoreBtn.click()
    await expect(this.dialog).not.toBeVisible({ timeout: 5000 })
  }

  async deleteEmployeePermanently(name: string) {
    await this.openEmployee(name)
    const deleteBtn = this.dialog.getByRole('button', { name: /удалить навсегда/i })
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()

    // Подтверждение
    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: /удалить/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
    await expect(this.dialog).not.toBeVisible({ timeout: 5000 })
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

  async expectEmployeeInTable(name: string) {
    await expect(this.rows.filter({ hasText: name }).first()).toBeVisible({ timeout: 5000 })
  }

  async expectEmployeeNotInTable(name: string) {
    await expect(this.rows.filter({ hasText: name })).not.toBeVisible({ timeout: 3000 })
  }

  // ============================================================================
  // ЖУРНАЛ И ИМПОРТ
  // ============================================================================

  async openAuditLog() {
    await this.page.getByRole('button', { name: /журнал/i }).click()
    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  }

  async openImportModal() {
    await this.page.getByRole('button', { name: /импорт/i }).click()
    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  }
}
