import { test, expect } from '../fixtures';
import { VacationsPage } from '../pages/VacationsPage';

/**
 * Тесты базовой функциональности страницы отпусков
 * Используют Page Object Model для лучшей поддерживаемости
 */
test.describe('Отпуска - базовая функциональность', () => {
  let employeeName: string

  test.beforeEach(async ({ apiOps }) => {
    const employee = await apiOps.createEmployee({
      name: `E2E-VAC-${apiOps.uid()}`,
    })
    employeeName = employee.name
  })

  test('1) страница отпусков загружается', async ({ page }) => {
    const vacationsPage = new VacationsPage(page);
    await vacationsPage.goto();
    await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 5000 })

    console.log('✓ Страница загружена');
  });

  test('2) сотрудники отображаются в таблице', async ({ page }) => {
    const vacationsPage = new VacationsPage(page);
    await vacationsPage.goto();

    const employeeRow = await vacationsPage.getEmployeeRow(employeeName)
    const employeeNameFromRow = await vacationsPage.getEmployeeNameByRow(employeeRow)
    expect(employeeNameFromRow).toContain('E2E-VAC-')
    console.log(`Тестовый сотрудник: ${employeeNameFromRow}`);

    console.log('✓ Сотрудники есть');
  });

  test('3) выбор сотрудника раскрывает строку', async ({ page }) => {
    const vacationsPage = new VacationsPage(page);
    await vacationsPage.goto();

    const employeeRow = await vacationsPage.getEmployeeRow(employeeName)
    await employeeRow.click();

    // Ждём появления индикатора раскрытия (ChevronDown)
    const chevronDown = employeeRow.locator('svg.lucide-chevron-down, [class*="ChevronDown"], [data-lucide="chevron-down"]');
    await expect(chevronDown).toBeVisible({ timeout: 5000 });

    console.log('✓ Строка раскрыта');
  });

});
