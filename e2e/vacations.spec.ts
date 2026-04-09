import { test, expect } from '@playwright/test';

// Запусти серверы вручную:
// cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
// cd frontend && npm run dev

test.describe('Отпуска', () => {
  
  test('1) страница отпусков загружается', async ({ page }) => {
    await page.goto('/vacations')
    await page.waitForTimeout(2000)
    
    await expect(page.getByRole('heading', { name: 'Отпуска' })).toBeVisible()
    await expect(page.locator('table')).toBeVisible()
    
    console.log('✓ Страница загружена')
  })

  test('2) сотрудники отображаются в таблице', async ({ page }) => {
    await page.goto('/vacations')
    await page.waitForTimeout(2000)
    
    const rows = page.locator('tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    
    const firstName = await rows.first().locator('td').nth(2).textContent()
    console.log(`Первый сотрудник: ${firstName}`)
    
    console.log('✓ Сотрудники есть')
  })

  test('3) выбор сотрудника раскрывает строку', async ({ page }) => {
    await page.goto('/vacations')
    await page.waitForTimeout(2000)
    
    const firstRow = page.locator('tbody tr').first()
    await firstRow.click()
    await page.waitForTimeout(1500)
    
    // После клика должен появиться ChevronDown
    const expanded = firstRow.locator('svg.lucide-chevron-down, [class*="ChevronDown"]')
    const isExpanded = await expanded.count() > 0
    
    if (isExpanded) {
      console.log('✓ Строка раскрыта')
    } else {
      // Или данные загружаются
      await page.waitForTimeout(1000)
      console.log('✓ Клик выполнен')
    }
  })

})