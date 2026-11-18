import { type Page, type Locator, expect } from '@playwright/test'

/**
 * Мобильная навигация: верхняя панель с бургером + выдвижной drawer.
 * Используется только в спеках с мобильным viewport.
 */
export class MobileNavPage {
  readonly page: Page
  readonly burger: Locator
  readonly drawer: Locator
  readonly topBar: Locator
  readonly overlay: Locator
  readonly desktopSidebar: Locator
  readonly settingsDialog: Locator
  readonly bell: Locator
  readonly notificationPopover: Locator

  constructor(page: Page) {
    this.page = page
    this.burger = page.getByRole('button', { name: 'Открыть меню' })
    this.drawer = page.getByRole('dialog', { name: 'Навигация' })
    this.topBar = page.getByRole('banner')
    this.overlay = page.getByTestId('mobile-nav-overlay')
    this.desktopSidebar = page.getByRole('complementary')
    this.settingsDialog = page.getByRole('dialog', { name: 'Профиль' })
    this.bell = this.topBar.getByTestId('notification-bell')
    this.notificationPopover = page.getByTestId('notification-popover')
  }

  async gotoHome() {
    await this.page.goto('/')
    await this.waitForReady()
  }

  async waitForReady() {
    await expect(this.burger).toBeVisible({ timeout: 15_000 })
  }

  async open() {
    await this.burger.click()
    await expect(this.drawer).toBeVisible({ timeout: 10_000 })
  }

  async closeWithButton() {
    await this.drawer.getByRole('button', { name: 'Закрыть меню' }).click()
    await expect(this.drawer).toBeHidden()
  }

  async closeWithBackdrop() {
    const box = await this.overlay.boundingBox()
    if (!box) throw new Error('Overlay мобильной навигации не отрисован')
    await this.overlay.click({ position: { x: box.width - 10, y: box.height / 2 } })
    await expect(this.drawer).toBeHidden()
  }

  navLink(label: string | RegExp): Locator {
    return this.drawer.getByRole('link', { name: label })
  }

  profileButton(): Locator {
    return this.drawer.getByTitle('Настройки профиля').first()
  }
}
