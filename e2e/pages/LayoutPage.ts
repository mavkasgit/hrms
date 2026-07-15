import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Sidebar / layout navigation for smoke (real labels from shared/ui/sidebar.tsx).
 */
export class LayoutPage {
  readonly page: Page
  readonly sidebar: Locator

  constructor(page: Page) {
    this.page = page
    this.sidebar = page.locator('aside')
  }

  async gotoHome() {
    await this.page.goto('/')
    await expect(this.sidebar.getByRole('heading', { name: 'HRMS' })).toBeVisible({
      timeout: 15_000,
    })
  }

  navLink(label: string | RegExp): Locator {
    return this.sidebar.getByRole('link', { name: label })
  }

  async openNav(label: string | RegExp) {
    await this.navLink(label).click()
  }
}

/** Main top-level nav items → expected main heading (level 1) after open. */
export const MAIN_NAV_TARGETS: Array<{
  label: string
  path: string
  heading: string | RegExp
}> = [
  { label: 'Дашборд', path: '/', heading: /^Дашборд$/ },
  { label: 'Сотрудники', path: '/employees', heading: /^Сотрудники$/ },
  { label: 'Табель учёта', path: '/timesheet', heading: /Табель учёта/i },
  { label: 'Структура', path: '/structure', heading: /Структура компании/i },
  { label: 'Приказы', path: '/orders', heading: /^Приказы$/ },
  { label: 'Трудовой отпуск', path: '/vacations', heading: /^Трудовой отпуск$/ },
  { label: 'Календарь отпусков', path: '/vacation-calendar', heading: /Календарь/i },
  { label: 'Настройки', path: '/settings', heading: /Настройки/i },
]
