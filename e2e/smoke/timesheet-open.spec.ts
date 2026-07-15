import { test, expect } from '../fixtures/index'

test.describe('Timesheet @smoke', () => {
  test.setTimeout(45_000)

  test('@smoke timesheet: page loads month view', async ({ page }) => {
    await page.goto('/timesheet')
    await expect(
      page.getByRole('heading', { name: /Табель учёта/i, level: 1 })
    ).toBeVisible({ timeout: 15_000 })

    // Month controls / grid shell
    const monthNav = page.getByRole('button', { name: /предыдущ|следующ|назад|вперёд/i })
    const monthLabel = page.getByText(
      /январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|\d{4}/i
    )
    const table = page.locator('table').first()
    const empty = page.getByText(/нет данных/i)

    await expect(
      monthNav
        .or(monthLabel)
        .or(table)
        .or(empty)
        .first()
    ).toBeVisible({ timeout: 15_000 })
  })
})
