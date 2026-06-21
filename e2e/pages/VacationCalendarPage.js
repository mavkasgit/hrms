/**
 * Page Object для страницы календаря отпусков /vacation-calendar
 */
export class VacationCalendarPage {
    page;
    pageTitle;
    yearSelect;
    table;
    tableRows;
    searchInput;
    constructor(page) {
        this.page = page;
        this.pageTitle = page.getByRole('heading', { name: /календарь/i });
        this.yearSelect = page.locator('select').first();
        this.table = page.locator('table');
        this.tableRows = this.table.locator('tbody tr');
        this.searchInput = page.getByPlaceholder(/поиск/i);
    }
    async goto() {
        await this.page.goto('/vacation-calendar');
        await this.pageTitle.waitFor({ state: 'visible', timeout: 10000 });
    }
    async selectYear(year) {
        await this.yearSelect.selectOption(String(year));
    }
    async getRowCount() {
        return await this.tableRows.count();
    }
    async getCellValue(employeeId, month) {
        const row = this.tableRows.filter({ has: this.page.locator(`[data-employee-id="${employeeId}"]`) }).first();
        if (!row)
            return null;
        const cell = row.locator('td').nth(month);
        return await cell.textContent();
    }
    async setVacationDays(employeeId, month, days) {
        const row = this.getEmployeeRow(employeeId);
        const cell = row.locator('td').nth(month + 2);
        await cell.click();
        // Wait for input to appear - use the data-testid
        const input = this.page.getByTestId(`vacation-cell-input-${employeeId}-${month}`);
        await input.waitFor({ state: 'visible', timeout: 5000 });
        await input.fill(String(days));
        await input.press('Enter');
        // Wait for input to disappear (saved)
        await input.waitFor({ state: 'hidden', timeout: 5000 });
        await this.page.waitForLoadState('networkidle');
    }
    async getCellInput(employeeId, month) {
        return this.page.getByTestId(`vacation-cell-input-${employeeId}-${month}`);
    }
    getEmployeeRow(employeeId) {
        return this.tableRows.filter({ hasText: new RegExp(`\\bemployee-${employeeId}\\b`) }).first();
    }
    getRowByName(name) {
        return this.tableRows.filter({ hasText: new RegExp(`^${name}\\b`) }).first();
    }
    async isCellEditable(employeeId, month) {
        const row = this.getEmployeeRow(employeeId);
        const cell = row.locator('td').nth(month + 2);
        await cell.click();
        const input = this.getCellInput(employeeId, month);
        return await input.isVisible();
    }
}
