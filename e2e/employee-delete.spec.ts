import { test, expect } from './fixtures/employees-fixtures'
import { EmployeesPage } from './pages/EmployeesPage'

/**
 * Тест мягкого удаления сотрудника
 * Использует EmployeesPage Page Object
 */
test.describe('Удаление сотрудника (soft delete)', () => {
  test.setTimeout(60000)

  test('мягкое удаление активного сотрудника', async ({ page, employeesApi }) => {
    // 1. Создаём нового сотрудника специально для этого теста
    const employee = await employeesApi.createEmployee()
    const empName = employee.name
    const employeeId = employee.id
    console.log(`[TEST] Создан тестовый сотрудник: "${empName}" (id=${employeeId})`)

    const employeesPage = new EmployeesPage(page)
    await employeesPage.goto()

    // 2. Проверяем что сотрудник виден в active списке
    await employeesPage.expectEmployeeInTable(empName)
    console.log(`[TEST] Сотрудник "${empName}" виден в списке активных`)

    // 3. Выполняем soft delete через API
    console.log('[TEST] Выполняем soft delete...')
    const deleteResp = await page.request.delete(`/api/employees/${employeeId}`, {
      params: { hard: false }
    })
    console.log(`[TEST] Soft delete status: ${deleteResp.status()}`)
    expect(deleteResp.status()).toBe(204)

    // 4. Обновляем страницу чтобы увидеть изменения
    await employeesPage.goto()

    // 5. Проверяем что сотрудник исчез из active списка
    await employeesPage.expectEmployeeNotInTable(empName)
    console.log('[TEST] Сотрудник исчез из active списка')

    console.log(`[TEST] ✅ Сотрудник "${empName}" успешно удалён (soft delete)`)

    // Очистка: hard delete для чистоты
    await employeesApi.deleteEmployee(employeeId).catch(() => {})
  })
})
