import { test, expect } from '@playwright/test'
import { EmployeesPage } from './pages/EmployeesPage'

/**
 * Тест архивации сотрудника
 * Использует EmployeesPage Page Object
 */
test.describe('Архивация сотрудника', () => {
  test.setTimeout(60000)

  test('архивация активного сотрудника', async ({ page }) => {
    const employeesPage = new EmployeesPage(page)
    await employeesPage.goto()

    // Берём первого активного сотрудника из таблицы
    const firstRow = employeesPage.rows.first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Запоминаем имя сотрудника
    const empName = await employeesPage.getEmployeeNameByRow(firstRow)
    console.log(`[TEST] Архивируем сотрудника: "${empName}"`)

    // 1. Архивируем через Page Object
    await employeesPage.archiveEmployee(empName)

    // 2. Проверяем что сотрудник исчез из active списка
    await employeesPage.expectEmployeeNotInTable(empName)

    // 3. Переключаемся на "В архиве"
    await employeesPage.filterByStatus('archived')
    await page.waitForTimeout(500)

    // 4. Проверяем что сотрудник появился в архиве
    await employeesPage.expectEmployeeInTable(empName)

    // 5. Открываем и проверяем бейдж "В архиве"
    await employeesPage.openEmployee(empName)
    const archivedDialog = page.getByRole('dialog')
    await expect(archivedDialog.getByText(/в архиве/i)).toBeVisible()
    console.log('[TEST] Бейдж "В архиве" подтверждён')

    console.log(`[TEST] ✅ Сотрудник "${empName}" успешно архивирован`)

    await page.keyboard.press('Escape')
  })
})
