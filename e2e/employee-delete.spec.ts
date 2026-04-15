import { test, expect } from '@playwright/test'
import { EmployeesPage } from './pages/EmployeesPage'

/**
 * Тест мягкого удаления сотрудника
 * Использует EmployeesPage Page Object
 */
test.describe('Удаление сотрудника (soft delete)', () => {
  test.setTimeout(60000)

  test('мягкое удаление активного сотрудника', async ({ page }) => {
    const employeesPage = new EmployeesPage(page)
    await employeesPage.goto()

    // Берём первого активного сотрудника из таблицы
    const firstRow = employeesPage.rows.first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Запоминаем имя сотрудника
    const empName = await employeesPage.getEmployeeNameByRow(firstRow)
    console.log(`[TEST] Мягко удаляем сотрудника: "${empName}"`)

    // Получаем ID сотрудника через API
    const searchResp = await page.request.get(`/api/employees`, {
      params: { q: empName, page: 1, per_page: 1 }
    })
    const searchData = await searchResp.json()
    const employeeId = searchData.items[0]?.id
    console.log(`[TEST] Employee ID: ${employeeId}`)
    expect(employeeId).toBeTruthy()

    // 1. Выполняем soft delete через API
    console.log('[TEST] Выполняем soft delete...')
    const deleteResp = await page.request.delete(`/api/employees/${employeeId}`, {
      params: { hard: false }
    })
    console.log(`[TEST] Soft delete status: ${deleteResp.status()}`)
    expect(deleteResp.status()).toBe(204)

    // 2. Обновляем страницу чтобы увидеть изменения
    await employeesPage.goto()

    // 3. Проверяем что сотрудник исчез из active списка
    await employeesPage.expectEmployeeNotInTable(empName)
    console.log('[TEST] Сотрудник исчез из active списка')

    // 4. Переключаемся на "Удалённые"
    await employeesPage.filterByStatus('deleted')
    await page.waitForTimeout(1000)

    // 5. Проверяем что сотрудник появился в удалённых
    await employeesPage.expectEmployeeInTable(empName)
    console.log('[TEST] Сотрудник найден в удалённых')

    console.log(`[TEST] ✅ Сотрудник "${empName}" успешно удалён (soft delete)`)
  })
})
