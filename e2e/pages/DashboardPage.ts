import { Page, Locator, expect } from '@playwright/test'
import type { DashboardStats, BirthdayEntry, ExpiringContract } from '../types'

/**
 * Page Object для страницы дашборда /
 */
export class DashboardPage {
  readonly page: Page
  readonly pageTitle: Locator
  readonly statsCards: Locator
  readonly birthdaysList: Locator
  readonly contractsList: Locator
  readonly departmentChart: Locator

  constructor(page: Page) {
    this.page = page
    this.pageTitle = page.getByRole('heading', { name: /дашборд|панель управления/i, level: 1 })
    this.statsCards = page.locator('[class*="stat"], [class*="Stat"]')
    this.birthdaysList = page.locator('[class*="birthday"], [class*="Birthday"]')
    this.contractsList = page.locator('[class*="contract"], [class*="Contract"]')
    this.departmentChart = page.locator('[class*="department"], [class*="Department"]')
  }

  async goto() {
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
    await expect(this.pageTitle.or(this.page.locator('h1').first())).toBeVisible({ timeout: 10000 })
  }

  // ============================================================================
  // СТАТИСТИКА
  // ============================================================================

  async getTotalEmployees(): Promise<number> {
    const card = this.statsCards.filter({ hasText: /всего сотрудников/i })
    const valueText = await card.locator('[class*="value"]').first().textContent()
    return valueText ? parseInt(valueText.trim(), 10) : 0
  }

  async getMaleCount(): Promise<number> {
    const card = this.statsCards.filter({ hasText: /мужчин/i })
    const valueText = await card.locator('[class*="value"]').first().textContent()
    return valueText ? parseInt(valueText.trim(), 10) : 0
  }

  async getFemaleCount(): Promise<number> {
    const card = this.statsCards.filter({ hasText: /женщин/i })
    const valueText = await card.locator('[class*="value"]').first().textContent()
    return valueText ? parseInt(valueText.trim(), 10) : 0
  }

  async getAverageAge(): Promise<number> {
    const card = this.statsCards.filter({ hasText: /средний возраст/i })
    const valueText = await card.locator('[class*="value"]').first().textContent()
    return valueText ? parseFloat(valueText.trim()) : 0
  }

  async getAverageExperience(): Promise<number> {
    const card = this.statsCards.filter({ hasText: /средний стаж/i })
    const valueText = await card.locator('[class*="value"]').first().textContent()
    return valueText ? parseFloat(valueText.trim()) : 0
  }

  async getStats(): Promise<DashboardStats> {
    return {
      total_employees: await this.getTotalEmployees(),
      male_count: await this.getMaleCount(),
      female_count: await this.getFemaleCount(),
      average_age: await this.getAverageAge(),
      average_experience: await this.getAverageExperience(),
    }
  }

  // ============================================================================
  // ДНИ РОЖДЕНИЯ
  // ============================================================================

  async getBirthdaysList(): Promise<BirthdayEntry[]> {
    const items = this.birthdaysList.locator('li, tr, [class*="item"]')
    const count = await items.count()
    const birthdays: BirthdayEntry[] = []

    for (let i = 0; i < count; i++) {
      const item = items.nth(i)
      const text = await item.textContent()
      if (text) {
        // Парсим текст для получения данных
        const match = text.match(/(.+?)\s*—\s*(\d+)\s*лет\s*\((\d+)\s*дней\)/)
        if (match) {
          birthdays.push({
            employee_id: 0,
            name: match[1].trim(),
            birth_date: '',
            age: parseInt(match[2], 10),
            days_until_birthday: parseInt(match[3], 10),
          })
        }
      }
    }
    return birthdays
  }

  async getBirthdayCount(): Promise<number> {
    return this.birthdaysList.locator('li, tr, [class*="item"]').count()
  }

  async hasBirthday(name: string): Promise<boolean> {
    const item = this.birthdaysList.filter({ hasText: name })
    return (await item.count()) > 0
  }

  // ============================================================================
  // ИСТЕКАЮЩИЕ КОНТРАКТЫ
  // ============================================================================

  async getExpiringContracts(): Promise<ExpiringContract[]> {
    const items = this.contractsList.locator('li, tr, [class*="item"]')
    const count = await items.count()
    const contracts: ExpiringContract[] = []

    for (let i = 0; i < count; i++) {
      const item = items.nth(i)
      const text = await item.textContent()
      if (text) {
        const match = text.match(/(.+?)\s*—\s*(\d+)\s*дней/)
        if (match) {
          contracts.push({
            employee_id: 0,
            name: match[1].trim(),
            contract_end: '',
            days_remaining: parseInt(match[2], 10),
          })
        }
      }
    }
    return contracts
  }

  async getExpiringContractCount(): Promise<number> {
    return this.contractsList.locator('li, tr, [class*="item"]').count()
  }

  async hasExpiringContract(name: string): Promise<boolean> {
    const item = this.contractsList.filter({ hasText: name })
    return (await item.count()) > 0
  }

  // ============================================================================
  // ГРАФИК ПО ОТДЕЛАМ
  // ============================================================================

  async getDepartmentChart(): Promise<Locator> {
    return this.departmentChart
  }

  async getDepartmentCount(): Promise<number> {
    const bars = this.departmentChart.locator('[class*="bar"], [class*="slice"]')
    return bars.count()
  }

  // ============================================================================
  // ПРОВЕРКИ
  // ============================================================================

  async expectStatsVisible() {
    await expect(this.statsCards.first()).toBeVisible({ timeout: 5000 })
  }

  async expectBirthdaysVisible() {
    await expect(this.birthdaysList).toBeVisible({ timeout: 5000 })
  }

  async expectContractsVisible() {
    await expect(this.contractsList).toBeVisible({ timeout: 5000 })
  }

  async expectDepartmentChartVisible() {
    await expect(this.departmentChart).toBeVisible({ timeout: 5000 })
  }
}
