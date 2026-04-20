import { test, expect } from './fixtures'

/**
 * Тест inline-редактирования дополнительных дней отпуска
 * Создаёт тестового сотрудника и редактирует его доп. дни
 */
test.describe('Sprint 6 — дополнительные дни отпуска', () => {
  test('inline-редактирование доп дней через API', async ({ page, request, apiOps }) => {
    const u = apiOps.uid()
    
    // Создаём тестового сотрудника
    const dept = await apiOps.createDepartment(`ДопДни-Отдел-${u}`)
    const pos = await apiOps.createPosition(`ДопДни-Должность-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: `ДопДни-Сотрудник-${u}`,
      additional_vacation_days: 3,
    })
    
    console.log(`[TEST] Создан сотрудник: "${emp.name}" (id=${emp.id}, доп.дни=3)`)

    // Переходим на страницу отпусков
    await page.goto('/vacations')
    await page.waitForLoadState('networkidle')
    
    // Ждём загрузки таблицы
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 10000 })    
    // Находим нашего сотрудника в таблице
    const employeeRow = page.locator('tbody tr').filter({ hasText: emp.name })
    await expect(employeeRow).toBeVisible({ timeout: 5000 })
    
    console.log(`[TEST] Сотрудник найден в таблице: ${emp.name}`)

    // Находим колонку "Доп. дни" по заголовку
    const headers = page.locator('thead th')
    const headerCount = await headers.count()
    let addDaysColumnIndex = -1
    
    for (let i = 0; i < headerCount; i++) {
      const headerText = await headers.nth(i).textContent()
      if (headerText?.includes('Доп') || headerText?.includes('доп')) {
        addDaysColumnIndex = i
        break
      }
    }
    
    expect(addDaysColumnIndex).toBeGreaterThan(-1)
    console.log(`[TEST] Колонка "Доп. дни" найдена: индекс ${addDaysColumnIndex}`)

    // Получаем ячейку доп дней
    const addDaysCell = employeeRow.locator('td').nth(addDaysColumnIndex)
    await expect(addDaysCell).toBeVisible()

    // Получаем начальное значение (должно быть 3)
    const oldValueText = await addDaysCell.locator('button').textContent()
    const oldValue = parseInt(oldValueText || '0', 10)
    console.log(`[TEST] Начальное значение доп дней: ${oldValue}`)
    expect(oldValue).toBe(3)

    // Отслеживаем ответ API для подтверждения обновления
    const responsePromise = page.waitForResponse(async (resp) => {
      return resp.url().includes('/api/employees') &&
             resp.request().method() === 'PUT' &&
             resp.status() === 200
    })

    // Редактируем значение (3 + 5 = 8)
    const newValue = oldValue + 5
    
    // Кликаем на кнопку редактирования
    await addDaysCell.locator('button').click()
    
    // Находим input и вводим новое значение
    const input = addDaysCell.locator('input')
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill(String(newValue))
    await input.press('Enter')
    
    console.log(`[TEST] Введено новое значение: ${newValue}`)

    // Ждём завершения API запроса
    await responsePromise
    console.log(`[TEST] API ответ получен`)

    // Проверяем через API что значение действительно изменилось
    const apiResponse = await request.get(`/api/employees/${emp.id}`)
    const updatedEmp = await apiResponse.json()
    
    console.log(`[TEST] API: additional_vacation_days = ${updatedEmp.additional_vacation_days}`)
    expect(updatedEmp.additional_vacation_days).toBe(newValue)

    // Проверяем что значение обновилось в UI (с ожиданием)
    await expect(addDaysCell).toHaveText(String(newValue), { timeout: 5000 })
    console.log(`[TEST] ✅ Значение доп дней успешно обновлено: ${oldValue} → ${newValue}`)
  })
})
