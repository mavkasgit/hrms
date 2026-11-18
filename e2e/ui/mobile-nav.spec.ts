import { test, expect } from '../fixtures/index'
import { MobileNavPage } from '../pages/MobileNavPage'

/**
 * Мобильная навигация (< 1024px): верхняя панель с бургером,
 * скрытый desktop-сайдбар и выдвижной drawer.
 */
test.describe('Mobile navigation @ui', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('@ui mobile nav: burger opens drawer, desktop sidebar hidden', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()

    await expect(nav.topBar).toBeVisible()
    await expect(nav.bell).toBeVisible()
    await expect(nav.desktopSidebar).toHaveCount(0)

    await nav.open()
    await nav.closeWithButton()
  })

  test('@ui mobile nav: close button returns focus to burger', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()
    await nav.open()

    await nav.closeWithButton()
    await expect(nav.burger).toBeFocused()
  })

  test('@ui mobile nav: Escape closes drawer and returns focus to burger', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()
    await nav.open()

    await page.keyboard.press('Escape')
    await expect(nav.drawer).toBeHidden()
    await expect(nav.burger).toBeFocused()
  })

  test('@ui mobile nav: link navigates and closes drawer', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()
    await nav.open()

    await nav.navLink('Сотрудники').click()
    await expect(page).toHaveURL(/\/employees/)
    await expect(nav.drawer).toBeHidden()
  })

  test('@ui mobile nav: backdrop click closes drawer', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()
    await nav.open()

    await nav.closeWithBackdrop()
  })

  test('@ui mobile nav: "Черновики" из afterNav закрывает drawer', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()
    await nav.open()

    await nav.navLink('Черновики').click()
    await expect(page).toHaveURL(/\/drafts/)
    await expect(nav.drawer).toBeHidden()
  })

  test('@ui mobile nav: all main entries are visible in drawer', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()
    await nav.open()

    for (const label of [
      'Дашборд',
      'Сотрудники',
      'Табель учёта',
      'Структура',
      'Приказы',
      'Трудовой отпуск',
      'Календарь отпусков',
      'Настройки',
    ]) {
      await expect(nav.navLink(label)).toBeVisible()
    }
  })

  test('@ui mobile nav: bell in top bar opens notifications popover', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()

    await nav.bell.click()
    await expect(nav.notificationPopover).toBeVisible()
  })

  test('@ui mobile nav: profile click closes drawer, then opens settings', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await nav.gotoHome()
    await nav.open()

    await nav.profileButton().click()
    await expect(nav.drawer).toBeHidden()
    await expect(nav.settingsDialog).toBeVisible()
  })

  test('@ui mobile nav: prefers-reduced-motion отключает анимацию drawer', async ({ page }) => {
    const nav = new MobileNavPage(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await nav.gotoHome()
    await nav.open()

    const animationName = await nav.drawer.evaluate(
      (el) => getComputedStyle(el).animationName
    )
    expect(animationName).toBe('none')
  })

  test.describe('desktop guard', () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test('@ui mobile nav: desktop keeps sidebar, no burger or top bar', async ({ page }) => {
      await page.goto('/')

      await expect(page.getByRole('complementary')).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('banner')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Открыть меню' })).toHaveCount(0)
    })
  })
})
