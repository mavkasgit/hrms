
import { Page, Locator, expect } from '@playwright/test'

/**
 * Page Object для вкладки подразделений на странице /structure.
 * Улучшенная версия: убраны `waitForTimeout` и `waitForLoadState('networkidle')`,
 * селекторы сделаны более надежными.
 */
export class DepartmentsPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly addDepartmentButton: Locator
  readonly positionsTab: Locator
  readonly tagsTab: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /структура/i, level: 1 })
    this.addDepartmentButton = page.getByRole('button', { name: /добавить подразделение/i })
    this.positionsTab = page.getByRole('tab', { name: /должности/i })
    this.tagsTab = page.getByRole('tab', { name: /теги/i })
  }

  /**
   * Переходит на страницу структуры и дожидается ее загрузки
   */
  async goto() {
    await this.page.goto('/structure')
    await expect(this.pageTitle).toBeVisible()
  }

  /**
   * Возвращает локатор для элемента подразделения в списке/дереве
   * @param name Имя подразделения
   */
  getDepartmentRow(name: string): Locator {
    // Этот селектор предполагает, что у каждого элемента списка есть роль 'listitem'
    // Это более надежно, чем искать по тексту по всей странице
    return this.page.getByRole('listitem').filter({ hasText: name })
  }

  /**
   * Открывает диалог создания подразделения
   */
  async openAddDepartmentDialog() {
    await this.addDepartmentButton.click()
    const dialog = this.page.getByRole('dialog', { name: /добавить подразделение/i })
    await expect(dialog).toBeVisible()
    return dialog
  }
  
  /**
  * Открывает диалог редактирования подразделения
  */
  async openEditDepartmentDialog(name: string) {
    await this.getDepartmentRow(name).click()
    const dialog = this.page.getByRole('dialog', { name: /редактировать подразделение/i })
    await expect(dialog).toBeVisible()
    return dialog
  }

  /**
   * Заполняет форму и создает новое подразделение
   * @param name Имя нового подразделения
   */
  async createDepartment(name: string) {
    const dialog = await this.openAddDepartmentDialog()
    await dialog.getByTestId('name-input').fill(name)
    await dialog.getByRole('button', { name: /создать/i }).click()
    await expect(dialog).not.toBeVisible()
    await expect(this.getDepartmentRow(name)).toBeVisible()
  }

  /**
   * Редактирует существующее подразделение
   * @param oldName Текущее имя подразделения
   * @param newName Новое имя подразделения
   */
  async editDepartmentName(oldName: string, newName: string) {
    const dialog = await this.openEditDepartmentDialog(oldName)
    
    await dialog.getByTestId('name-input').fill(newName)
    await dialog.getByRole('button', { name: /сохранить/i }).click()
    
    await expect(dialog).not.toBeVisible()
    await expect(this.getDepartmentRow(newName)).toBeVisible()
    await expect(this.getDepartmentRow(oldName)).not.toBeVisible()
  }

  /**
   * Удаляет подразделение
   * @param name Имя подразделения для удаления
   */
  async deleteDepartment(name: string) {
    const dialog = await this.openEditDepartmentDialog(name)
    await dialog.getByRole('button', { name: /удалить/i }).click()
    
    const confirmDialog = this.page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: /удалить/i }).click()
    
    await expect(confirmDialog).not.toBeVisible()
    await expect(dialog).not.toBeVisible()
    await expect(this.getDepartmentRow(name)).not.toBeVisible()
  }
}
