import { test, expect } from '@playwright/test'

test.describe('Удаление сотрудника (soft delete)', () => {
  test.setTimeout(60000)

  test('мягкое удаление активного сотрудника', async ({ page }) => {
    await page.goto('/employees')
    await page.waitForLoadState('networkidle')

    // Берём первого активного сотрудника из таблицы
    const firstEmployeeRow = page.locator('tbody tr').first()
    await expect(firstEmployeeRow).toBeVisible({ timeout: 10000 })

    // Запоминаем имя сотрудника (ячейка ФИО - вторая колонка, индекс 1)
    const nameCell = firstEmployeeRow.locator('td').nth(1)
    const empName = await nameCell.innerText()
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
    await page.reload()
    await page.waitForLoadState('networkidle')

    // 3. Проверяем что сотрудник исчез из active списка
    const activeTable = page.locator('table tbody')
    await expect(activeTable.getByText(empName)).not.toBeVisible({ timeout: 5000 })
    console.log('[TEST] Сотрудник исчез из active списка')

    // 4. Переключаемся на "Удалённые"
    console.log('[TEST] Открываем фильтр...')
    await page.getByRole('button', { name: 'Фильтры' }).click()
    console.log('[TEST] Выбираем "Удалённые"...')
    await page.getByText('Удалённые').click()
    console.log('[TEST] Фильтр "Удалённые" применён')
    await page.waitForTimeout(1000)

    // 5. Проверяем что сотрудник появился в удалённых
    const deletedTable = page.locator('table tbody')
    await expect(deletedTable.getByText(empName)).toBeVisible({ timeout: 5000 })
    console.log('[TEST] Сотрудник найден в удалённых')

    console.log(`[TEST] ✅ Сотрудник "${empName}" успешно удалён (soft delete)`)
  })
})
