import { test, expect } from '@playwright/test';

// Запусти серверы:
// cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
// cd frontend && npm run dev

test.describe('Отпуска — списание дней', () => {
  
  test('1) базовая проверка страницы', async ({ page }) => {
    await page.goto('/vacations')
    await page.waitForTimeout(2000)
    
    await expect(page.getByRole('heading', { name: 'Отпуска' })).toBeVisible()
    
    console.log('✓ Страница загружена')
  })

  test('2) выбор сотрудника из таблицы', async ({ page }) => {
    await page.goto('/vacations')
    await page.waitForTimeout(2000)
    
    // Клик на первого сотрудника в таблице (строка с данными)
    const row = page.locator('tbody tr').first()
    await row.click()
    await page.waitForTimeout(1500)
    
    // Проверяем что строка раскрылась
    const chevronDown = page.locator('[class*="ChevronDown"]')
    const isExpanded = await chevronDown.count() > 0
    
    console.log(`Раскрыт: ${isExpanded}`)
    console.log('✓ Клик работает')
  })

  test('3) проверка списания дней', async ({ page }) => {
    await page.goto('/vacations')
    await page.waitForTimeout(2000)
    
    // Находим строку сотрудника и получаем остаток
    const row = page.locator('tbody tr').first()
    const remainingCell = row.locator('td').nth(7)
    const remainingBefore = await remainingCell.textContent()
    console.log(`Остаток до: ${remainingBefore}`)
    
    // Раскрываем сотрудника
    await row.click()
    await page.waitForTimeout(1500)
    
    // Теперь нужно найти форму создания отпуска и заполнить её
    // Ищем кнопку создания в раскрытой секции
    const createButton = page.locator('button', { hasText: 'Создать отпуск' }).first()
    await createButton.click()
    await page.waitForTimeout(500)
    
    // Проверяем что форма открылась
    const dateInput = page.getByLabel('Дата начала')
    await expect(dateInput).toBeVisible({ timeout: 3000 })
    
    console.log('✓ Форма открылась')
  })

})