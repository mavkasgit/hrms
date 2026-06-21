import { expect } from '@playwright/test';
/**
 * Page Object для страницы дашборда /
 */
export class DashboardPage {
    page;
    pageTitle;
    statsCards;
    birthdaysList;
    contractsList;
    departmentChart;
    constructor(page) {
        this.page = page;
        this.pageTitle = page.getByRole('heading', { name: /дашборд|панель управления/i, level: 1 });
        this.statsCards = page.locator('[class*="stat"], [class*="Stat"]');
        this.birthdaysList = page.locator('[class*="birthday"], [class*="Birthday"]');
        this.contractsList = page.locator('[class*="contract"], [class*="Contract"]');
        this.departmentChart = page.locator('[class*="department"], [class*="Department"]');
    }
    async goto() {
        await this.page.goto('/');
        await this.page.waitForLoadState('networkidle');
        await expect(this.pageTitle.or(this.page.locator('h1').first())).toBeVisible({ timeout: 10000 });
    }
    // ============================================================================
    // СТАТИСТИКА
    // ============================================================================
    async getTotalEmployees() {
        const card = this.statsCards.filter({ hasText: /всего сотрудников/i });
        const valueText = await card.locator('[class*="value"]').first().textContent();
        return valueText ? parseInt(valueText.trim(), 10) : 0;
    }
    async getMaleCount() {
        const card = this.statsCards.filter({ hasText: /мужчин/i });
        const valueText = await card.locator('[class*="value"]').first().textContent();
        return valueText ? parseInt(valueText.trim(), 10) : 0;
    }
    async getFemaleCount() {
        const card = this.statsCards.filter({ hasText: /женщин/i });
        const valueText = await card.locator('[class*="value"]').first().textContent();
        return valueText ? parseInt(valueText.trim(), 10) : 0;
    }
    async getAverageAge() {
        const card = this.statsCards.filter({ hasText: /средний возраст/i });
        const valueText = await card.locator('[class*="value"]').first().textContent();
        return valueText ? parseFloat(valueText.trim()) : 0;
    }
    async getAverageExperience() {
        const card = this.statsCards.filter({ hasText: /средний стаж/i });
        const valueText = await card.locator('[class*="value"]').first().textContent();
        return valueText ? parseFloat(valueText.trim()) : 0;
    }
    async getStats() {
        return {
            total_employees: await this.getTotalEmployees(),
            male_count: await this.getMaleCount(),
            female_count: await this.getFemaleCount(),
            average_age: await this.getAverageAge(),
            average_experience: await this.getAverageExperience(),
        };
    }
    // ============================================================================
    // ДНИ РОЖДЕНИЯ
    // ============================================================================
    async getBirthdaysList() {
        const items = this.birthdaysList.locator('li, tr, [class*="item"]');
        const count = await items.count();
        const birthdays = [];
        for (let i = 0; i < count; i++) {
            const item = items.nth(i);
            const text = await item.textContent();
            if (text) {
                // Парсим текст для получения данных
                const match = text.match(/(.+?)\s*—\s*(\d+)\s*лет\s*\((\d+)\s*дней\)/);
                if (match) {
                    birthdays.push({
                        employee_id: 0,
                        name: match[1].trim(),
                        birth_date: '',
                        age: parseInt(match[2], 10),
                        days_until_birthday: parseInt(match[3], 10),
                    });
                }
            }
        }
        return birthdays;
    }
    async getBirthdayCount() {
        return this.birthdaysList.locator('li, tr, [class*="item"]').count();
    }
    async hasBirthday(name) {
        const item = this.birthdaysList.filter({ hasText: name });
        return (await item.count()) > 0;
    }
    // ============================================================================
    // ИСТЕКАЮЩИЕ КОНТРАКТЫ
    // ============================================================================
    async getExpiringContracts() {
        const items = this.contractsList.locator('li, tr, [class*="item"]');
        const count = await items.count();
        const contracts = [];
        for (let i = 0; i < count; i++) {
            const item = items.nth(i);
            const text = await item.textContent();
            if (text) {
                const match = text.match(/(.+?)\s*—\s*(\d+)\s*дней/);
                if (match) {
                    contracts.push({
                        employee_id: 0,
                        name: match[1].trim(),
                        contract_end: '',
                        days_remaining: parseInt(match[2], 10),
                    });
                }
            }
        }
        return contracts;
    }
    async getExpiringContractCount() {
        return this.contractsList.locator('li, tr, [class*="item"]').count();
    }
    async hasExpiringContract(name) {
        const item = this.contractsList.filter({ hasText: name });
        return (await item.count()) > 0;
    }
    // ============================================================================
    // ГРАФИК ПО ОТДЕЛАМ
    // ============================================================================
    async getDepartmentChart() {
        return this.departmentChart;
    }
    async getDepartmentCount() {
        const bars = this.departmentChart.locator('[class*="bar"], [class*="slice"]');
        return bars.count();
    }
    // ============================================================================
    // ПРОВЕРКИ
    // ============================================================================
    async expectStatsVisible() {
        await expect(this.statsCards.first()).toBeVisible({ timeout: 5000 });
    }
    async expectBirthdaysVisible() {
        await expect(this.birthdaysList).toBeVisible({ timeout: 5000 });
    }
    async expectContractsVisible() {
        await expect(this.contractsList).toBeVisible({ timeout: 5000 });
    }
    async expectDepartmentChartVisible() {
        await expect(this.departmentChart).toBeVisible({ timeout: 5000 });
    }
}
