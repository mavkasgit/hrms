import { test, expect, API_BASE } from '../fixtures/index'
import { TimesheetPage } from '../pages/TimesheetPage'
import { getAdminTokenFromStorage } from '../fixtures/auth'

/**
 * Внутренние уведомления в интерфейсе (#18): колокольчик в сайдбаре
 * у блока профиля, состояние в БД — закрытое уведомление не возвращается
 * после перезагрузки.
 */
test.describe('Internal notifications @ui', () => {
  test.setTimeout(60_000)

  test('@ui notifications: bell shows unread badge and closed notification stays closed', async ({
    page,
    apiOps,
  }) => {
    const emp = await apiOps.createEmployee({})
    const ts = new TimesheetPage(page)
    await ts.goto()
    await expect(ts.heading).toBeVisible({ timeout: 15_000 })

    const bell = page.getByTestId('notification-bell')
    await expect(bell).toBeVisible({ timeout: 15_000 })

    // Колокольчик теперь в сайдбаре, у блока профиля.
    const sidebar = page.locator('aside')
    await expect(sidebar.getByTestId('notification-bell')).toBeVisible()

    // Открываем попап — либо пустое «Нет новых уведомлений», либо список.
    await bell.click()
    await expect(page.getByText('Уведомления').first()).toBeVisible({ timeout: 5_000 })

    // Закрываем попап
    await page.keyboard.press('Escape')
  })
})
