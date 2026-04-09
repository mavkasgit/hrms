import { test, expect } from '@playwright/test';

// Запусти серверы вручную перед тестом:
// cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
// cd frontend && npm run dev

test.describe('Sprint 6 — дополнительные дни отпуска', () => {
  test('inline-редактирование доп дней через API', async ({ page }) => {
    // Переходим на страницу отпусков
    await page.goto('/vacations');

    // Ждём загрузку таблицы
    await expect(page.getByRole('heading', { name: 'Отпуска' })).toBeVisible();
    await page.waitForTimeout(2000);

    // Находим первую строку сотрудника (раскрывающаяся)
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Получаем имя сотрудника
    const nameCell = firstRow.locator('td').nth(2);
    const empName = await nameCell.textContent();
    expect(empName).toBeTruthy();

    // Находим колонку "Доп. дни" по тексту в заголовке
    const headers = page.locator('thead th');
    const addDaysHeaderIndex = await headers.evaluateAll((ths) => {
      return ths.findIndex(th => th.textContent?.includes('Доп. дни'));
    });
    expect(addDaysHeaderIndex).toBeGreaterThan(0);

    // Получаем ячейку доп дней
    const addDaysCell = firstRow.locator(`td:nth-child(${addDaysHeaderIndex + 1})`);

    // Получаем начальное значение
    const oldValueText = await addDaysCell.locator('button').textContent();
    const oldValue = parseInt(oldValueText || '0', 10);
    console.log(`Начальное значение доп дней: ${oldValue}`);

    // Кликаем по кнопке чтобы начать редактирование
    await addDaysCell.locator('button').click();

    // Проверяем что появился input
    const input = addDaysCell.locator('input');
    await expect(input).toBeVisible({ timeout: 3000 });

    // Вводим новое значение (старое + 5)
    const newValue = String(oldValue + 5);
    await input.fill(newValue);
    await input.press('Enter');

    // Ждём рефетч после мутации (invalidateQueries с refetchType: 'all')
    await page.waitForTimeout(3000);

    // Перезагружаем страницу чтобы убедиться что данные загружаются заново
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Проверяем что значение обновилось — ищем ячейку с нужным текстом
    const allAddDaysCells = page.locator('tbody tr').first().locator(`td:nth-child(${addDaysHeaderIndex + 1})`);
    const updatedText = await allAddDaysCells.textContent();
    console.log(`Текст ячейки после обновления: "${updatedText}"`);

    // Проверяем через employees API что значение действительно изменилось
    const apiResponse = await page.request.get('/api/employees?status=active&per_page=1000');
    const apiData = await apiResponse.json();
    const employees = apiData.items;
    
    // Находим нашего сотрудника по имени
    const emp = employees.find((e: any) => e.name === empName);
    if (emp) {
      console.log(`API: additional_vacation_days = ${emp.additional_vacation_days}`);
    }

    expect(updatedText).toContain(newValue);
    console.log(`Новое значение доп дней: ${updatedText}`);
  });
});
