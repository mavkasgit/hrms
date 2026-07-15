import { test, expect } from '../fixtures/index'

test.describe('Orders @smoke', () => {
  test.setTimeout(45_000)

  test('@smoke orders: page loads list shell', async ({ page }) => {
    await page.goto('/orders')
    await expect(
      page.getByRole('heading', { name: /^Приказы$/, level: 1 })
    ).toBeVisible({ timeout: 15_000 })

    // Shell: create form area or table / empty state
    const table = page.locator('table').first()
    const empty = page.getByText(/приказы не найдены|нет приказов/i)
    await expect(table.or(empty).first()).toBeVisible({ timeout: 15_000 })
  })
})
