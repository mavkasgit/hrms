import { test, expect } from './fixtures/common-fixtures'

/**
 * Тест заполнения плана отпусков с дробными значениями
 * Использует фикстуры с автоматической очисткой
 */
test.describe('План отпусков - дробные значения', () => {
  test.setTimeout(180000)

  test('запись дробного значения и значения меньше 1', async ({ page, request, apiOps }) => {
    const u = apiOps.uid()
    const testYear = new Date().getFullYear()

    // ========== 0. СОЗДАЁМ СОТРУДНИКА ==========
    console.log('[TEST] === ЭТАП 0: Создание сотрудника ===')
    
    const dept = await apiOps.createDepartment(`Отпуск-Отдел-${u}`)
    const pos = await apiOps.createPosition(`Отпуск-Должность-${u}`)
    const emp = await apiOps.createEmployee(dept.id, pos.id, {
      name: `Тест-Сотрудник-${u}`,
    })
    const empId = emp.id
    console.log(`[TEST] ✅ Сотрудник создан (id=${empId})`)

    // ========== 1. ПЕРЕХОДИМ НА СТРАНИЦУ КАЛЕНДАРЯ ОТПУСКОВ ==========
    console.log('[TEST] === ЭТАП 1: Переход на страницу календаря ===')
    
    await page.goto('/vacation-calendar')
    await expect(page.getByRole('heading', { name: /календарь/i })).toBeVisible({ timeout: 15000 })
    
    // Выбираем год
    const yearTrigger = page.locator('[role="combobox"]').first()
    await yearTrigger.click()
    await page.waitForTimeout(300)
    const yearOption = page.getByRole('option', { name: String(testYear) })
    await yearOption.click()
    console.log(`[TEST] Год выбран: ${testYear}`)
    
    // Ждём загрузки таблицы
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 15000 })
    
    // Ищем сотрудника в таблице
    const employeeRow = page.locator('tbody tr').filter({ hasText: emp.name }).first()
    await expect(employeeRow).toBeVisible({ timeout: 10000 })
    console.log(`[TEST] Найден сотрудник в таблице`)
    
    // ========== 2. ЯНВАРЬ - дробное 0.5 ==========
    console.log('[TEST] === ЭТАП 2: Записываем 0.5 в Январь ===')
    const cellJan = employeeRow.locator('td').nth(2)
    await cellJan.click()
    
    const inputJan = cellJan.locator('input').first()
    await expect(inputJan).toBeVisible({ timeout: 5000 })
    await inputJan.fill('0.5')
    await inputJan.press('Enter')
    
    await expect(inputJan).not.toBeVisible({ timeout: 5000 })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    const cellValueJan = await cellJan.textContent()
    console.log(`[TEST] Январь: "${cellValueJan}"`)
    expect(cellValueJan).toContain('0.5')

    // ========== 3. ФЕВРАЛЬ - значение 0.33 ==========
    console.log('[TEST] === ЭТАП 3: Записываем 0.33 в Февраль ===')
    const cellFeb = employeeRow.locator('td').nth(3)
    await cellFeb.click()
    
    const inputFeb = cellFeb.locator('input').first()
    await expect(inputFeb).toBeVisible({ timeout: 5000 })
    await inputFeb.fill('0.33')
    await inputFeb.press('Enter')
    
    await expect(inputFeb).not.toBeVisible({ timeout: 5000 })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    const cellValueFeb = await cellFeb.textContent()
    console.log(`[TEST] Февраль: "${cellValueFeb}"`)
    expect(cellValueFeb).toContain('0.33')

    // ========== 4. МАРТ - дробь 1/3 ==========
    console.log('[TEST] === ЭТАП 4: Записываем 1/3 в Март ===')
    const cellMar = employeeRow.locator('td').nth(4)
    await cellMar.click()
    
    const inputMar = cellMar.locator('input').first()
    await expect(inputMar).toBeVisible({ timeout: 5000 })
    await inputMar.fill('1/3')
    await inputMar.press('Enter')
    
    await expect(inputMar).not.toBeVisible({ timeout: 5000 })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    const cellValueMar = await cellMar.textContent()
    console.log(`[TEST] Март: "${cellValueMar}"`)
    expect(cellValueMar).toContain('1/3')

    // ========== 5. ОЧИСТКА ЯЧЕЙКИ (Del) ==========
    console.log('[TEST] === ЭТАП 5: Очищаем ячейку January (Del) ===')
    const cellToClear = employeeRow.locator('td').nth(2) // Январь
    await cellToClear.click()
    
    const inputClear = cellToClear.locator('input').first()
    await expect(inputClear).toBeVisible({ timeout: 5000 })
    
    // Очищаем значение - выделяем весь текст и удаляем
    await inputClear.clear()
    await inputClear.press('Enter')
    
    await expect(inputClear).not.toBeVisible({ timeout: 5000 })
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)
    
    // Проверяем что ячейка пустая или содержит прочерк
    const clearedValue = await cellToClear.textContent()
    console.log(`[TEST] Очищенная ячейка: "${clearedValue}"`)
    expect(clearedValue).toMatch(/^[\s—]*$/)

    console.log('✓ Все тесты пройдены!')
  })
})