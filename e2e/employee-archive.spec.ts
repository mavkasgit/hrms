import { test, expect } from './fixtures'

/**
 * Тест архивации сотрудника
 * Создаёт тестового сотрудника и архивирует его
 */
test.describe('Архивация сотрудника', () => {
  test.setTimeout(60000)

  test('архивация активного сотрудника', async ({ page, request, apiOps }) => {
    const u = apiOps.uid()
    
    // Создаём тестового сотрудника
    const dept = await apiOps.createDepartment(`Архив-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Архив-Должность-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: `Архив-Сотрудник-${u}`,
    })
    
    console.log(`[TEST] Создан сотрудник для архивации: "${emp.name}" (id=${emp.id})`)

    // Переходим на страницу сотрудников
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')
    
    // Ждём загрузки таблицы
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 10000 })    
    // Находим нашего сотрудника в таблице
    const employeeRow = page.locator('tbody tr').filter({ hasText: emp.name })
    await expect(employeeRow).toBeVisible({ timeout: 5000 })
    
    console.log(`[TEST] Архивируем сотрудника: "${emp.name}"`)

    // 1. Кликаем на строку чтобы открыть форму
    await employeeRow.click()
    
    // Ждём открытия диалога
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    
    // 2. Кликаем кнопку "Уволить" / "Архивировать"
    const archiveButton = dialog.getByRole('button', { name: /уволить|архивировать/i })
    await archiveButton.click()
    
    // 3. Подтверждаем в диалоге подтверждения
    const confirmDialog = page.locator('[role="alertdialog"]').or(page.getByRole('dialog').last())
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    const confirmButton = confirmDialog.getByRole('button', { name: /уволить|архивировать|подтвердить|да/i })
    await confirmButton.click()
    await page.waitForLoadState('networkidle')

    // 4. Проверяем что сотрудник исчез из active списка
    await expect(employeeRow).not.toBeVisible({ timeout: 5000 })
    console.log('[TEST] Сотрудник исчез из активных')

    // 5. Проверяем через API что сотрудник действительно архивирован
    const apiResponse = await request.get(`/api/employees/${emp.id}`)
    const archivedEmp = await apiResponse.json()
    
    expect(archivedEmp.is_archived).toBe(true)
    expect(archivedEmp.terminated_date).toBeTruthy()
    console.log(`[TEST] API подтверждает: is_archived=true, terminated_date=${archivedEmp.terminated_date}`)

    console.log(`[TEST] ✅ Сотрудник "${emp.name}" успешно архивирован`)
  })
})
