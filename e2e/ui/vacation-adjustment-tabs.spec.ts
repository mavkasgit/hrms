import { test, expect } from '../fixtures/index'

/**
 * Shallow coverage of vacation adjustment tabs (recall / postpone / extension).
 * URL + h1 + VacationSelector + «Создать приказ» — без OO domain actions.
 * Scout: scout-e2e-p1-ui-map.md §7
 *
 * Note: shared/ui/tabs is a custom Tabs (plain <button>), not Radix role=tab.
 */
const ADJUSTMENT_TABS = [
  {
    tabName: 'Отзыв из отпуска',
    path: '/vacations/recall',
    heading: 'Отзыв из отпуска',
  },
  {
    tabName: 'Перенос отпуска',
    path: '/vacations/postpone',
    heading: 'Перенос отпуска',
  },
  {
    tabName: 'Продление отпуска',
    path: '/vacations/extension',
    heading: 'Продление отпуска',
  },
] as const

test.describe('Vacation adjustment tabs @ui', () => {
  test.setTimeout(60_000)

  test('@ui vacations: recall / postpone / extension tabs open (shallow)', async ({
    page,
  }) => {
    await page.goto('/vacations')
    await expect(
      page.getByRole('heading', { name: 'Трудовой отпуск' })
    ).toBeVisible({ timeout: 15_000 })

    for (const tab of ADJUSTMENT_TABS) {
      // Custom TabsTrigger = <button>, not role=tab
      await page.getByRole('button', { name: tab.tabName }).click()
      await expect(page).toHaveURL(new RegExp(`${tab.path.replace(/\//g, '\\/')}(?:\\?.*)?$`))
      await expect(
        page.getByRole('heading', { name: tab.heading, exact: true })
      ).toBeVisible({ timeout: 10_000 })

      // Shared tab strip still present
      await expect(page.getByRole('button', { name: 'Создать трудовой отпуск' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Отзыв из отпуска' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Перенос отпуска' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Продление отпуска' })).toBeVisible()

      // VacationSelector search + primary action (disabled until vacation selected)
      await expect(page.getByPlaceholder(/поиск по сотруднику/i)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Создать приказ' })).toBeVisible()
    }
  })
})
