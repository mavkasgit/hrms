import { test, expect } from '../fixtures/index'
import { LayoutPage, MAIN_NAV_TARGETS } from '../pages/LayoutPage'

test.describe('Sidebar navigation @smoke', () => {
  test.setTimeout(60_000)

  test('@smoke nav: main sidebar items open pages', async ({ page }) => {
    const layout = new LayoutPage(page)
    await layout.gotoHome()

    await expect(page.locator('main')).toBeVisible()

    for (const item of MAIN_NAV_TARGETS) {
      await layout.openNav(item.label)
      if (item.path === '/') {
        await expect(page).toHaveURL(/\/(?:\?.*)?$/)
      } else {
        await expect(page).toHaveURL(new RegExp(item.path.replace('/', '\\/')))
      }
      await expect(
        page.getByRole('heading', { name: item.heading, level: 1 })
      ).toBeVisible({ timeout: 15_000 })
    }
  })
})
