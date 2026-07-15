import { test, expect } from '../fixtures/index'

/**
 * Timesheet UI beyond smoke/timesheet-open (page shell):
 * sidebar, mode tabs, import modal, import history, legend, month nav.
 * Legacy: timesheet.spec.ts (7 intents).
 */
test.describe('Timesheet @ui', () => {
  test.setTimeout(45_000)

  test('@ui timesheet: page heading visible', async ({ page }) => {
    await page.goto('/timesheet')
    await expect(
      page.getByRole('heading', { name: 'Табель учёта рабочего времени' })
    ).toBeVisible({ timeout: 15_000 })
  })

  test('@ui timesheet: sidebar link present', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Табель учёта' })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('@ui timesheet: switch План / Факт / Совмещённый tabs', async ({ page }) => {
    await page.goto('/timesheet')
    // Custom TabsTrigger = plain <button>, not role=tab
    const planTab = page.getByRole('button', { name: 'План', exact: true })
    const factTab = page.getByRole('button', { name: 'Факт', exact: true })
    const mergedTab = page.getByRole('button', { name: 'Совмещённый', exact: true })

    await expect(planTab).toBeVisible({ timeout: 15_000 })
    await expect(factTab).toBeVisible()
    await expect(mergedTab).toBeVisible()

    await factTab.click()
    await expect(factTab).toHaveClass(/shadow-sm|bg-background/)
    await mergedTab.click()
    await expect(mergedTab).toHaveClass(/shadow-sm|bg-background/)
    await planTab.click()
    await expect(planTab).toHaveClass(/shadow-sm|bg-background/)
  })

  test('@ui timesheet: import button opens turnstile modal', async ({ page }) => {
    await page.goto('/timesheet')
    await page.getByTestId('timesheet-import-button').click()
    await expect(page.getByText('Импорт журнала турникетов')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Нажмите для выбора .xlsx файла')).toBeVisible()
  })

  test('@ui timesheet: month navigation controls respond', async ({ page }) => {
    await page.goto('/timesheet')
    await expect(
      page.getByRole('heading', { name: /Табель учёта/i })
    ).toBeVisible({ timeout: 15_000 })

    // Prefer accessible month arrows; fall back to icon-only prev/next buttons
    const prev =
      page.getByRole('button', { name: /предыдущ|назад|prev/i }).first()
    const next =
      page.getByRole('button', { name: /следующ|вперёд|next/i }).first()

    if (await prev.isVisible().catch(() => false)) {
      await prev.click()
    } else if (await next.isVisible().catch(() => false)) {
      await next.click()
    } else {
      // Icon-only chevrons near month label (no accessible name)
      const iconNav = page.locator('button').filter({ has: page.locator('svg') }).first()
      await iconNav.click()
    }

    // Page remains stable after nav
    await expect(
      page.getByRole('heading', { name: /Табель учёта/i })
    ).toBeVisible()
  })

  test('@ui timesheet: import history dialog opens', async ({ page }) => {
    await page.goto('/timesheet')
    await page.getByRole('button', { name: 'История импортов' }).click()
    await expect(page.getByText('История импортов').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('@ui timesheet: color legend is present', async ({ page }) => {
    await page.goto('/timesheet')
    await expect(
      page.getByRole('heading', { name: /Табель учёта/i })
    ).toBeVisible({ timeout: 15_000 })
    // Legend labels from TimesheetPage (updated copy)
    await expect(page.getByText('Расхождение плана и факта').first()).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText('Выходной (Сб/Вс)').first()).toBeVisible()
    await expect(page.getByText('Праздничный день').first()).toBeVisible()
    await expect(page.getByText('Нерабочие статусы:').first()).toBeVisible()
    await expect(page.getByText('Отпуск').first()).toBeVisible()
    await expect(page.getByText('Больничный').first()).toBeVisible()
  })
})
