import { test, expect } from '@playwright/test'
import { VacationsPage } from './pages/VacationsPage'

/**
 * Тест inline-редактирования дополнительных дней отпуска
 * Использует VacationsPage Page Object и правильные стратегии ожидания
 */
test.describe('Sprint 6 — дополнительные дни отпуска', () => {
  test('inline-редактирование доп дней через API', async ({ page }) => {
    const vacationsPage = new VacationsPage(page)
    await vacationsPage.goto()

    // Находим первую строку сотрудника
    const firstRow = await vacationsPage.getFirstRow()
    await expect(firstRow).toBeVisible()

    // Получаем имя сотрудника
    const empName = await vacationsPage.getEmployeeNameByRow(firstRow)
    expect(empName).toBeTruthy()
    console.log(`[TEST] Сотрудник: ${empName}`)

    // Получаем индекс колонки "Доп. дни"
    const addDaysHeaderIndex = await vacationsPage.getAddDaysColumnIndex()
    expect(addDaysHeaderIndex).toBeGreaterThan(0)

    // Получаем ячейку доп дней
    const addDaysCell = await vacationsPage.getAddDaysCellForRow(firstRow, addDaysHeaderIndex)

    // Получаем начальное значение
    const oldValueText = await addDaysCell.locator('button').textContent()
    const oldValue = parseInt(oldValueText || '0', 10)
    console.log(`[TEST] Начальное значение доп дней: ${oldValue}`)

    // Отслеживаем ответ API для подтверждения обновления
    const responsePromise = page.waitForResponse(async (resp) => {
      return resp.url().includes('/api/employees') &&
             resp.request().method() === 'PUT' &&
             resp.status() === 200
    })

    // Редактируем значение (старое + 5)
    const newValue = oldValue + 5
    await vacationsPage.editAddDays(addDaysCell, newValue)

    // Ждём завершения API запроса
    await responsePromise
    console.log(`[TEST] API ответ получен`)

    // Перезагружаем страницу для получения актуальных данных
    await page.reload({ waitUntil: 'networkidle' })

    // Проверяем через employees API что значение действительно изменилось
    const apiResponse = await page.request.get('/api/employees?status=active&per_page=1000')
    const apiData = await apiResponse.json()
    const employees = apiData.items

    // Находим нашего сотрудника по имени
    const emp = employees.find((e: any) => e.name === empName)
    if (emp) {
      console.log(`[TEST] API: additional_vacation_days = ${emp.additional_vacation_days}`)
      expect(emp.additional_vacation_days).toBe(newValue)
    }

    // Проверяем что значение обновилось в UI
    const updatedPage = new VacationsPage(page)
    await updatedPage.goto()

    const updatedRow = await updatedPage.getFirstRow()
    const updatedCell = await updatedPage.getAddDaysCellForRow(updatedRow, addDaysHeaderIndex)
    const updatedText = await updatedCell.textContent()
    console.log(`[TEST] Текст ячейки после обновления: "${updatedText}"`)

    expect(updatedText).toContain(String(newValue))
    console.log(`[TEST] ✅ Значение доп дней успешно обновлено до: ${newValue}`)
  })
})
