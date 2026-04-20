import { Page, Locator, expect } from '@playwright/test'
import type { PositionFormData } from '../types'

/**
 * Page Object для вкладки должностей на странице /structure
 * Инкапсулирует все взаимодействия с UI должностей
 */
export class PositionsPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly tabs: Locator
  readonly addBtn: Locator
  readonly searchInput: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /структура/i, level: 1 })
    this.tabs = page.getByRole('tablist')
    this.addBtn = page.getByRole('button', { name: /должность/i })
    this.searchInput = page.getByPlaceholder(/поиск по сотрудникам/i)
  }

  async goto() {
    await this.page.goto('/structure')
    await this.page.waitForLoadState('networkidle')
    await expect(this.pageTitle).toBeVisible({ timeout: 10000 })
    await this.switchToPositionsTab()
  }

  private async waitForStructureRefresh(trigger: () => Promise<void>) {
    const refreshPromise = this.page
      .waitForResponse(
        (resp) => resp.url().includes('/api/structure') && resp.request().method() === 'GET',
        { timeout: 4000 }
      )
      .catch(() => null)

    await trigger()
    await refreshPromise
  }

  // ============================================================================
  // ВКЛАДКИ
  // ============================================================================

  async switchToPositionsTab() {
    const tab = this.tabs.getByRole('tab', { name: /должности/i })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
  }

  async switchToDepartmentsTab() {
    const tab = this.tabs.getByRole('tab', { name: /подразделения/i })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
  }

  // ============================================================================
  // ПОИСК
  // ============================================================================

  async searchEmployee(query: string) {
    await this.waitForStructureRefresh(async () => {
      await this.searchInput.fill(query)
    })
  }

  async clearSearch() {
    await this.waitForStructureRefresh(async () => {
      await this.searchInput.clear()
    })
  }

  async expandAll() {
    const button = this.page.getByRole('button', { name: /раскрыть/i })
    await button.click()
    await expect(this.page.getByRole('button', { name: /скрыть/i })).toBeVisible({ timeout: 5000 })
  }

  async collapseAll() {
    const button = this.page.getByRole('button', { name: /скрыть/i })
    await button.click()
    await expect(this.page.getByRole('button', { name: /раскрыть/i })).toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // СПИСОК ДОЛЖНОСТЕЙ
  // ============================================================================

  async getPositionNode(name: string): Promise<Locator> {
    return this.page.locator('button, div').filter({ hasText: new RegExp(`^${name}$`) }).first()
  }

  async expandPosition(name: string) {
    const node = await this.getPositionNode(name)
    const expandBtn = node.locator('button').first()
    if (await expandBtn.count() > 0) {
      await expandBtn.click()
      await expect(node.locator('[data-lucide="chevron-down"], svg.lucide-chevron-down')).toBeVisible({ timeout: 3000 })
    }
  }

  async collapsePosition(name: string) {
    const node = await this.getPositionNode(name)
    const collapseBtn = node.locator('button').first()
    if (await collapseBtn.count() > 0) {
      await collapseBtn.click()
      await expect(node.locator('[data-lucide="chevron-right"], svg.lucide-chevron-right')).toBeVisible({ timeout: 3000 })
    }
  }

  async getEmployeeCountForPosition(name: string): Promise<number> {
    const node = await this.getPositionNode(name)
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

  async fillPositionForm(data: PositionFormData) {
    const dialog = this.page.getByRole('dialog')

    // Название
    const nameInput = dialog.getByLabel(/название/i)
    await nameInput.fill(data.name)

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
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  }

  async closeForm() {
    await this.page.keyboard.press('Escape')
    await expect(this.page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  }

  async createPosition(data: PositionFormData) {
    await this.clickAdd()
    await this.fillPositionForm(data)
    await this.submitForm()
    await expect(this.getPositionNode(data.name)).toBeVisible({ timeout: 5000 })
  }

  // ============================================================================
  // ДЕЙСТВИЯ С ДОЛЖНОСТЯМИ
  // ============================================================================

  async editPosition(name: string, data: PositionFormData) {
    const node = await this.getPositionNode(name)
    await node.hover()
    const editBtn = node.getByRole('button', { name: /редактировать/i })
    await expect(editBtn).toBeVisible({ timeout: 3000 })
    await editBtn.click()

    await expect(this.page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    await this.fillPositionForm(data)
    await this.submitForm()
    await expect(this.getPositionNode(data.name)).toBeVisible({ timeout: 5000 })
  }

  async deletePosition(name: string) {
    const node = await this.getPositionNode(name)
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
  // ПРОВЕРКИ
  // ============================================================================

  async expectPositionVisible(name: string) {
    await expect(this.getPositionNode(name)).toBeVisible({ timeout: 5000 })
  }

  async expectPositionNotVisible(name: string) {
    await expect(this.getPositionNode(name)).not.toBeVisible({ timeout: 3000 })
  }
}
