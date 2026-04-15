import { test, expect } from '@playwright/test';
import { VacationsPage } from './pages/VacationsPage';

/**
 * Тесты базовой функциональности страницы отпусков
 * Используют Page Object Model для лучшей поддерживаемости
 */
test.describe('Отпуска - базовая функциональность', () => {

  test('1) страница отпусков загружается', async ({ page }) => {
    const vacationsPage = new VacationsPage(page);
    await vacationsPage.goto();

    console.log('✓ Страница загружена');
  });

  test('2) сотрудники отображаются в таблице', async ({ page }) => {
    const vacationsPage = new VacationsPage(page);
    await vacationsPage.goto();

    const count = await vacationsPage.getRowCount();
    expect(count).toBeGreaterThan(0);

    const firstRow = await vacationsPage.getFirstRow();
    const firstName = await vacationsPage.getEmployeeNameByRow(firstRow);
    console.log(`Первый сотрудник: ${firstName}`);

    console.log('✓ Сотрудники есть');
  });

  test('3) выбор сотрудника раскрывает строку', async ({ page }) => {
    const vacationsPage = new VacationsPage(page);
    await vacationsPage.goto();

    const firstRow = await vacationsPage.getFirstRow();
    await firstRow.click();

    // Ждём появления индикатора раскрытия (ChevronDown)
    const chevronDown = firstRow.locator('svg.lucide-chevron-down, [class*="ChevronDown"], [data-lucide="chevron-down"]');
    await expect(chevronDown).toBeVisible({ timeout: 5000 });

    console.log('✓ Строка раскрыта');
  });

});