import { Page, Locator, expect } from '@playwright/test'
import type { DepartmentFormData } from '../types'

/**
 * Page Object для вкладки подразделений на странице /structure
 * Инкапсулирует все взаимодействия с UI подразделений
 */
export class DepartmentsPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly tabs: Locator
  readonly addBtn: Locator
  readonly searchInput: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /структура/i, level: 1 })
    this.tabs = page.getByRole('tablist')
    this.addBtn = page.getByRole('button', { name: /подразделение/i })
    this.searchInput = page.getByPlaceholder(/поиск по сотрудникам/i)
  }

  async goto() {
    await this.page.goto('/structure')
    await this.page.waitForLoadState('networkidle')
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 })
    await this.switchToDepartmentsTab()
  }

  // ============================================================================
  // ВКЛАДКИ
  // ============================================================================

  async switchToDepartmentsTab() {
    await this.tabs.getByRole('tab', { name: /подразделения/i }).click()
    await this.page.waitForTimeout(300)
  }

  async switchToPositionsTab() {
    await this.tabs.getByRole('tab', { name: /должности/i }).click()
    await this.page.waitForTimeout(300)
  }

  // ============================================================================
  // ПОИСК
  // ============================================================================

  async searchEmployee(query: string) {
    await this.searchInput.fill(query)
    await this.page.waitForTimeout(300)
  }

  async clearSearch() {
    await this.searchInput.clear()
    await this.page.waitForTimeout(300)
  }

  async expandAll() {
    await this.page.getByRole('button', { name: /раскрыть/i }).click()
    await this.page.waitForTimeout(500)
  }

  async collapseAll() {
    await this.page.getByRole('button', { name: /скрыть/i }).click()
    await this.page.waitForTimeout(300)
  }

  // ============================================================================
  // ДЕРЕВО ПОДРАЗДЕЛЕНИЙ
  // ============================================================================

  async getDepartmentNode(name: string): Promise<Locator> {
    // Ищем узел дерева по имени
    return this.page.locator('button, div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  }

  async expandDepartment(name: string) {
    const node = await this.getDepartmentNode(name)
    const expandBtn = node.locator('button').first()
    if (await expandBtn.count() > 0) {
      await expandBtn.click()
      await this.page.waitForTimeout(300)
    }
  }

  async collapseDepartment(name: string) {
    const node = await this.getDepartmentNode(name)
    const collapseBtn = node.locator('button').first()
    if (await collapseBtn.count() > 0) {
      await collapseBtn.click()
      await this.page.waitForTimeout(300)
    }
  }

  async getEmployeeCountForDepartment(name: string): Promise<number> {
    const node = await this.getDepartmentNode(name)
    const countBadge = node.locator('[class*="badge"], [class*="count"]').first()
    const text = await countBadge.textContent()
    return text ? parseInt(text.trim(), 10) : 0
  }

  // ============================================================================
  // СОЗДАНИЕ/РЕДАКТИРОВАНИЕ
  // ============================================================================

  async clickAdd() {
    await this.addBtn.click()
    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  }

  async fillDepartmentForm(data: DepartmentFormData) {
    const dialog = this.page.getByRole('dialog')

    // Название
    const nameInput = dialog.getByLabel(/название/i)
    await nameInput.fill(data.name)

    // Краткое
    if (data.short_name) {
      const shortNameInput = dialog.getByLabel(/краткое/i)
      await shortNameInput.fill(data.short_name)
    }

    // Приоритет/сортировка
    if (data.sort_order !== undefined) {
      const priorityInput = dialog.getByLabel(/приоритет|сортировка/i)
      await priorityInput.fill(String(data.sort_order))
    }

    // Иконка и цвет (если есть виджет)
    if (data.icon) {
      const iconBtn = dialog.getByRole('button', { name: /иконка/i })
      if (await iconBtn.isVisible()) {
        await iconBtn.click()
        await this.page.getByRole('option', { name: data.icon }).click()
      }
    }
    if (data.color) {
      const colorBtn = dialog.locator('[class*="color"], [class*="Color"]').first()
      if (await colorBtn.isVisible()) {
        await colorBtn.click()
        await this.page.locator(`[data-color="${data.color}"]`).click()
      }
    }
  }

  async submitForm() {
    const dialog = this.page.getByRole('dialog')
    const submitBtn = dialog.getByRole('button', { name: /создать|сохранить/i })
    await submitBtn.click()
    await this.page.waitForTimeout(500)
  }

  async closeForm() {
    await this.page.keyboard.press('Escape')
    await expect(this.page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  }

  async createDepartment(data: DepartmentFormData) {
    await this.clickAdd()
    await this.fillDepartmentForm(data)
    await this.submitForm()
    await this.page.waitForTimeout(500)
    await expect(this.getDepartmentNode(data.name)).toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ДЕЙСТВИЯ С ПОДРАЗДЕЛЕНИЯМИ
  // ============================================================================

  async editDepartment(name: string, data: DepartmentFormData) {
    const node = await this.getDepartmentNode(name)
    // Hover чтобы показать кнопки действий
    await node.hover()
    const editBtn = node.getByRole('button', { name: /редактировать/i })
    await expect(editBtn).toBeVisible({ timeout: 3000 })
    await editBtn.click()

    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    await this.fillDepartmentForm(data)
    await this.submitForm()
    await this.page.waitForTimeout(500)
  }

  async deleteDepartment(name: string) {
    const node = await this.getDepartmentNode(name)
    await node.hover()
    const deleteBtn = node.getByRole('button', { name: /удалить/i })
    await expect(deleteBtn).toBeVisible({ timeout: 3000 })
    await deleteBtn.click()

    // Подтверждение
    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible({ timeout: 3000 })
    await confirmDialog.getByRole('button', { name: /удалить/i }).click()
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ТЕГИ
  // ============================================================================

  async addTagToDepartment(deptName: string, tagName: string) {
    const node = await this.getDepartmentNode(deptName)
    const addTagBtn = node.getByRole('button', { name: /добавить.*тег/i })
    if (await addTagBtn.isVisible()) {
      await addTagBtn.click()
      await this.page.getByRole('option', { name: tagName }).click()
      await this.page.waitForTimeout(300)
    }
  }

  async removeTagFromDepartment(deptName: string, tagName: string) {
    const node = await this.getDepartmentNode(deptName)
    const tagX = node.locator('button').filter({ hasText: tagName }).locator('button').first()
    if (await tagX.count() > 0) {
      await tagX.click()
      await this.page.waitForTimeout(300)
    }
  }

  // ============================================================================
  // ПРОВЕРКИ
  // ============================================================================

  async expectDepartmentVisible(name: string) {
    await expect(this.getDepartmentNode(name)).toBeVisible({ timeout: 5000 })
  }

  async expectDepartmentNotVisible(name: string) {
    await expect(this.getDepartmentNode(name)).not.toBeVisible({ timeout: 3000 })
  }
}
