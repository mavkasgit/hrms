import { Page, Locator, expect } from '@playwright/test'
import type { OrderFormData, OrderType, OrderExtraFields } from '../types'

/**
 * Page Object для страницы приказов
 * Инкапсулирует все взаимодействия с UI страницы /orders
 */
export class OrdersPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly table: Locator
  readonly rows: Locator
  readonly createForm: Locator
  readonly auditLogBtn: Locator

  // Поля формы создания
  readonly employeeCombobox: Locator
  readonly orderTypeCombobox: Locator
  readonly orderDateInput: Locator
  readonly orderNumberInput: Locator
  readonly createBtn: Locator
  readonly clearBtn: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /приказы/i, level: 1 })
    this.table = page.locator('table')
    this.rows = page.locator('tbody tr')
    this.createForm = page.locator('form').first()
    this.auditLogBtn = page.getByRole('button', { name: /журнал/i })

    // Поля формы
    this.employeeCombobox = page.getByLabel(/сотрудник/i).locator('..').locator('[role="combobox"]')
    this.orderTypeCombobox = page.getByLabel(/тип приказа/i).locator('..').locator('[role="combobox"]')
    this.orderDateInput = page.getByLabel(/дата приказа/i)
    this.orderNumberInput = page.getByLabel(/номер приказа/i)
    this.createBtn = page.getByRole('button', { name: /создать/i })
    this.clearBtn = page.getByRole('button', { name: /очистить/i })
  }

  async goto() {
    await this.page.goto('/orders')
    await this.page.waitForLoadState('networkidle')
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 })
  }

  // ============================================================================
  // ЗАПОЛНЕНИЕ ФОРМЫ
  // ============================================================================

  async selectEmployee(name: string) {
    await this.employeeCombobox.click()
    const searchInput = this.page.locator('input[placeholder*="Найти"], input[placeholder*="ФИО"]').first()
    await searchInput.waitFor({ state: 'visible', timeout: 3000 })
    await searchInput.fill(name)
    await this.page.waitForTimeout(300)

    // Выбираем из списка
    const option = this.page.getByRole('option', { name }).first()
    const isVisible = await option.isVisible({ timeout: 2000 }).catch(() => false)
    if (isVisible) {
      await option.click()
    } else {
      // Если нет опции, нажимаем Enter
      await searchInput.press('Enter')
      await this.page.waitForTimeout(300)
    }
  }

  async selectOrderType(type: OrderType) {
    await this.orderTypeCombobox.click()
    await this.page.getByRole('option', { name: type }).click()
    await this.page.waitForTimeout(300)
  }

  async fillOrderDate(date: string) {
    await this.orderDateInput.fill(date)
  }

  async fillOrderNumber(number: string) {
    await this.orderNumberInput.fill(number)
  }

  async fillExtraFields(data: OrderExtraFields) {
    // Доп. поля появляются после выбора типа приказа
    // Прием на работу
    if (data.hire_date) {
      const hireDateInput = this.page.getByLabel(/дата приема/i)
      if (await hireDateInput.isVisible()) {
        await hireDateInput.fill(data.hire_date)
      }
    }
    if (data.contract_end) {
      const contractEndInput = this.page.getByLabel(/конец контракта/i)
      if (await contractEndInput.isVisible()) {
        await contractEndInput.fill(data.contract_end)
      }
    }
    if (data.probation_end) {
      const probationInput = this.page.getByLabel(/конец исп. срока/i)
      if (await probationInput.isVisible()) {
        await probationInput.fill(data.probation_end)
      }
    }

    // Увольнение
    if (data.termination_date) {
      const termDateInput = this.page.getByLabel(/дата увольнения/i)
      if (await termDateInput.isVisible()) {
        await termDateInput.fill(data.termination_date)
      }
    }

    // Отпуск/Больничный
    if (data.vacation_start) {
      const startDateInput = this.page.getByLabel(/начало/i)
      if (await startDateInput.isVisible()) {
        await startDateInput.fill(data.vacation_start)
      }
    }
    if (data.vacation_end) {
      const endDateInput = this.page.getByLabel(/конец/i)
      if (await endDateInput.isVisible()) {
        await endDateInput.fill(data.vacation_end)
      }
    }
    if (data.vacation_days) {
      const daysInput = this.page.getByLabel(/дней/i)
      if (await daysInput.isVisible()) {
        await daysInput.fill(String(data.vacation_days))
      }
    }

    // Перевод
    if (data.transfer_date) {
      const transferInput = this.page.getByLabel(/дата перевода/i)
      if (await transferInput.isVisible()) {
        await transferInput.fill(data.transfer_date)
      }
    }

    // Продление контракта
    if (data.new_contract_end) {
      const newEndInput = this.page.getByLabel(/новая дата конца/i)
      if (await newEndInput.isVisible()) {
        await newEndInput.fill(data.new_contract_end)
      }
    }
  }

  // ============================================================================
  // ДЕЙСТВИЯ С ФОРМОЙ
  // ============================================================================

  async clickCreate() {
    await this.createBtn.click()
    await this.page.waitForTimeout(500)
  }

  async clickClear() {
    await this.clearBtn.click()
    await this.page.waitForTimeout(300)
  }

  async createOrder(data: OrderFormData) {
    if (data.employee_name) {
      await this.selectEmployee(data.employee_name)
    }
    await this.selectOrderType(data.order_type)
    if (data.order_date) {
      await this.fillOrderDate(data.order_date)
    }
    if (data.order_number) {
      await this.fillOrderNumber(data.order_number)
    }
    if (data.extra_fields) {
      await this.fillExtraFields(data.extra_fields)
    }
    await this.clickCreate()
  }

  // ============================================================================
  // РАБОТА С ТАБЛИЦЕЙ
  // ============================================================================

  async getOrderCount(): Promise<number> {
    return this.rows.count()
  }

  async getOrderRow(number: string): Promise<Locator> {
    const row = this.rows.filter({ hasText: number })
    await expect(row.first()).toBeVisible({ timeout: 5000 })
    return row.first()
  }

  async getOrderTypeForRow(row: Locator): Promise<string> {
    const typeCell = row.locator('td').nth(1)
    const text = await typeCell.textContent()
    return text?.trim() || ''
  }

  async getEmployeeNameForRow(row: Locator): Promise<string> {
    const nameCell = row.locator('td').nth(2)
    const text = await nameCell.textContent()
    return text?.trim() || ''
  }

  async getOrderDateForRow(row: Locator): Promise<string> {
    const dateCell = row.locator('td').nth(3)
    const text = await dateCell.textContent()
    return text?.trim() || ''
  }

  // ============================================================================
  // ДЕЙСТВИЯ С ПРИКАЗАМИ
  // ============================================================================

  async viewOrder(number: string) {
    const row = await this.getOrderRow(number)
    await row.getByRole('button', { name: /просмотр|eye/i }).click()
  }

  async downloadOrder(number: string) {
    const row = await this.getOrderRow(number)
    const downloadPromise = this.page.waitForEvent('download')
    await row.getByRole('button', { name: /скачать|download/i }).click()
    return downloadPromise
  }

  async cancelOrder(number: string) {
    const row = await this.getOrderRow(number)
    await row.getByRole('button', { name: /отменить|cancel/i }).click()

    // Подтверждение
    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 3000 })
    await confirmDialog.getByRole('button', { name: /отменить|удалить/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  async deleteOrder(number: string) {
    const row = await this.getOrderRow(number)
    await row.getByRole('button', { name: /удалить|trash/i }).click()

    // Подтверждение
    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 3000 })
    await confirmDialog.getByRole('button', { name: /удалить/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ФИЛЬТРЫ
  // ============================================================================

  async filterByYear(year: number | 'all') {
    if (year === 'all') {
      await this.page.getByRole('button', { name: /все года/i }).click()
    } else {
      await this.page.getByRole('button', { name: String(year) }).click()
    }
    await this.page.waitForTimeout(500)
  }

  // ============================================================================
  // НАВИГАЦИЯ
  // ============================================================================

  async openAuditLog() {
    await this.auditLogBtn.click()
    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  }

  async openTemplatesPage() {
    const settingsBtn = this.page.getByRole('button', { name: /настройки/i })
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click()
    }
  }

  // ============================================================================
  // ПРОВЕРКИ
  // ============================================================================

  async expectOrderVisible(number: string) {
    await expect(this.getOrderRow(number)).toBeVisible({ timeout: 5000 })
  }

  async expectOrderNotVisible(number: string) {
    await expect(this.page.getByText(number)).not.toBeVisible({ timeout: 3000 })
  }

  async expectOrderCount(count: number) {
    await expect(this.rows).toHaveCount(count, { timeout: 5000 })
  }

  async expectOrderTypeForRow(row: Locator, expectedType: OrderType) {
    const actualType = await this.getOrderTypeForRow(row)
    expect(actualType).toContain(expectedType)
  }
}
